"use client";

import {
  CalendarDays,
  Info,
  List,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Tabs } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { DemoBadge } from "@/components/data-source";
import { AddToItinerary } from "@/components/itinerary/add-to-itinerary";
import { ItineraryPanel } from "@/components/itinerary/itinerary-panel";
import { useItinerary } from "@/components/itinerary/use-itinerary";
import { TripOverview } from "@/components/trip-overview";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LatLng } from "@/domain/geo";
import type { Place } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import { numberedStops } from "@/lib/itinerary-labels";
import { type MapPlace, placesInBounds, visiblePlaces } from "@/lib/map/layers";
import type { WorkspaceView } from "@/lib/map/store";
import { formatLongDate, travelersText } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import { BottomSheet, sheetHeights } from "./bottom-sheet";
import { LayerToggles } from "./layer-toggles";
import { MapFailure, type MapFailureReason } from "./map-failure";
import { HotelQuestions } from "./hotel-questions";
import { NearbyTransit, WalkableFrom } from "./nearby-questions";
import { PlaceDetail } from "./place-detail";
import { PlacesPanel } from "./places-panel";
import { type RouteOrigin, RouteComparator } from "./route-comparator";
import type { DayRoute } from "./trip-map";
import { useTripPlaces } from "./use-trip-places";
import { type Layout, MapUiProvider, useLayout, useMapUi } from "./workspace-context";

/** El mapa se carga de forma diferida (docs/DISENO.md): no bloquea el primer pintado. */
const TripMap = dynamic(() => import("./trip-map"), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" aria-hidden />,
});

const tripTitle = (trip: Trip) => trip.title ?? `Viaje a ${trip.destination.name}`;

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function TripWorkspace({ trip, mapStyleUrl }: { trip: Trip; mapStyleUrl: string }) {
  return (
    <MapUiProvider>
      <Workspace trip={trip} mapStyleUrl={mapStyleUrl} />
    </MapUiProvider>
  );
}

