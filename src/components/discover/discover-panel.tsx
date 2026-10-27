"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarHeart,
  ExternalLink,
  Flame,
  Layers,
  RotateCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { useTripCalendar } from "@/components/calendar/use-calendar";
import { DataSource, DemoBadge } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { PlacePopularity } from "@/domain/discover";
import type { Place } from "@/domain/place";
import type { ItineraryDay, Trip } from "@/domain/trip";
import { getJson, type ProviderMeta } from "@/lib/api-client";
import { discoverGroups, type HeatPoint, RESEARCH_CATEGORIES, researchUrl } from "@/lib/discover";
import { CATEGORY_LABELS } from "@/lib/map/layers";
import { formatDay } from "@/lib/trip-labels";
import { FreeTimeFinder } from "./free-time";
import { SaveFromSocial } from "./save-from-social";

interface PopularResponse {
  results: PlacePopularity[];
  places: Place[];
  status: "ok" | "unavailable";
  from: string;
  to: string;
  provider: ProviderMeta;
}

export interface DiscoverPanelProps {
  trip: Trip;
  days: ItineraryDay[];
  shownDate?: string;
  places: Place[];
  placesLoading: boolean;
  calendar: ReturnType<typeof useTripCalendar>;
  heat: { shown: boolean; toggle: () => void; points: HeatPoint[] };
  selectedPlace?: Place;
  onSelectPlace: (place: Place) => void;
  headingLevel?: 2 | 3;
}

/** "Descubre algo diferente" (§13), oportunidades (§14B), horas libres (§14C) y redes (§18). */
export function DiscoverPanel({
  trip,
  days,
  shownDate,
  places,
  placesLoading,
  calendar,
  heat,
  selectedPlace,
  onSelectPlace,
  headingLevel = 3,
}: DiscoverPanelProps) {
  const Sub = `h${headingLevel}` as "h2" | "h3";
  const Item = `h${headingLevel + 1}` as "h3" | "h4";
  return (
    <div className="flex flex-col gap-6" data-testid="discover">
      <Events trip={trip} calendar={calendar} onSelectPlace={onSelectPlace} Heading={Sub} />
      <Different
        places={places}
        loading={placesLoading}
        onSelect={onSelectPlace}
        Heading={Sub}
        Item={Item}
      />
      <Popular tripId={trip.id} onSelect={onSelectPlace} Heading={Sub} />
      <Opportunities heat={heat} onSelect={onSelectPlace} Heading={Sub} />
      <div className="border-t pt-4">
        <FreeTimeFinder
          trip={trip}
          days={days}
          defaultDate={shownDate}
          selectedPlace={selectedPlace}
          onSelectPlace={onSelectPlace}
          Heading={Sub as "h3" | "h4"}
        />
      </div>
      <div className="border-t pt-4">
        <SaveFromSocial
          tripId={trip.id}
          places={places}
          onSaved={onSelectPlace}
          Heading={Sub as "h3" | "h4"}
        />
      </div>
    </div>
  );
}

function SectionTitle({
  Heading,
  id,
  icon: Icon,
  children,
}: {
  Heading: "h2" | "h3";
  id: string;
  icon: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <Heading id={id} className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="text-primary size-4" aria-hidden />
      {children}
    </Heading>
  );
}

function Events({
  trip,
  calendar,
  Heading,
}: {
  trip: Trip;
  calendar: ReturnType<typeof useTripCalendar>;
  onSelectPlace: (place: Place) => void;
  Heading: "h2" | "h3";
}) {
  const id = useId();
  const data = calendar.calendar;
  const status = data?.eventsStatus;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2" data-testid="discover-events">
      <SectionTitle Heading={Heading} id={id} icon={CalendarHeart}>
        Eventos en tus fechas
      </SectionTitle>
      {calendar.query.isPending ? (
        <Skeleton className="h-12 w-full" aria-hidden />
      ) : data && data.events.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.events.slice(0, 12).map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5 text-sm">
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary font-medium underline-offset-2 hover:underline"
              >
                {event.name}
                <span className="sr-only"> (enlace externo)</span>
              </a>
              <span className="text-muted-foreground text-xs">
                {formatDay(event.date)}
                {event.time ? `, ${event.time} h` : ""}
                {event.venue ? `, ${event.venue.name}` : ""}
                {event.status === "cancelled" || event.status === "postponed"
                  ? " (cancelado o aplazado)"
                  : ""}
              </span>
            </li>
          ))}
          <li>
            <DataSource source={data.events[0]!.source} isDemo={data.events[0]!.isDemo} />
          </li>
        </ul>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            {status?.status === "ok"
              ? "Ticketmaster no tiene eventos en tus fechas cerca del destino."
              : (status?.message ?? "No hay proveedor de eventos.")}{" "}
            Investiga por tu cuenta por categorías:
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Categorías para investigar">
            {RESEARCH_CATEGORIES.map((category) => (
              <li key={category}>
                <a
                  href={researchUrl(category, trip.destination.name, trip.startDate)}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-visible:ring-ring/50 hover:bg-muted inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-3"
                >
                  {category}
                  <ExternalLink className="size-3" aria-hidden />
                  <span className="sr-only"> (búsqueda externa)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Son búsquedas en Google: comprueba fechas y fuentes oficiales antes de planificar.
          </p>
        </div>
      )}
    </section>
  );
}

