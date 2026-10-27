"use client";

import {
  BusFront,
  CarTaxiFront,
  ExternalLink,
  Footprints,
  type LucideIcon,
  Route as RouteIcon,
  TrainFront,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DemoBadge } from "@/components/data-source";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LatLng } from "@/domain/geo";
import type {
  ApproximateRoute,
  RouteMode,
  RouteResult,
  RoutedRoute,
  TransitStep,
} from "@/domain/route";
import type { Source } from "@/domain/source";
import { ApiError } from "@/lib/api-client";
import {
  formatClock,
  formatDataDate,
  formatDistance,
  formatDuration,
  MODE_LABELS,
  transfersText,
  VEHICLE_LABELS,
} from "@/lib/route-labels";
import { formatDay } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/wizard/field";
import { useRouteComparison } from "./use-routes";
import { useMapUi } from "./workspace-context";

export interface RouteOrigin {
  key: "hotel" | "previous";
  name: string;
  location: LatLng;
}

const MODE_ICONS: Record<RouteMode, LucideIcon> = {
  transit: BusFront,
  walk: Footprints,
  car: CarTaxiFront,
};

/** Franjas de salida para el transporte público (cada 30 min de 07:00 a 22:00). */
const TIMES = Array.from({ length: 31 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** Día por defecto: hoy si cae dentro del viaje; si no, el primer día. */
function defaultDay(days: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  return days.includes(today) ? today : days[0]!;
}

const routeKey = (from: LatLng, to: LatLng, mode: RouteMode) =>
  `${from.lat},${from.lng}>${to.lat},${to.lng}:${mode}`;

/**
 * "Cómo llegar": compara transporte público, a pie y taxi o coche desde el hotel o desde el lugar
 * anterior. Cada modo muestra su fuente y fecha; sin ruta real, lo dice y ofrece enlaces externos.
 */
export function RouteComparator({
  destination,
  origins,
  tripDays,
  headingLevel,
}: {
  destination: { name: string; location: LatLng };
  origins: RouteOrigin[];
  tripDays: string[];
  headingLevel: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const headingId = useId();
  const [originKey, setOriginKey] = useState(origins[0]?.key);
  const [day, setDay] = useState(() => defaultDay(tripDays));
  const [time, setTime] = useState("10:00");
  const origin = origins.find((item) => item.key === originKey) ?? origins[0];
  const query = useRouteComparison(
    origin ? { from: origin.location, to: destination.location, date: day, time } : undefined,
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t pt-4">
      <div className="flex items-center gap-2">
        <RouteIcon className="text-primary size-4.5" aria-hidden />
        <Heading id={headingId} className="font-semibold">
          Cómo llegar
        </Heading>
      </div>

      {!origin ? (
        <p className="text-muted-foreground text-sm">
          Para comparar trayectos, abre antes otro lugar del mapa: se usará como punto de partida.
          Cuando el viaje tenga hotel, también podrás calcularlos desde allí.
        </p>
      ) : (
        <>
          {origins.length > 1 ? (
            <div role="radiogroup" aria-label="Punto de partida" className="flex flex-wrap gap-2">
              {origins.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={item.key === origin.key}
                  onClick={() => setOriginKey(item.key)}
                  className={cn(
                    "focus-visible:ring-ring/50 min-h-11 max-w-full truncate rounded-full border px-3.5 text-sm font-medium outline-none focus-visible:ring-3",
                    item.key === origin.key
                      ? "border-cta bg-cta/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.key === "hotel" ? "Desde el hotel" : `Desde ${item.name}`}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-sm">
            <span className="text-muted-foreground">Desde </span>
            <span className="font-medium">{origin.name}</span>
            <span className="text-muted-foreground"> hasta </span>
            <span className="font-medium">{destination.name}</span>
          </p>

          <fieldset className="grid grid-cols-[1fr_7rem] gap-2">
            <legend className="text-muted-foreground mb-1.5 text-xs">
              Salida para el transporte público (hora local del destino)
            </legend>
            <label className="sr-only" htmlFor={`${headingId}-day`}>
              Día de salida
            </label>
            <NativeSelect
              id={`${headingId}-day`}
              value={day}
              onChange={(event) => setDay(event.target.value)}
            >
              {tripDays.map((date) => (
                <option key={date} value={date}>
                  {formatDay(date)}
                </option>
              ))}
            </NativeSelect>
            <label className="sr-only" htmlFor={`${headingId}-time`}>
              Hora de salida
            </label>
            <NativeSelect
              id={`${headingId}-time`}
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="tabular-nums"
            >
              {TIMES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </fieldset>

          {query.isLoading ? (
            <div
              role="status"
              aria-busy
              className="flex flex-col gap-3"
              aria-label="Calculando trayectos"
            >
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p>
                  {query.error instanceof ApiError && query.error.status === 0
                    ? query.error.message
                    : "No se han podido calcular los trayectos."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 min-h-11"
                  onClick={() => query.refetch()}
                >
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : query.data ? (
            <>
              <ul aria-live="polite" className="flex flex-col divide-y">
                {query.data.results.map((result) => (
                  <RouteRow
                    key={result.mode}
                    result={result}
                    timeZone={query.data.timeZone}
                    routeKey={routeKey(origin.location, destination.location, result.mode)}
                  />
                ))}
              </ul>
              <Sources results={query.data.results} timeZone={query.data.timeZone} />
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function RouteRow({
  result,
  timeZone,
  routeKey: key,
}: {
  result: RouteResult;
  timeZone: string;
  routeKey: string;
}) {
  const Icon = MODE_ICONS[result.mode];
  const route = useMapUi((state) => state.route);
  const showRoute = useMapUi((state) => state.showRoute);
  const shown = route?.key === key;
  const toggle = () =>
    showRoute(
      shown
        ? undefined
        : { key, mode: result.mode, quality: result.quality, geometry: result.geometry },
    );

  return (
    <li className="flex gap-3 py-3 first:pt-0" data-testid={`route-${result.mode}`}>
      <span
        aria-hidden
        className="bg-muted text-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <Icon className="size-4.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">{MODE_LABELS[result.mode]}</span>
          {result.quality === "routed" ? (
            <span className="text-lg font-semibold tabular-nums">
              {formatDuration(result.durationMinutes)}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">Sin ruta calculada</span>
          )}
        </div>
        {result.quality === "routed" ? (
          <RoutedDetails route={result} timeZone={timeZone} />
        ) : (
          <ApproximateDetails route={result} />
        )}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={shown}
            onClick={toggle}
            className="text-primary -ml-2.5 min-h-11"
          >
            {shown
              ? "Quitar del mapa"
              : result.quality === "routed"
                ? "Ver en el mapa"
                : "Ver línea recta en el mapa"}
          </Button>
          {result.externalLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {link.label}
              <span className="sr-only">
                {" "}
                (enlace externo con origen y destino, se abre en otra pestaña)
              </span>
            </a>
          ))}
        </div>
      </div>
    </li>
  );
}

function RoutedDetails({ route, timeZone }: { route: RoutedRoute; timeZone: string }) {
  const zone = route.timeZone ?? timeZone;
  if (route.mode !== "transit") {
    return (
      <p className="text-muted-foreground text-sm tabular-nums">
        {route.distanceMeters !== undefined ? formatDistance(route.distanceMeters) : null}
        {route.mode === "car" ? (
          <span className="block text-xs">
            Sin contar tráfico ni aparcamiento. El precio del taxi no se muestra: no hay una fuente
            fiable.
          </span>
        ) : null}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm tabular-nums">
        {route.departure && route.arrival ? (
          <>
            Sale a las {formatClock(route.departure, zone)}, llega a las{" "}
            {formatClock(route.arrival, zone)}
          </>
        ) : null}
        {route.transfers !== undefined ? <>, {transfersText(route.transfers)}</> : null}
      </p>
      {route.steps ? <TransitStrip steps={route.steps} timeZone={zone} /> : null}
    </div>
  );
}

/**
 * Franja del trayecto: un segmento por tramo, proporcional a su duración, con el color de la
 * línea según el feed GTFS. Debajo, la lista de tramos (equivalente accesible).
 */
function TransitStrip({ steps, timeZone }: { steps: TransitStep[]; timeZone: string }) {
  const total = steps.reduce((sum, step) => sum + step.durationMinutes, 0) || 1;
  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {steps.map((step, index) => (
          <span
            key={index}
            style={{
              flexGrow: Math.max(step.durationMinutes / total, 0.04),
              backgroundColor:
                step.vehicle === "walk"
                  ? undefined
                  : step.line?.color
                    ? `#${step.line.color}`
                    : undefined,
            }}
            className={cn(
              "h-full",
              step.vehicle === "walk"
                ? "bg-[repeating-linear-gradient(90deg,var(--muted-foreground)_0_3px,transparent_3px_6px)] opacity-60"
                : !step.line?.color && "bg-primary",
            )}
          />
        ))}
      </div>
      <ol className="flex flex-col gap-1.5 text-sm">
        {steps.map((step, index) =>
          step.vehicle === "walk" ? (
            <li key={index} className="text-muted-foreground flex items-center gap-2">
              <Footprints className="size-3.5 shrink-0" aria-hidden />
              <span>
                Andar {formatDuration(step.durationMinutes)}
                {step.distanceMeters ? ` (${formatDistance(step.distanceMeters)})` : ""} hasta{" "}
                {step.to.name}
              </span>
            </li>
          ) : (
            <li key={index} className="flex items-start gap-2">
              <LineBadge step={step} />
              <span className="min-w-0">
                <span className="sr-only">{VEHICLE_LABELS[step.vehicle]} </span>
                {step.line?.headsign ? <>dirección {step.line.headsign}: </> : null}
                {step.from.name} → {step.to.name}
                <span className="text-muted-foreground block text-xs tabular-nums">
                  {step.from.time ? `${formatClock(step.from.time, timeZone)}–` : ""}
                  {step.to.time ? formatClock(step.to.time, timeZone) : ""}
                  {step.intermediateStops !== undefined
                    ? `, ${step.intermediateStops + 1} ${step.intermediateStops === 0 ? "parada" : "paradas"}`
                    : ""}
                  {step.line?.agency ? `, ${step.line.agency}` : ""}
                </span>
              </span>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

function LineBadge({ step }: { step: TransitStep }) {
  const Icon = step.vehicle === "bus" ? BusFront : TrainFront;
  const color = step.line?.color;
  const text = step.line?.textColor;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold",
        !color && "bg-primary text-primary-foreground",
      )}
      style={
        color ? { backgroundColor: `#${color}`, color: text ? `#${text}` : "#ffffff" } : undefined
      }
    >
      <Icon className="size-3" aria-hidden />
      {step.line?.name ?? VEHICLE_LABELS[step.vehicle]}
    </span>
  );
}

function ApproximateDetails({ route }: { route: ApproximateRoute }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>{route.message}</p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {formatDistance(route.straightLineMeters)} en línea recta: no es la distancia del recorrido.
        Los enlaces abren otro servicio con el trayecto ya puesto; no es una ruta calculada aquí.
      </p>
    </div>
  );
}

/** Fuentes y fecha de los datos de cada modo (una línea por proveedor). */
function Sources({ results, timeZone }: { results: RouteResult[]; timeZone: string }) {
  const sources = useMemo(() => {
    const byName = new Map<string, { source: Source; isDemo: boolean; transit: boolean }>();
    for (const result of results) {
      if (result.quality !== "routed") continue;
      const current = byName.get(result.source.name);
      byName.set(result.source.name, {
        source: result.source,
        isDemo: result.isDemo,
        transit: (current?.transit ?? false) || result.mode === "transit",
      });
    }
    return [...byName.values()];
  }, [results]);
  const transit = results.find(
    (result) => result.mode === "transit" && result.quality === "routed",
  );
  if (sources.length === 0) return null;
  return (
    <div className="text-muted-foreground flex flex-col gap-1 text-xs">
      {sources.map(({ source, isDemo }) => (
        <p key={source.name}>
          Fuente:{" "}
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {source.name}
            </a>
          ) : (
            source.name
          )}
          , datos del {formatDataDate(source.retrievedAt, timeZone)}
          {source.attribution ? `. ${source.attribution}` : ""}
          {isDemo ? <DemoBadge className="ml-2 align-middle" /> : null}
        </p>
      ))}
      {transit?.quality === "routed" && transit.departure ? (
        <p>
          Horarios programados del {formatDataDate(transit.departure, transit.timeZone ?? timeZone)}
          {transit.isDemo ? " (grabados; pueden no coincidir con el día elegido)" : ""}. Pueden
          cambiar: confírmalos con el operador.
        </p>
      ) : null}
    </div>
  );
}