/** Días del viaje ("YYYY-MM-DD"), para elegir la salida del transporte público. */
function tripDays(trip: Trip) {
  const days: string[] = [];
  for (
    let day = new Date(`${trip.startDate}T00:00:00Z`);
    day <= new Date(`${trip.endDate}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

const samePoint = (a: LatLng, b: LatLng) =>
  a.lat.toFixed(5) === b.lat.toFixed(5) && a.lng.toFixed(5) === b.lng.toFixed(5);

function Workspace({ trip, mapStyleUrl }: { trip: Trip; mapStyleUrl: string }) {
  const layout = useLayout();
  const layers = useMapUi((state) => state.layers);
  const data = useTripPlaces(trip, { transport: layers.transport });
  const bounds = useMapUi((state) => state.bounds);
  const selectedId = useMapUi((state) => state.selectedId);
  const previousId = useMapUi((state) => state.previousId);
  const select = useMapUi((state) => state.select);
  const toggleLayer = useMapUi((state) => state.toggleLayer);
  const days = useMemo(() => tripDays(trip), [trip]);
  const [mapFailure, setMapFailure] = useState<MapFailureReason>();
  const itinerary = useItinerary(trip.id, { days: trip.days, meta: trip.itineraryMeta });
  const itineraryDate = useMapUi((state) => state.itineraryDate);
  const setItineraryDate = useMapUi((state) => state.setItineraryDate);
  const planDays = itinerary.data.days;
  const firstPlanDay = planDays.find((day) => day.activities.length > 0)?.date ?? planDays[0]?.date;
  const shownDate = itineraryDate ?? firstPlanDay;
  const shownDay = planDays.find((day) => day.date === shownDate);
  // Capa 5: la ruta del día se ve por defecto; el usuario puede ocultarla.
  const [dayRouteHidden, setDayRouteHidden] = useState(false);
  const dayRoute = useMemo<DayRoute | undefined>(
    () =>
      !dayRouteHidden && shownDay && shownDay.activities.length > 0
        ? {
            stops: numberedStops(shownDay),
            hotel: trip.hotel
              ? { name: trip.hotel.name, location: trip.hotel.location }
              : undefined,
          }
        : undefined,
    [dayRouteHidden, shownDay, trip.hotel],
  );
  // Lugares del plan (y sus alternativas) aunque su capa esté apagada: su ficha debe abrirse.
  const planPlaces = useMemo(() => {
    const list: Place[] = [];
    for (const day of planDays) {
      for (const activity of day.activities) {
        if (activity.place) list.push(activity.place);
        if (activity.planning?.alternative) list.push(activity.planning.alternative);
      }
    }
    for (const entry of itinerary.data.meta?.unscheduled ?? []) list.push(entry.place);
    return list;
  }, [planDays, itinerary.data.meta]);

  useEffect(() => {
    if (!hasWebGL()) setMapFailure("webgl");
  }, []);

  const placeResults = data.places.data?.results;
  const stopResults = layers.transport ? data.stops.data?.results : undefined;
  const results = useMemo(
    () => [...(placeResults ?? []), ...(stopResults ?? [])],
    [placeResults, stopResults],
  );
  const favorites = data.favorites.data;
  const items = useMemo(
    () => visiblePlaces(results ?? [], favorites ?? [], layers),
    [results, favorites, layers],
  );
  // Sin mapa no hay zona visible: la lista muestra todo el destino.
  const listItems = useMemo(
    () => placesInBounds(items, mapFailure ? undefined : bounds),
    [items, bounds, mapFailure],
  );
  const counts = useMemo(() => {
    const all = visiblePlaces(results ?? [], favorites ?? [], {
      tourism: true,
      food: true,
      lodging: true,
      transport: true,
      saved: true,
    });
    const count = (layer: Place["layer"]) =>
      all.filter((item) => item.place.layer === layer).length;
    return {
      tourism: count("tourism"),
      food: count("food"),
      lodging: count("lodging"),
      transport: stopResults ? count("transport") : undefined,
      saved: favorites?.length ?? 0,
    };
  }, [results, favorites, stopResults]);

  const selected = useMemo<MapPlace | undefined>(() => {
    const visible = items.find((item) => item.place.id === selectedId);
    if (visible) return visible;
    const planned = planPlaces.find((place) => place.id === selectedId);
    return planned ? { place: planned, layer: planned.layer, isFavorite: false } : undefined;
  }, [items, planPlaces, selectedId]);
  const mapItems = useMemo(
    () =>
      selected && !items.some((item) => item.place.id === selected.place.id)
        ? [...items, selected]
        : items,
    [items, selected],
  );
  const favoriteIds = new Set((favorites ?? []).map((place) => place.id));
  const previous = previousId
    ? [...results, ...(favorites ?? [])].find((place) => place.id === previousId)
    : undefined;
  const tourism = useMemo(() => results.filter((place) => place.layer === "tourism"), [results]);

  /** Elegir un lugar desde una respuesta (estación cercana, lugar a pie): enciende su capa. */
  const selectPlace = (place: Place) => {
    if (!layers[place.layer]) toggleLayer(place.layer);
    select(place.id, "list");
  };

  const routeOrigins = (target: Place): RouteOrigin[] => {
    const origins: RouteOrigin[] = [];
    if (trip.hotel && !samePoint(trip.hotel.location, target.location)) {
      origins.push({ key: "hotel", name: trip.hotel.name, location: trip.hotel.location });
    }
    if (previous && previous.id !== target.id && !samePoint(previous.location, target.location)) {
      origins.push({ key: "previous", name: previous.name, location: previous.location });
    }
    return origins;
  };
  const detail = selected ? (
    <PlaceDetail
      key={selected.place.id}
      place={selected.place}
      layer={selected.layer}
      headingLevel={layout === "desktop" ? 2 : 3}
      onClose={() => select(undefined, "list")}
      favorite={{
        isFavorite: favoriteIds.has(selected.place.id),
        pending: data.favoritePending,
        error: data.favoriteError,
        toggle: () => data.toggleFavorite(selected.place, !favoriteIds.has(selected.place.id)),
      }}
    >
      <AddToItinerary
        place={selected.place}
        itinerary={itinerary}
        preferredDate={shownDate}
        headingLevel={layout === "desktop" ? 3 : 4}
      />
      <RouteComparator
        destination={{ name: selected.place.name, location: selected.place.location }}
        origins={routeOrigins(selected.place)}
        tripDays={days}
        headingLevel={layout === "desktop" ? 3 : 4}
      />
      <section aria-label="Alrededores" className="flex flex-col gap-2 border-t pt-4">
        <NearbyTransit at={selected.place.location} onSelect={selectPlace} />
        <WalkableFrom
          origin={selected.place.location}
          originId={selected.place.id}
          candidates={tourism}
          onSelect={selectPlace}
        />
      </section>
    </PlaceDetail>
  ) : null;

  const mobileToggles = (
    <LayerToggles
      counts={counts}
      className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 pb-1"
    />
  );

  const usesDemoData =
    trip.destination.isDemo ||
    trip.hotel?.place?.isDemo === true ||
    data.places.data?.provider.isDemo === true;

  const panel = (
    <PlacesPanel
      items={listItems}
      total={items.length}
      places={data.places}
      stops={data.stops}
      favorites={data.favorites}
      mapAvailable={!mapFailure}
    />
  );
  const itineraryPanel = (
    <ItineraryPanel
      trip={trip}
      itinerary={itinerary}
      date={shownDate}
      onDateChange={(date) => {
        setDayRouteHidden(false);
        setItineraryDate(date);
      }}
      onSelectPlace={(place) => select(place.id, "list")}
      selectedPlaceId={selectedId}
      headingLevel={layout === "mobile" ? 3 : 2}
      routeShown={dayRoute !== undefined}
      onToggleRoute={() => {
        if (dayRouteHidden) setItineraryDate(shownDate);
        setDayRouteHidden(!dayRouteHidden);
      }}
    />
  );
  const overview = (
    <div className="flex flex-col gap-3">
      {trip.hotel ? (
        <HotelQuestions hotel={trip.hotel} tourism={tourism} onSelect={selectPlace} />
      ) : null}
      <TripOverview trip={trip} />
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem-1px)] flex-col overflow-hidden">
      <header className="flex min-h-12 shrink-0 items-center gap-x-3 gap-y-0.5 border-b px-4 py-1.5 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <h1 className="truncate text-lg leading-tight font-semibold tracking-tight">
            {tripTitle(trip)}
          </h1>
          <p className="text-muted-foreground truncate text-xs sm:text-sm">
            {formatLongDate(trip.startDate)} – {formatLongDate(trip.endDate)}
            <span className="hidden sm:inline"> · {travelersText(trip.travelers)}</span>
          </p>
        </div>
        {usesDemoData ? <DemoBadge className="shrink-0" /> : null}
      </header>

      <Layouts
        layout={layout}
        map={
          <MapArea
            trip={trip}
            styleUrl={mapStyleUrl}
            items={mapItems}
            dayRoute={dayRoute}
            area={data.area}
            failure={mapFailure}
            onFailure={setMapFailure}
            loading={data.places.isLoading}
            layout={layout}
            toggles={
              layout === "mobile" ? null : <LayerToggles counts={counts} className="flex-wrap" />
            }
          />
        }
        list={panel}
        itinerary={itineraryPanel}
        overview={overview}
        detail={detail}
        mobileToggles={mobileToggles}
        mobileMapContent={
          <div className="flex flex-col gap-3">
            {mobileToggles}
            {detail ?? <MapHint count={listItems.length} loading={data.places.isLoading} />}
          </div>
        }
      />
    </div>
  );
}

function MapHint({ count, loading }: { count: number; loading: boolean }) {
  const setView = useMapUi((state) => state.setView);
  if (loading) return <p className="text-muted-foreground text-sm">Cargando lugares…</p>;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {count === 1 ? "1 lugar a la vista" : `${count} lugares a la vista`}. Toca un marcador para
        ver su ficha.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 shrink-0"
        onClick={() => setView("list")}
      >
        Ver lista
      </Button>
    </div>
  );
}

function MapArea({
  trip,
  styleUrl,
  items,
  area,
  failure,
  onFailure,
  loading,
  layout,
  toggles,
  dayRoute,
}: {
  trip: Trip;
  styleUrl: string;
  items: ReturnType<typeof visiblePlaces>;
  dayRoute?: DayRoute;
  area: [number, number, number, number];
  failure?: MapFailureReason;
  onFailure: (reason: MapFailureReason) => void;
  loading: boolean;
  layout: Layout;
  toggles: React.ReactNode;
}) {
  const sheet = useMapUi((state) => state.sheet);
  const [available, setAvailable] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setAvailable(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const bottomInset =
    layout === "mobile" && available
      ? Math.min(sheetHeights(available)[sheet], available * 0.5)
      : 0;

  return (
    <div ref={ref} className="bg-muted relative h-full w-full overflow-hidden">
      {failure ? (
        <MapFailure reason={failure} center={trip.destination.location} />
      ) : (
        <TripMap
          center={trip.destination.location}
          area={area}
          items={items}
          styleUrl={styleUrl}
          bottomInset={bottomInset}
          attributionPosition={layout === "mobile" ? "top-right" : "bottom-right"}
          onFailure={onFailure}
          dayRoute={dayRoute}
        />
      )}
      {toggles ? (
        <div className="absolute top-3 left-3 z-[1] max-w-[calc(100%-5rem)]">{toggles}</div>
      ) : null}
      {loading ? (
        <p
          role="status"
          className="bg-card absolute top-3 left-1/2 z-[1] -translate-x-1/2 rounded-full border px-3 py-1.5 text-sm shadow-sm max-md:top-auto max-md:bottom-44"
        >
          Cargando lugares…
        </p>
      ) : null}
    </div>
  );
}

const VIEW_TABS: { view: WorkspaceView; label: string; icon: typeof MapIcon }[] = [
  { view: "map", label: "Mapa", icon: MapIcon },
  { view: "list", label: "Lista", icon: List },
  { view: "itinerary", label: "Itinerario", icon: CalendarDays },
  { view: "trip", label: "Viaje", icon: Info },
];

function Layouts({
  layout,
  map,
  list,
  itinerary,
  overview,
  detail,
  mobileMapContent,
  mobileToggles,
}: {
  layout: Layout;
  map: React.ReactNode;
  list: React.ReactNode;
  itinerary: React.ReactNode;
  overview: React.ReactNode;
  detail: React.ReactNode;
  mobileMapContent: React.ReactNode;
  mobileToggles: React.ReactNode;
}) {
  const view = useMapUi((state) => state.view);
  const setView = useMapUi((state) => state.setView);
  const sheet = useMapUi((state) => state.sheet);
  const setSheet = useMapUi((state) => state.setSheet);
  const selectedId = useMapUi((state) => state.selectedId);
  const [available, setAvailable] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<"list" | "itinerary" | "trip">("list");
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = mobileRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setAvailable(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [layout]);

  const tabs = (
    <PanelTabs
      value={tab}
      onChange={setTab}
      list={list}
      itinerary={itinerary}
      overview={overview}
    />
  );

  if (layout === "mobile") {
    const content =
      view === "map" ? (
        mobileMapContent
      ) : view === "list" ? (
        <div className="flex flex-col gap-3">
          {mobileToggles}
          {list}
        </div>
      ) : view === "itinerary" ? (
        itinerary
      ) : (
        overview
      );
    const label = VIEW_TABS.find((item) => item.view === view)?.label ?? "Mapa";
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={mobileRef} className="relative min-h-0 flex-1">
          {/* Con el sheet desplegado el mapa queda tapado: fuera del foco y de la accesibilidad. */}
          <div className="absolute inset-0" inert={sheet === "full"}>
            {map}
          </div>
          {available > 0 ? (
            <BottomSheet
              snap={sheet}
              onSnap={setSheet}
              available={available}
              label={`Panel: ${label}`}
              contentKey={`${view}:${selectedId ?? ""}`}
            >
              {view !== "map" ? <h2 className="mb-3 text-base font-semibold">{label}</h2> : null}
              {content}
            </BottomSheet>
          ) : null}
        </div>
        <nav
          aria-label="Vistas del viaje"
          className="bg-card shrink-0 border-t pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="grid grid-cols-4">
            {VIEW_TABS.map(({ view: item, label: text, icon: Icon }) => (
              <li key={item}>
                <button
                  type="button"
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                  className={cn(
                    "focus-visible:ring-ring/50 flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-inset",
                    view === item ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full",
                      view === item && "bg-accent",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  {text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    );
  }

  if (layout === "tablet") {
    return (
      <div
        className={cn(
          "grid min-h-0 flex-1",
          panelOpen ? "grid-cols-[22rem_1fr]" : "grid-cols-[0_1fr]",
        )}
      >
        <aside
          id="trip-panel"
          aria-label="Panel del viaje"
          hidden={!panelOpen}
          className="bg-card min-h-0 overflow-y-auto border-r px-4 py-4"
        >
          {detail ?? tabs}
        </aside>
        <div className="relative min-h-0">
          {map}
          <Button
            variant="outline"
            size="icon"
            aria-expanded={panelOpen}
            aria-controls="trip-panel"
            className="bg-card absolute bottom-6 left-3 z-[1] size-11 shadow-sm"
            onClick={() => setPanelOpen((open) => !open)}
          >
            {panelOpen ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
            <span className="sr-only">{panelOpen ? "Ocultar panel" : "Mostrar panel"}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[21rem_1fr_24rem]">
      <aside
        aria-label="Panel del viaje"
        className="bg-card min-h-0 overflow-y-auto border-r px-4 py-4"
      >
        {tabs}
      </aside>
      <div className="relative min-h-0">{map}</div>
      <aside
        aria-label="Detalle del lugar"
        className="bg-card min-h-0 overflow-y-auto border-l px-5 py-5"
      >
        {detail ?? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <MapIcon className="text-muted-foreground size-7" aria-hidden />
            <h2 className="font-medium">Ningún lugar seleccionado</h2>
            <p className="text-muted-foreground text-sm">
              Elige un marcador en el mapa o un lugar de la lista para ver su ficha y guardarlo.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function PanelTabs({
  value,
  onChange,
  list,
  itinerary,
  overview,
}: {
  value: "list" | "itinerary" | "trip";
  onChange: (value: "list" | "itinerary" | "trip") => void;
  list: React.ReactNode;
  itinerary: React.ReactNode;
  overview: React.ReactNode;
}) {
  const trigger =
    "focus-visible:ring-ring/50 data-[state=active]:bg-card data-[state=active]:text-foreground text-muted-foreground min-h-10 flex-1 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-3 data-[state=active]:shadow-xs";
  return (
    <Tabs.Root value={value} onValueChange={(next) => onChange(next as typeof value)}>
      <Tabs.List
        aria-label="Contenido del panel"
        className="bg-muted mb-4 flex gap-1 rounded-lg p-1"
      >
        <Tabs.Trigger value="list" className={trigger}>
          Lista
        </Tabs.Trigger>
        <Tabs.Trigger value="itinerary" className={trigger}>
          Itinerario
        </Tabs.Trigger>
        <Tabs.Trigger value="trip" className={trigger}>
          Viaje
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="list" className="outline-none">
        {list}
      </Tabs.Content>
      <Tabs.Content value="itinerary" className="outline-none">
        {itinerary}
      </Tabs.Content>
      <Tabs.Content value="trip" className="outline-none">
        {overview}
      </Tabs.Content>
    </Tabs.Root>
  );
}