function Different({
  places,
  loading,
  onSelect,
  Heading,
  Item,
}: {
  places: Place[];
  loading: boolean;
  onSelect: (place: Place) => void;
  Heading: "h2" | "h3";
  Item: "h3" | "h4";
}) {
  const id = useId();
  const groups = useMemo(() => discoverGroups(places), [places]);
  const [expanded, setExpanded] = useState<string>();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-testid="discover-different">
      <SectionTitle Heading={Heading} id={id} icon={Sparkles}>
        Algo diferente
      </SectionTitle>
      {loading ? (
        <Skeleton className="h-24 w-full" aria-hidden />
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hay mercados, miradores ni lugares menos conocidos en la zona cargada del mapa.
        </p>
      ) : (
        groups.map((group) => {
          const open = expanded === group.key;
          const list = open ? group.places : group.places.slice(0, 5);
          return (
            <div key={group.key} className="flex flex-col gap-1">
              <Item className="text-sm font-medium">
                {group.title}{" "}
                <span className="text-muted-foreground font-normal tabular-nums">
                  ({group.places.length})
                </span>
              </Item>
              <p className="text-muted-foreground text-xs">{group.description}</p>
              <ul className="flex flex-col">
                {list.map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(place)}
                      className="focus-visible:ring-ring/50 hover:bg-muted -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-3"
                    >
                      <span>{place.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {CATEGORY_LABELS[place.category]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {group.places.length > 5 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary min-h-11 self-start"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? undefined : group.key)}
                >
                  {open ? "Ver menos" : `Ver los ${group.places.length}`}
                </Button>
              ) : null}
            </div>
          );
        })
      )}
      <p className="text-muted-foreground text-xs">
        Datos de OpenStreetMap; los horarios pueden no estar al día.
      </p>
    </section>
  );
}

function Popular({
  tripId,
  onSelect,
  Heading,
}: {
  tripId: string;
  onSelect: (place: Place) => void;
  Heading: "h2" | "h3";
}) {
  const id = useId();
  const query = useQuery({
    queryKey: ["popular", tripId],
    queryFn: ({ signal }) => getJson<PopularResponse>(`/api/trips/${tripId}/popular`, signal),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const data = query.data;
  const byId = new Map((data?.places ?? []).map((place) => [place.id, place]));
  const trending = (data?.results ?? []).filter((r) => r.isTrending);
  const top =
    trending.length > 0
      ? trending
      : [...(data?.results ?? [])].sort((a, b) => b.recentDaily - a.recentDaily).slice(0, 5);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2" data-testid="discover-popular">
      <SectionTitle Heading={Heading} id={id} icon={TrendingUp}>
        Popular ahora (según visitas en Wikipedia)
      </SectionTitle>
      <p className="text-muted-foreground text-xs">
        Lecturas diarias del artículo de cada lugar en la última semana frente a las semanas
        anteriores. No mide redes sociales ni afluencia real.
      </p>
      {query.isPending ? (
        <Skeleton className="h-16 w-full" aria-hidden />
      ) : query.isError || data?.status === "unavailable" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-destructive">
            No se han podido consultar las visitas de Wikipedia.
          </span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => query.refetch()}>
            <RotateCw aria-hidden />
            Reintentar
          </Button>
        </div>
      ) : top.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ningún lugar de la zona tiene artículo en Wikipedia.
        </p>
      ) : (
        <>
          {trending.length === 0 ? (
            <p className="text-sm">Ningún lugar destaca esta semana. Los más leídos:</p>
          ) : null}
          <ul className="flex flex-col">
            {top.map((entry) => {
              const place = byId.get(entry.placeId);
              if (!place) return null;
              return (
                <li key={entry.placeId}>
                  <button
                    type="button"
                    onClick={() => onSelect(place)}
                    className="focus-visible:ring-ring/50 hover:bg-muted -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-3"
                  >
                    <span className="flex items-center gap-1.5">
                      {entry.isTrending ? (
                        <span className="bg-cta text-cta-foreground rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold">
                          Popular ahora
                        </span>
                      ) : null}
                      {place.name}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {entry.recentDaily.toLocaleString("es-ES")} lecturas/día
                      {entry.ratio !== null ? ` (×${entry.ratio.toLocaleString("es-ES")})` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            Del {formatDay(data!.from)} al {formatDay(data!.to)}. Fuente: Wikimedia Pageviews API
            {data!.provider.isDemo ? <DemoBadge /> : null}
          </p>
        </>
      )}
    </section>
  );
}

function Opportunities({
  heat,
  onSelect,
  Heading,
}: {
  heat: DiscoverPanelProps["heat"];
  onSelect: (place: Place) => void;
  Heading: "h2" | "h3";
}) {
  const id = useId();
  const top = heat.points.slice(0, 5);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2" data-testid="discover-heat">
      <SectionTitle Heading={Heading} id={id} icon={Flame}>
        Mapa de calor de oportunidades
      </SectionTitle>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <Switch
          checked={heat.shown}
          onCheckedChange={heat.toggle}
          disabled={heat.points.length === 0}
        />
        <Layers className="text-muted-foreground size-4" aria-hidden />
        Mostrar en el mapa
      </label>
      <p className="text-muted-foreground text-xs">
        Puntuación interna de TripMind según tus intereses y la información de cada lugar en la
        fuente (Wikidata, Wikipedia, foto, horario). No son valoraciones de visitantes.
      </p>
      {top.length > 0 ? (
        <>
          <p className="text-sm">Lo que más encaja contigo:</p>
          <ol className="flex flex-col">
            {top.map(({ place }) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => onSelect(place)}
                  className="focus-visible:ring-ring/50 hover:bg-muted -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-3"
                >
                  <span>{place.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {CATEGORY_LABELS[place.category]}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Aún no hay lugares cargados para puntuar.</p>
      )}
    </section>
  );
}
