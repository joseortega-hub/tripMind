"use client";

import { Footprints, TramFront } from "lucide-react";
import { useId, useState } from "react";
import { DemoBadge } from "@/components/data-source";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/wizard/field";
import type { LatLng } from "@/domain/geo";
import type { Place } from "@/domain/place";
import { ApiError } from "@/lib/api-client";
import { CATEGORY_LABELS } from "@/lib/map/layers";
import { formatDataDate, formatDistance, formatDuration } from "@/lib/route-labels";
import { type NearbyStop, useNearbyStops, useWalkable } from "./use-routes";

/** Pregunta desplegable: un botón con `aria-expanded` y su respuesta debajo. */
function Question({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Footprints;
  label: string;
  children: (open: boolean) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="min-h-11 justify-start"
      >
        <Icon aria-hidden />
        {label}
      </Button>
      <div id={id} hidden={!open} className="flex flex-col gap-2">
        {open ? children(open) : null}
      </div>
    </div>
  );
}

const loading = (
  <div aria-busy className="flex flex-col gap-2">
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

function failure(message: string, retry: () => void) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p>{message}</p>
        <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={retry}>
          Reintentar
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function StopRow({ stop, onSelect }: { stop: NearbyStop; onSelect?: (place: Place) => void }) {
  const lines = stop.place.transit?.lines ?? [];
  const content = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{stop.place.name}</span>
        <span className="text-muted-foreground text-xs">
          {CATEGORY_LABELS[stop.place.category]}
          {lines.length > 0 ? `, líneas ${lines.join(", ")} según OSM` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right text-sm tabular-nums">
        {stop.walk ? (
          <>
            <span className="font-semibold">{formatDuration(stop.walk.durationMinutes)}</span>
            <span className="text-muted-foreground block text-xs">
              a pie
              {stop.walk.distanceMeters !== undefined
                ? `, ${formatDistance(stop.walk.distanceMeters)}`
                : ""}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">
            {formatDistance(stop.straightLineMeters)}
            <span className="block">en línea recta</span>
          </span>
        )}
      </span>
    </>
  );
  return (
    <li>
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(stop.place)}
          className="hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-3"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-h-11 items-center justify-between gap-3 px-2 py-1.5">
          {content}
        </div>
      )}
    </li>
  );
}

/** "¿Hay metro cerca?": estaciones y paradas de OSM en ~800 m con el tiempo a pie real. */
export function NearbyTransit({ at, onSelect }: { at: LatLng; onSelect?: (place: Place) => void }) {
  return (
    <Question icon={TramFront} label="¿Hay metro o transporte cerca?">
      {() => <NearbyTransitAnswer at={at} onSelect={onSelect} />}
    </Question>
  );
}

function NearbyTransitAnswer({ at, onSelect }: { at: LatLng; onSelect?: (place: Place) => void }) {
  const query = useNearbyStops(at);
  if (query.isLoading) return loading;
  if (query.isError) {
    return (
      <>
        {failure("No se pueden cargar las estaciones cercanas.", () => query.refetch())}
        {query.error instanceof ApiError && query.error.externalUrl ? (
          <a
            href={query.error.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary text-sm underline underline-offset-2"
          >
            Ver la zona en OpenStreetMap
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : null}
      </>
    );
  }
  const data = query.data;
  if (!data) return null;
  const metro = data.stops.find((stop) => stop.place.category === "metro_station");
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <p className="text-sm">
        {metro
          ? metro.walk
            ? `Sí: ${metro.place.name} está a ${formatDuration(metro.walk.durationMinutes)} a pie.`
            : `Sí: ${metro.place.name} está a ${formatDistance(metro.straightLineMeters)} en línea recta.`
          : data.stops.length > 0
            ? `No hay estaciones de metro en OpenStreetMap a menos de ${formatDistance(data.radiusMeters)}; sí otras paradas.`
            : `No hay estaciones ni paradas en OpenStreetMap a menos de ${formatDistance(data.radiusMeters)}.`}
      </p>
      {data.stops.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {data.stops.map((stop) => (
            <StopRow key={stop.place.id} stop={stop} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
      {data.walkNotice ? (
        <p className="text-muted-foreground border-l-2 border-amber-500/70 pl-2.5 text-xs">
          {data.walkNotice} Se muestra la distancia en línea recta.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Estaciones y líneas: {data.providers.places.name}, © colaboradores de OpenStreetMap.
        {data.walkSource
          ? ` Tiempos a pie: ${data.walkSource.name}, datos del ${formatDataDate(data.walkSource.retrievedAt)}.`
          : ""}{" "}
        Las líneas son las etiquetas del mapa, no un horario.
        {data.providers.places.isDemo || data.walkIsDemo ? (
          <DemoBadge className="ml-2 align-middle" />
        ) : null}
      </p>
    </div>
  );
}

const MINUTE_OPTIONS = [10, 15, 20, 30];

/** "¿Qué puedo hacer a pie?": lugares turísticos a ≤ N minutos andando según rutas reales. */
export function WalkableFrom({
  origin,
  originId,
  candidates,
  onSelect,
}: {
  origin: LatLng;
  /** Se excluye el propio origen de la respuesta. */
  originId?: string;
  candidates: Place[];
  onSelect: (place: Place) => void;
}) {
  return (
    <Question icon={Footprints} label="¿Qué puedo visitar a pie?">
      {() => (
        <WalkableAnswer
          origin={origin}
          candidates={candidates.filter((place) => place.id !== originId)}
          onSelect={onSelect}
        />
      )}
    </Question>
  );
}

function WalkableAnswer({
  origin,
  candidates,
  onSelect,
}: {
  origin: LatLng;
  candidates: Place[];
  onSelect: (place: Place) => void;
}) {
  const [minutes, setMinutes] = useState(15);
  const selectId = useId();
  const targets = candidates.map((place) => ({ id: place.id, location: place.location }));
  const query = useWalkable(origin, minutes, targets);
  const byId = new Map(candidates.map((place) => [place.id, place]));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="text-sm">
          Como máximo
        </label>
        <NativeSelect
          id={selectId}
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className="w-auto tabular-nums"
        >
          {MINUTE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value} min andando
            </option>
          ))}
        </NativeSelect>
      </div>
      {candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hay lugares turísticos cargados en esta zona del mapa.
        </p>
      ) : query.isLoading ? (
        loading
      ) : query.isError ? (
        failure("No se ha podido calcular qué queda a pie.", () => query.refetch())
      ) : query.data?.quality === "unavailable" ? (
        <p className="text-sm">
          {query.data.message} Sin tiempos reales no se puede decir qué queda a {minutes} min.
        </p>
      ) : query.data ? (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-sm">
            {query.data.results.length === 0
              ? `Ningún lugar turístico de la zona está a ${minutes} min o menos andando.`
              : `${query.data.results.length === 1 ? "1 lugar" : `${query.data.results.length} lugares`} a ${minutes} min o menos andando:`}
          </p>
          <ul className="-mx-2 flex flex-col">
            {query.data.results.map((result) => {
              const place = byId.get(result.id);
              if (!place) return null;
              return (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(place)}
                    className="hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-3"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{place.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {CATEGORY_LABELS[place.category]}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatDuration(result.durationMinutes)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {query.data.source ? (
            <p className="text-muted-foreground text-xs">
              Tiempos a pie: {query.data.source.name}, datos del{" "}
              {formatDataDate(query.data.source.retrievedAt)}.
              {query.data.isDemo ? <DemoBadge className="ml-2 align-middle" /> : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
