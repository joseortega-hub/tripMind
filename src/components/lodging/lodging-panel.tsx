"use client";

import {
  Accessibility,
  BedDouble,
  ChevronDown,
  ExternalLink,
  Globe,
  MapPin,
  SlidersHorizontal,
  Star,
  TramFront,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { DataSource } from "@/components/data-source";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/wizard/field";
import {
  DEFAULT_LODGING_WEIGHTS,
  type LodgingCandidate,
  type LodgingFilters,
  type LodgingScoreKey,
  type LodgingSort,
  type LodgingWeights,
  LodgingWeightsSchema,
} from "@/domain/lodging";
import type { Place } from "@/domain/place";
import type { LodgingType } from "@/domain/preferences";
import type { Trip } from "@/domain/trip";
import { ApiError } from "@/lib/api-client";
import { availabilityLinks } from "@/lib/lodging/links";
import {
  type DistanceBasis,
  proximityValue,
  type RankedLodging,
  rankLodging,
} from "@/lib/lodging/score";
import { CATEGORY_LABELS } from "@/lib/map/layers";
import { formatDistance, formatDuration } from "@/lib/route-labels";
import { cn } from "@/lib/utils";
import { type LodgingResponse, useChooseHotel, useLodging } from "./use-lodging";
import { LodgingServices } from "./lodging-services";

const SORT_LABELS: Record<LodgingSort, string> = {
  score: "Puntuación",
  location: "Ubicación (cerca del plan)",
  transport: "Acceso a transporte",
  location_transport: "Ubicación y transporte",
};

export const SCORE_LABELS: Record<LodgingScoreKey, string> = {
  budget: "Presupuesto",
  proximity: "Cerca del itinerario",
  transport: "Transporte",
  preferences: "Tus preferencias",
};

/** Color de cada componente en la barra (mismos tokens que el mapa: se distinguen también por texto). */
const SCORE_COLORS: Record<LodgingScoreKey, string> = {
  budget: "bg-cta",
  proximity: "bg-primary",
  transport: "bg-layer-transport",
  preferences: "bg-layer-lodging",
};

const TYPE_LABELS: Record<LodgingType, string> = {
  hotel: "Hotel",
  hostel: "Hostal o albergue",
  apartment: "Apartamento",
  other: "Casa de huéspedes",
};

const WEIGHTS_STORAGE = "tripmind:lodging-weights";

function loadWeights(): LodgingWeights {
  try {
    const raw = window.localStorage.getItem(WEIGHTS_STORAGE);
    const parsed = raw ? LodgingWeightsSchema.safeParse(JSON.parse(raw)) : undefined;
    return parsed?.success ? parsed.data : DEFAULT_LODGING_WEIGHTS;
  } catch {
    return DEFAULT_LODGING_WEIGHTS;
  }
}

function initialFilters(trip: Trip): LodgingFilters {
  const prefs = trip.accommodationPreferences;
  return {
    types: prefs?.types ?? [],
    minStars: prefs?.minStars,
    accessibleOnly: prefs?.accessible ?? false,
  };
}

const proximityText = (candidate: LodgingCandidate, basis: DistanceBasis) => {
  const value = proximityValue(candidate, basis);
  if (value === undefined) return undefined;
  return basis === "walk"
    ? `${formatDuration(value)} a pie de media`
    : `${formatDistance(value)} de media en línea recta`;
};

const stationText = (candidate: LodgingCandidate) => {
  const { station } = candidate;
  if (!station) return undefined;
  return station.walkMinutes !== undefined
    ? `${formatDuration(station.walkMinutes)} a pie`
    : `${formatDistance(station.straightLineMeters)} en línea recta`;
};

/**
 * Alojamiento (REQUISITOS §7 y §14A): compara alojamientos reales de OSM por ubicación respecto
 * al plan y acceso a transporte, con puntuación de pesos ajustables, y elige el hotel del viaje.
 */
export function LodgingPanel({
  trip,
  headingLevel = 2,
  onShowOnMap,
  selectedPlaceId,
}: {
  trip: Trip;
  headingLevel?: 2 | 3;
  onShowOnMap: (place: Place) => void;
  selectedPlaceId?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [filters, setFilters] = useState<LodgingFilters>(() => initialFilters(trip));
  const [sort, setSort] = useState<LodgingSort>("score");
  const [weights, setWeights] = useState<LodgingWeights>(DEFAULT_LODGING_WEIGHTS);
  const query = useLodging(trip.id, filters);
  const chooser = useChooseHotel(trip.id);

  // Los pesos se recuerdan en este navegador (conveniencia; si no hay almacenamiento, por defecto).
  useEffect(() => setWeights(loadWeights()), []);
  const updateWeights = (next: LodgingWeights) => {
    setWeights(next);
    try {
      window.localStorage.setItem(WEIGHTS_STORAGE, JSON.stringify(next));
    } catch {
      // Sin almacenamiento local los pesos duran lo que la página.
    }
  };

  const data = query.data;
  const ranked = useMemo(
    () =>
      data
        ? rankLodging(data.candidates, sort, {
            weights,
            preferences: trip.accommodationPreferences,
            stationRadiusMeters: data.stationRadiusMeters,
          })
        : undefined,
    [data, sort, weights, trip.accommodationPreferences],
  );
  const current = ranked?.items.find((item) => item.candidate.isCurrent);
  const others = ranked?.items.filter((item) => !item.candidate.isCurrent) ?? [];

  return (
    <div className="flex flex-col gap-4" data-testid="lodging-panel">
      <CurrentHotel
        trip={trip}
        current={current}
        basis={ranked?.proximity ?? "straight"}
        Heading={Heading}
        onShowOnMap={onShowOnMap}
      />

      {chooser.message ? (
        <p
          role={chooser.message.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-md border-l-4 px-3 py-2 text-sm",
            chooser.message.tone === "error"
              ? "border-destructive text-destructive bg-destructive/5"
              : "border-primary bg-accent",
          )}
        >
          {chooser.message.text}
        </p>
      ) : null}

      <section aria-labelledby="lodging-compare-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Heading id="lodging-compare-title" className="text-base font-semibold">
            {trip.hotel ? "Comparar con otros alojamientos" : "Elige dónde dormir"}
          </Heading>
        </div>

        <p className="text-muted-foreground text-sm">
          Alojamientos reales de OpenStreetMap. Sin precios ni valoraciones (no hay proveedor
          autorizado): cada uno enlaza a buscadores con tus fechas.
        </p>

        <div className="grid grid-cols-1 gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ordenar por
            <NativeSelect
              value={sort}
              onChange={(event) => setSort(event.target.value as LodgingSort)}
            >
              {(Object.keys(SORT_LABELS) as LodgingSort[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
              <option disabled>Precio o valoración (sin proveedor)</option>
            </NativeSelect>
          </label>
          <Disclosure icon={SlidersHorizontal} label="Filtros" summary={filtersSummary(filters)}>
            <FiltersForm filters={filters} onChange={setFilters} />
          </Disclosure>
          <Disclosure icon={Star} label="Ajustar la puntuación" summary={weightsSummary(weights)}>
            <WeightsForm weights={weights} onChange={updateWeights} />
          </Disclosure>
        </div>

        <LodgingResults
          query={query}
          ranked={others}
          basis={ranked?.proximity ?? "straight"}
          trip={trip}
          chooser={chooser}
          onShowOnMap={onShowOnMap}
          selectedPlaceId={selectedPlaceId}
          onClearFilters={() => setFilters({ types: [], accessibleOnly: false })}
          rowHeading={headingLevel === 2 ? "h3" : "h4"}
        />
      </section>
    </div>
  );
}

function filtersSummary(filters: LodgingFilters) {
  const parts = [
    ...filters.types.map((type) => TYPE_LABELS[type]),
    filters.minStars ? `${filters.minStars}★ o más` : undefined,
    filters.accessibleOnly ? "accesible" : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Todos";
}

function weightsSummary(weights: LodgingWeights) {
  const same = (Object.keys(weights) as LodgingScoreKey[]).every(
    (key) => weights[key] === DEFAULT_LODGING_WEIGHTS[key],
  );
  return same ? "Por defecto" : "Personalizada";
}

function Disclosure({
  icon: Icon,
  label,
  summary,
  children,
}: {
  icon: typeof Star;
  label: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium outline-none focus-visible:ring-3"
      >
        <Icon aria-hidden className="text-muted-foreground size-4" />
        <span className="flex-1">{label}</span>
        <span className="text-muted-foreground truncate font-normal">{summary}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={id} hidden={!open} className="border-t px-3 py-3">
        {children}
      </div>
    </div>
  );
}

function FiltersForm({
  filters,
  onChange,
}: {
  filters: LodgingFilters;
  onChange: (filters: LodgingFilters) => void;
}) {
  const toggleType = (type: LodgingType) =>
    onChange({
      ...filters,
      types: filters.types.includes(type)
        ? filters.types.filter((item) => item !== type)
        : [...filters.types, type],
    });
  const accessibleId = useId();
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as LodgingType[]).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={filters.types.includes(type)}
              onClick={() => toggleType(type)}
              className={cn(
                "focus-visible:ring-ring/50 min-h-11 rounded-full border px-3 text-sm outline-none focus-visible:ring-3",
                filters.types.includes(type)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card",
              )}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">Sin ninguno marcado se muestran todos.</p>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Categoría mínima
        <NativeSelect
          value={filters.minStars ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              minStars: event.target.value ? Number(event.target.value) : undefined,
            })
          }
        >
          <option value="">Cualquiera</option>
          {[1, 2, 3, 4, 5].map((stars) => (
            <option key={stars} value={stars}>
              {stars} estrella{stars > 1 ? "s" : ""} o más
            </option>
          ))}
        </NativeSelect>
        <span className="text-muted-foreground text-xs font-normal">
          Solo los que tienen estrellas registradas en OpenStreetMap.
        </span>
      </label>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={accessibleId} className="text-sm font-medium">
          Solo accesibles en silla de ruedas
          <span className="text-muted-foreground block text-xs font-normal">Según OSM</span>
        </label>
        <Switch
          id={accessibleId}
          checked={filters.accessibleOnly}
          onCheckedChange={(checked) => onChange({ ...filters, accessibleOnly: checked })}
        />
      </div>
    </div>
  );
}

const WEIGHT_HELP: Record<LodgingScoreKey, string> = {
  budget: "Solo cuenta si hay precio de un proveedor (ahora no hay).",
  proximity: "Tiempo a pie a los lugares de tu plan.",
  transport: "Tiempo a pie a la estación más cercana.",
  preferences: "Tipo, categoría, accesibilidad y zona que elegiste.",
};

function WeightsForm({
  weights,
  onChange,
}: {
  weights: LodgingWeights;
  onChange: (weights: LodgingWeights) => void;
}) {
  const baseId = useId();
  return (
    <div className="flex flex-col gap-3">
      {(Object.keys(SCORE_LABELS) as LodgingScoreKey[]).map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`${baseId}-${key}`} className="text-sm font-medium">
              {SCORE_LABELS[key]}
            </label>
            <span className="text-sm tabular-nums" aria-hidden>
              {weights[key]} / 5
            </span>
          </div>
          <input
            id={`${baseId}-${key}`}
            type="range"
            min={0}
            max={5}
            step={1}
            value={weights[key]}
            aria-describedby={`${baseId}-${key}-help`}
            aria-valuetext={weights[key] === 0 ? "No cuenta" : `${weights[key]} de 5`}
            onChange={(event) => onChange({ ...weights, [key]: Number(event.target.value) })}
            className="accent-primary h-11 w-full"
          />
          <p id={`${baseId}-${key}-help`} className="text-muted-foreground text-xs">
            {WEIGHT_HELP[key]}
          </p>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 self-start"
        onClick={() => onChange(DEFAULT_LODGING_WEIGHTS)}
      >
        Restablecer pesos
      </Button>
    </div>
  );
}

function CurrentHotel({
  trip,
  current,
  basis,
  Heading,
  onShowOnMap,
}: {
  trip: Trip;
  current?: RankedLodging;
  basis: DistanceBasis;
  Heading: "h2" | "h3";
  onShowOnMap: (place: Place) => void;
}) {
  const { hotel } = trip;
  if (!hotel) {
    return (
      <div
        className="flex flex-col gap-1.5 rounded-lg border border-dashed p-4"
        data-testid="lodging-no-hotel"
      >
        <BedDouble className="text-layer-lodging size-6" aria-hidden />
        <p className="font-medium">Aún no has elegido hotel</p>
        <p className="text-muted-foreground text-sm">
          El hotel es el centro del viaje: el plan por días y los trayectos salen de él. Compara los
          de abajo y pulsa «Usar como mi hotel».
        </p>
      </div>
    );
  }
  const place = hotel.place;
  const proximity = current ? proximityText(current.candidate, basis) : undefined;
  const station = current ? stationText(current.candidate) : undefined;
  return (
    <section
      aria-labelledby="current-hotel-title"
      className="border-cta flex flex-col gap-2 border-l-4 pl-3"
      data-testid="current-hotel"
    >
      <p className="text-muted-foreground text-sm">Tu hotel</p>
      <Heading id="current-hotel-title" className="text-lg leading-tight font-semibold">
        {hotel.name}
      </Heading>
      {place ? <PlaceMeta place={place} /> : null}
      {current ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {proximity ? (
            <>
              <dt className="text-muted-foreground">Al plan</dt>
              <dd className="tabular-nums">{proximity}</dd>
            </>
          ) : null}
          {current.score.total !== null ? (
            <>
              <dt className="text-muted-foreground">Puntuación</dt>
              <dd className="tabular-nums">{current.score.total} de 100</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Estación</dt>
          <dd className="tabular-nums">
            {station && current.candidate.station
              ? `${current.candidate.station.place.name}, ${station}`
              : "Ninguna a menos de 1,5 km según OSM"}
          </dd>
        </dl>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Es el punto de partida del itinerario, de «Cómo llegar» y de las preguntas «Desde tu hotel».
        Elegirlo no es una reserva.
      </p>
      {place ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 self-start"
          onClick={() => onShowOnMap(place)}
        >
          <MapPin aria-hidden />
          Ver en el mapa
        </Button>
      ) : null}
    </section>
  );
}

function PlaceMeta({ place }: { place: Place }) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <span>{CATEGORY_LABELS[place.category]}</span>
      {place.stars !== undefined ? (
        <span className="inline-flex items-center gap-0.5">
          <Star aria-hidden className="size-3.5 fill-current" />
          {place.stars} estrella{place.stars === 1 ? "" : "s"} (OSM)
        </span>
      ) : null}
      {place.wheelchair === "yes" ? (
        <span className="inline-flex items-center gap-0.5">
          <Accessibility aria-hidden className="size-3.5" />
          Accesible (OSM)
        </span>
      ) : null}
    </p>
  );
}

function LodgingResults({
  query,
  ranked,
  basis,
  trip,
  chooser,
  onShowOnMap,
  selectedPlaceId,
  onClearFilters,
  rowHeading,
}: {
  rowHeading: "h3" | "h4";
  query: ReturnType<typeof useLodging>;
  ranked: RankedLodging[];
  basis: DistanceBasis;
  trip: Trip;
  chooser: ReturnType<typeof useChooseHotel>;
  onShowOnMap: (place: Place) => void;
  selectedPlaceId?: string;
  onClearFilters: () => void;
}) {
  if (query.isLoading) {
    return (
      <div aria-busy className="flex flex-col gap-3" data-testid="lodging-loading">
        <p role="status" className="text-muted-foreground text-sm">
          Midiendo distancias y tiempos a pie…
        </p>
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex flex-col gap-2 border-b pb-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (query.isError || !query.data) {
    const error = query.error;
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <p>
            {error instanceof ApiError && error.status === 502
              ? "OpenStreetMap no responde ahora mismo: no se pueden cargar los alojamientos."
              : error instanceof ApiError
                ? error.message
                : "No se han podido cargar los alojamientos."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => query.refetch()}
            >
              Reintentar
            </Button>
            {error instanceof ApiError && error.externalUrl ? (
              <a
                href={error.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-2"
              >
                Ver la zona en OpenStreetMap (enlace externo)
              </a>
            ) : null}
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  const data = query.data;
  return (
    <div className="flex flex-col gap-3">
      <ComparisonNote data={data} basis={basis} shown={ranked.length} />
      {data.warnings.map((warning) => (
        <p key={warning} className="text-muted-foreground text-xs">
          {warning}
        </p>
      ))}
      {ranked.length > 0 ? <ScoreLegend /> : null}
      {ranked.length === 0 ? (
        <div
          className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4"
          data-testid="lodging-empty"
        >
          <p className="font-medium">
            {data.found === 0
              ? "OpenStreetMap no tiene alojamientos en esta zona"
              : "Ningún alojamiento cumple los filtros"}
          </p>
          {data.found === 0 ? (
            <a
              href={`https://www.booking.com/searchresults.html?${new URLSearchParams({ ss: trip.destination.name, checkin: trip.startDate, checkout: trip.endDate, group_adults: String(trip.travelers.adults), group_children: String(trip.travelers.children), lang: "es" })}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-sm underline underline-offset-2"
            >
              Buscar alojamiento en Booking.com (enlace externo)
            </a>
          ) : (
            <Button variant="outline" size="sm" className="min-h-11" onClick={onClearFilters}>
              Quitar filtros
            </Button>
          )}
        </div>
      ) : (
        <ol className="flex flex-col" aria-label="Alojamientos comparados">
          {ranked.map((item, index) => (
            <LodgingRow
              key={item.candidate.place.id}
              item={item}
              position={index + 1}
              basis={basis}
              trip={trip}
              chooser={chooser}
              onShowOnMap={onShowOnMap}
              selected={item.candidate.place.id === selectedPlaceId}
              Heading={rowHeading}
            />
          ))}
        </ol>
      )}
      {data.travel.source ? (
        <DataSource source={data.travel.source} isDemo={data.travel.isDemo ?? false} />
      ) : null}
    </div>
  );
}

function ComparisonNote({
  data,
  basis,
  shown,
}: {
  data: LodgingResponse;
  basis: DistanceBasis;
  shown: number;
}) {
  const points = data.keyPoints.points.length;
  const reference =
    points === 0
      ? "el centro del destino"
      : data.keyPoints.basis === "itinerary"
        ? `${points} visita${points === 1 ? "" : "s"} de tu itinerario`
        : `los ${points} lugares más relevantes del destino (aún no hay itinerario)`;
  return (
    <div className="text-muted-foreground flex flex-col gap-1 text-sm">
      <p>
        {shown === data.matching
          ? `${shown} alojamiento${shown === 1 ? "" : "s"}`
          : `Los ${shown} más cerca del plan de ${data.matching} que cumplen los filtros`}{" "}
        ({data.found} en la zona), comparados con {reference}.
      </p>
      {basis === "straight" ? (
        <p className="text-xs">
          {data.travel.message ?? "Faltan tiempos a pie para algún alojamiento."} Las distancias se
          comparan en línea recta.
        </p>
      ) : null}
    </div>
  );
}

/** Leyenda de la barra: qué aporta cada color a la puntuación. */
function ScoreLegend() {
  return (
    <ul
      className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs"
      aria-label="Leyenda de la barra de puntuación"
    >
      {(Object.keys(SCORE_LABELS) as LodgingScoreKey[]).map((key) => (
        <li key={key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-full", SCORE_COLORS[key])} />
          {SCORE_LABELS[key]}
        </li>
      ))}
    </ul>
  );
}

function ScoreBar({ item }: { item: RankedLodging }) {
  const counted = item.score.components.filter((c) => c.score !== null && c.weight > 0);
  const weightSum = counted.reduce((sum, c) => sum + c.weight, 0);
  return (
    <div aria-hidden className="bg-muted flex h-2 w-full overflow-hidden rounded-full">
      {counted.map((component) => (
        <span
          key={component.key}
          className={cn("h-full", SCORE_COLORS[component.key])}
          style={{ width: `${((component.score ?? 0) * component.weight) / weightSum}%` }}
        />
      ))}
    </div>
  );
}

function LodgingRow({
  item,
  position,
  basis,
  trip,
  chooser,
  onShowOnMap,
  selected,
  Heading,
}: {
  Heading: "h3" | "h4";
  item: RankedLodging;
  position: number;
  basis: DistanceBasis;
  trip: Trip;
  chooser: ReturnType<typeof useChooseHotel>;
  onShowOnMap: (place: Place) => void;
  selected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const { candidate, score } = item;
  const { place } = candidate;
  const proximity = proximityText(candidate, basis);
  const station = stationText(candidate);
  const pending = chooser.pendingId === place.id;
  const links = availabilityLinks({
    place,
    city: trip.destination.name,
    checkIn: trip.startDate,
    checkOut: trip.endDate,
    adults: trip.travelers.adults,
    children: trip.travelers.children,
    rooms: trip.accommodationPreferences?.rooms ?? 1,
  });

  return (
    <li
      className={cn("flex flex-col gap-2 border-b py-3", selected && "bg-accent/60 -mx-2 px-2")}
      data-testid="lodging-row"
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <Heading className="leading-tight font-medium">
            <span className="sr-only">{position}. </span>
            {place.name}
          </Heading>
          <PlaceMeta place={place} />
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-xl leading-none font-semibold tabular-nums">
            {score.total ?? "—"}
          </span>
          <span className="text-muted-foreground text-xs">
            {score.total === null ? "sin puntuación" : "de 100"}
          </span>
        </div>
      </div>
      <ScoreBar item={item} />
      <ul className="flex flex-col gap-0.5 text-sm tabular-nums">
        {proximity ? (
          <li className="flex items-center gap-1.5">
            <MapPin aria-hidden className="text-primary size-3.5 shrink-0" />
            {proximity} al plan
          </li>
        ) : null}
        <li className="flex items-center gap-1.5">
          <TramFront aria-hidden className="text-layer-transport size-3.5 shrink-0" />
          {station && candidate.station
            ? `${candidate.station.place.name}: ${station}`
            : "Sin estación a menos de 1,5 km (OSM)"}
        </li>
        <li className="text-muted-foreground">Sin precio disponible</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={chooser.pendingId !== undefined}
          onClick={() => chooser.choose(place)}
        >
          <BedDouble aria-hidden />
          {pending ? "Guardando y recalculando…" : "Usar como mi hotel"}
          <span className="sr-only">: {place.name}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Ocultar detalles" : "Detalles"}
          <span className="sr-only"> de {place.name}</span>
        </Button>
      </div>
      <div id={detailsId} hidden={!open} className="flex flex-col gap-3 pt-1">
        {open ? (
          <>
            <ScoreBreakdown item={item} />
            <LodgingServices place={place} />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Precio y disponibilidad</p>
              <p className="text-muted-foreground text-sm">
                Sin precio disponible. Busca disponibilidad fuera de TripMind; abrir un enlace no
                reserva nada.
              </p>
              <ul className="flex flex-col gap-1">
                {links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="text-primary inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-2"
                    >
                      <ExternalLink aria-hidden className="size-4" />
                      Buscar en {link.label}
                      {link.carries === "dates_and_travelers"
                        ? " con tus fechas y viajeros"
                        : " (elige allí las fechas)"}
                      <span className="sr-only"> (enlace externo, se abre en otra pestaña)</span>
                    </a>
                  </li>
                ))}
                {place.website ? (
                  <li>
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-2"
                    >
                      <Globe aria-hidden className="size-4" />
                      Web oficial
                      {place.websiteSource === "wikidata" ? " (Wikidata)" : " (OSM)"}
                      <span className="sr-only"> (enlace externo)</span>
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 self-start"
              onClick={() => onShowOnMap(place)}
            >
              <MapPin aria-hidden />
              Ver en el mapa
            </Button>
            <DataSource source={place.source} isDemo={place.isDemo} />
          </>
        ) : null}
      </div>
    </li>
  );
}

function ScoreBreakdown({ item }: { item: RankedLodging }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">Desglose de la puntuación</p>
      <ul className="flex flex-col gap-1.5">
        {item.score.components.map((component) => (
          <li key={component.key} className="grid grid-cols-[auto_1fr_auto] items-start gap-2">
            <span
              aria-hidden
              className={cn("mt-1.5 size-2.5 rounded-full", SCORE_COLORS[component.key])}
            />
            <span className="flex min-w-0 flex-col text-sm">
              <span>
                {SCORE_LABELS[component.key]}{" "}
                <span className="text-muted-foreground">(peso {component.weight})</span>
              </span>
              <span className="text-muted-foreground text-xs">{component.reason}</span>
            </span>
            <span className="text-sm tabular-nums">
              {component.weight === 0
                ? "no cuenta"
                : component.score === null
                  ? "sin datos"
                  : `${component.score} / 100`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Puntuación interna de TripMind con datos de OSM y tiempos a pie; no es una valoración de
        clientes.
      </p>
    </div>
  );
}
