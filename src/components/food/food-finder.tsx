"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  Footprints,
  Navigation,
  SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DataSource } from "@/components/data-source";
import type { useItinerary } from "@/components/itinerary/use-itinerary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/wizard/field";
import type {
  FoodComparison,
  FoodDiet,
  FoodMoment,
  FoodNear,
  FoodReference,
  FoodResult,
  FoodStyle,
} from "@/domain/food";
import type { Place } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import { ApiError } from "@/lib/api-client";
import {
  cuisineLabel,
  dietText,
  MOMENT_LABELS,
  NEAR_LABELS,
  priceText,
  STYLE_LABELS,
  walkingDirectionsUrl,
} from "@/lib/food/labels";
import { addMinutes } from "@/lib/itinerary-labels";
import { CATEGORY_LABELS } from "@/lib/map/layers";
import { formatDistance } from "@/lib/route-labels";
import { formatDay } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import { type FoodResponse, useFood } from "./use-food";

type ItineraryState = ReturnType<typeof useItinerary>;

const MOMENTS = Object.keys(MOMENT_LABELS) as FoodMoment[];
const MEAL_SLOT: Partial<Record<FoodMoment, string>> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
};

interface Filters {
  cuisine?: string;
  diet?: FoodDiet;
  terrace: boolean;
  maxMinutes?: number;
  style: FoodStyle;
}

const NO_FILTERS: Filters = { terrace: false, style: "any" };

function filtersSummary(filters: Filters) {
  const parts = [
    filters.cuisine ? cuisineLabel(filters.cuisine) : undefined,
    filters.diet === "vegan" ? "vegano" : filters.diet === "vegetarian" ? "vegetariano" : undefined,
    filters.terrace ? "terraza" : undefined,
    filters.style !== "any" ? STYLE_LABELS[filters.style].toLowerCase() : undefined,
    filters.maxMinutes ? `≤ ${filters.maxMinutes} min` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Ninguno";
}

export interface FoodFinderProps {
  trip: Trip;
  itinerary: ItineraryState;
  date: string;
  moment: FoodMoment;
  onMomentChange: (moment: FoodMoment) => void;
  onBack: () => void;
  /** Abrir la ficha del sitio y centrar el mapa en él. */
  onShowPlace: (place: Place) => void;
  selectedPlaceId?: string;
  headingLevel?: 2 | 3;
}

/**
 * Buscador gastronómico contextual (REQUISITOS §10): sitios reales de OSM abiertos a la hora de
 * la comida, cerca de la actividad anterior/siguiente o del hotel, que se añaden a la franja.
 */
export function FoodFinder({
  trip,
  itinerary,
  date,
  moment,
  onMomentChange,
  onBack,
  onShowPlace,
  selectedPlaceId,
  headingLevel = 2,
}: FoodFinderProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const RowHeading = headingLevel === 2 ? "h3" : "h4";
  const titleId = useId();
  const [near, setNear] = useState<FoodNear>();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [lastChosen, setLastChosen] = useState<string>();

  const day = itinerary.data.days.find((d) => d.date === date);
  const meal = day?.activities.find(
    (a) => a.kind === "meal" && MEAL_SLOT[moment] && a.planning?.slot === MEAL_SLOT[moment],
  );
  // Al cambiar el plan del día (horas, orden) se vuelve a medir; elegir sitio no cambia la consulta.
  const version = useMemo(
    () =>
      (day?.activities ?? [])
        .filter((a) => a.kind !== "meal" || a.id === meal?.id)
        .map((a) => `${a.id}@${a.startTime ?? ""}`)
        .join(","),
    [day, meal?.id],
  );
  const query = useFood(trip.id, { date, moment, near, ...filters }, version);
  const data = query.data;

  const choose = (place: Place | null) => {
    if (!meal) return;
    setLastChosen(place?.id ?? "none");
    itinerary.edit({ op: "set_meal_place", activityId: meal.id, place });
  };
  const chosenId = meal?.place?.id;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4" data-testid="food-finder">
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="-ml-2 min-h-11 self-start" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Volver al día
        </Button>
        <Heading id={titleId} className="text-base font-semibold">
          Dónde comer · {formatDay(date)}
        </Heading>
      </div>

      <fieldset>
        <legend className="sr-only">Momento del día</legend>
        <div className="grid grid-cols-4 gap-1 rounded-lg border p-1">
          {MOMENTS.map((value) => (
            <label
              key={value}
              className={cn(
                "has-focus-visible:ring-ring/50 flex min-h-11 cursor-pointer items-center justify-center rounded-md px-1 text-sm font-medium has-focus-visible:ring-3",
                value === moment ? "bg-primary text-primary-foreground" : "text-foreground",
              )}
            >
              <input
                type="radio"
                name={`${titleId}-moment`}
                value={value}
                checked={value === moment}
                onChange={() => {
                  setNear(undefined);
                  onMomentChange(value);
                }}
                className="sr-only"
              />
              {MOMENT_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <MealLine
        moment={moment}
        meal={meal}
        context={data?.context}
        itinerary={itinerary}
        onShowPlace={onShowPlace}
        onClear={() => choose(null)}
      />

      {itinerary.error ? (
        <p role="alert" className="text-destructive text-sm">
          {itinerary.error}
        </p>
      ) : null}

      {data ? (
        <ReferencePicker
          name={`${titleId}-near`}
          references={data.context.references}
          comparison={data.comparison}
          value={data.context.near}
          onChange={setNear}
          Heading={RowHeading}
        />
      ) : null}

      <FiltersDisclosure filters={filters} onChange={setFilters} cuisines={data?.cuisines ?? []} />

      <Results
        query={query}
        filters={filters}
        onClearFilters={() => setFilters(NO_FILTERS)}
        RowHeading={RowHeading}
        canChoose={meal !== undefined}
        mealTitle={meal?.title.toLowerCase()}
        chosenId={chosenId}
        justChosen={lastChosen === chosenId && !itinerary.editing}
        pending={itinerary.editing}
        onChoose={choose}
        onShowPlace={onShowPlace}
        selectedPlaceId={selectedPlaceId}
      />
    </section>
  );
}

function MealLine({
  moment,
  meal,
  context,
  itinerary,
  onShowPlace,
  onClear,
}: {
  moment: FoodMoment;
  meal: Trip["days"][number]["activities"][number] | undefined;
  context: FoodResponse["context"] | undefined;
  itinerary: ItineraryState;
  onShowPlace: (place: Place) => void;
  onClear: () => void;
}) {
  if (!meal) {
    return (
      <p className="text-muted-foreground text-sm">
        {context ? `Hacia las ${context.time}. ` : null}
        {moment === "snack"
          ? "La merienda no tiene franja en tu itinerario: desde la ficha de un sitio puedes añadirlo como visita."
          : "Este día no tiene esta franja en el itinerario: desde la ficha de un sitio puedes añadirlo como visita."}
      </p>
    );
  }
  const end = meal.startTime ? addMinutes(meal.startTime, meal.durationMinutes) : undefined;
  return (
    <div className="bg-muted/60 flex flex-col gap-1 rounded-lg border border-dashed px-3 py-2 text-sm">
      <p>
        <span className="font-medium">{meal.title}</span>{" "}
        <span className="tabular-nums">
          de {meal.startTime} a {end}
        </span>{" "}
        <span className="text-muted-foreground">(franja de tu itinerario)</span>
      </p>
      {meal.place ? (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>
            Sitio elegido:{" "}
            <button
              type="button"
              onClick={() => onShowPlace(meal.place!)}
              className="text-primary min-h-6 font-medium underline underline-offset-2"
            >
              {meal.place.name}
            </button>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground min-h-11"
            disabled={itinerary.editing}
            onClick={onClear}
          >
            Quitar sitio
          </Button>
        </p>
      ) : (
        <p className="text-muted-foreground">Sin sitio elegido todavía.</p>
      )}
    </div>
  );
}

function minutesText(comparison: FoodComparison | undefined) {
  if (!comparison) return undefined;
  const closest = comparison.closest;
  const count = `${comparison.count}${comparison.capped ? " o más" : ""} a ≤ ${comparison.withinMinutes} min a pie`;
  if (!closest) return "Sin sitios abiertos cerca";
  return closest.minutes !== undefined
    ? `${count} · el más cercano a ${closest.minutes} min`
    : `${count} · el más cercano a ${formatDistance(closest.straightMeters)} en línea recta`;
}

/** Elegir la referencia es también la comparación: cada opción dice cuánto hay cerca. */
function ReferencePicker({
  name,
  references,
  comparison,
  value,
  onChange,
  Heading,
}: {
  name: string;
  references: FoodReference[];
  comparison: FoodComparison[];
  value: FoodNear;
  onChange: (near: FoodNear) => void;
  Heading: "h3" | "h4";
}) {
  const headingId = useId();
  return (
    <div role="radiogroup" aria-labelledby={headingId} className="flex flex-col gap-2">
      <Heading id={headingId} className="text-sm font-semibold">
        Buscar cerca de
      </Heading>
      <div className="grid gap-2 sm:grid-cols-2">
        {references.map((ref) => {
          const checked = ref.key === value;
          const summary = minutesText(comparison.find((c) => c.key === ref.key));
          return (
            <label
              key={ref.key}
              data-testid={`food-near-${ref.key}`}
              className={cn(
                "has-focus-visible:ring-ring/50 flex min-h-11 cursor-pointer gap-2.5 rounded-lg border p-2.5 has-focus-visible:ring-3",
                checked ? "border-primary bg-accent" : "bg-card",
              )}
            >
              <input
                type="radio"
                name={name}
                value={ref.key}
                checked={checked}
                onChange={() => onChange(ref.key)}
                className="accent-primary mt-0.5 size-4 shrink-0"
              />
              <span className="flex min-w-0 flex-col text-sm">
                <span className="font-medium">{NEAR_LABELS[ref.key]}</span>
                <span className="truncate">
                  {ref.name}
                  {ref.time ? <span className="tabular-nums"> · {ref.time}</span> : null}
                </span>
                {summary ? (
                  <span className="text-muted-foreground text-xs tabular-nums">{summary}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function FiltersDisclosure({
  filters,
  onChange,
  cuisines,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  cuisines: { value: string; count: number }[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const terraceId = useId();
  const options =
    filters.cuisine && !cuisines.some((c) => c.value === filters.cuisine)
      ? [{ value: filters.cuisine, count: 0 }, ...cuisines]
      : cuisines;
  const chip = (pressed: boolean) =>
    cn(
      "focus-visible:ring-ring/50 min-h-11 rounded-full border px-3 text-sm outline-none focus-visible:ring-3",
      pressed ? "border-primary bg-primary text-primary-foreground" : "bg-card",
    );
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium outline-none focus-visible:ring-3"
      >
        <SlidersHorizontal aria-hidden className="text-muted-foreground size-4" />
        <span className="flex-1">Filtros</span>
        <span className="text-muted-foreground truncate font-normal">
          {filtersSummary(filters)}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={id} hidden={!open} className="flex flex-col gap-3 border-t px-3 py-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tipo de cocina
          <NativeSelect
            value={filters.cuisine ?? ""}
            onChange={(event) => onChange({ ...filters, cuisine: event.target.value || undefined })}
          >
            <option value="">Cualquiera</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {cuisineLabel(option.value)}
                {option.count > 0 ? ` (${option.count})` : ""}
              </option>
            ))}
          </NativeSelect>
          <span className="text-muted-foreground text-xs font-normal">
            Según la etiqueta de cocina de OpenStreetMap; muchos sitios no la tienen.
          </span>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Dieta</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                [undefined, "Cualquiera"],
                ["vegetarian", "Vegetariana"],
                ["vegan", "Vegana"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={filters.diet === value}
                onClick={() => onChange({ ...filters, diet: value })}
                className={chip(filters.diet === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Estilo</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STYLE_LABELS) as FoodStyle[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filters.style === value}
                onClick={() => onChange({ ...filters, style: value })}
                className={chip(filters.style === value)}
              >
                {STYLE_LABELS[value]}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Cocina local: española o regional según OSM. Rápida: comida rápida o solo para llevar.
          </p>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tiempo máximo a pie
          <NativeSelect
            value={filters.maxMinutes ?? ""}
            onChange={(event) =>
              onChange({
                ...filters,
                maxMinutes: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          >
            <option value="">Sin límite</option>
            {[5, 10, 15, 20].map((minutes) => (
              <option key={minutes} value={minutes}>
                Hasta {minutes} min
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label htmlFor={terraceId} className="text-sm font-medium">
            Solo con terraza
            <span className="text-muted-foreground block text-xs font-normal">Según OSM</span>
          </label>
          <Switch
            id={terraceId}
            checked={filters.terrace}
            onCheckedChange={(checked) => onChange({ ...filters, terrace: checked })}
          />
        </div>
      </div>
    </div>
  );
}

function Results({
  query,
  filters,
  onClearFilters,
  RowHeading,
  canChoose,
  mealTitle,
  chosenId,
  justChosen,
  pending,
  onChoose,
  onShowPlace,
  selectedPlaceId,
}: {
  query: ReturnType<typeof useFood>;
  filters: Filters;
  onClearFilters: () => void;
  RowHeading: "h3" | "h4";
  canChoose: boolean;
  mealTitle?: string;
  chosenId?: string;
  justChosen: boolean;
  pending: boolean;
  onChoose: (place: Place) => void;
  onShowPlace: (place: Place) => void;
  selectedPlaceId?: string;
}) {
  if (query.isLoading) {
    return (
      <div aria-busy className="flex flex-col gap-3" data-testid="food-loading">
        <p role="status" className="text-muted-foreground text-sm">
          Buscando sitios abiertos y midiendo el camino a pie…
        </p>
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex flex-col gap-2 border-b pb-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    );
  }
  if (query.isError || !query.data) {
    const error = query.error;
    return (
      <Alert variant="destructive" data-testid="food-error">
        <AlertDescription>
          <p>
            {error instanceof ApiError && error.status === 502
              ? "OpenStreetMap no responde ahora mismo y no se pueden cargar los sitios para comer. Reintenta en unos segundos."
              : error instanceof ApiError
                ? error.message
                : "No se han podido cargar los sitios para comer."}
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
  const near = data.context.near;
  const reference = data.context.references.find((r) => r.key === near)!;
  const others = data.context.references.filter((r) => r.key !== near);
  const filtered = filtersSummary(filters) !== "Ninguno";

  return (
    <div className="flex flex-col gap-3" aria-busy={query.isFetching}>
      <p role="status" className="text-muted-foreground text-sm">
        {data.results.length > 0
          ? `${data.results.length} sitio${data.results.length === 1 ? "" : "s"}, del más cercano al más lejano.`
          : null}
        {data.totals.closed > 0
          ? ` ${data.totals.closed} cerrado${data.totals.closed === 1 ? "" : "s"} a esa hora según OSM (no se muestran).`
          : null}
      </p>
      {justChosen && chosenId ? (
        <p
          role="status"
          className="border-primary bg-accent rounded-md border-l-4 px-3 py-2 text-sm"
        >
          Añadido a la {mealTitle}. Las horas y los trayectos del día se han recalculado.
        </p>
      ) : null}
      {data.travel.quality !== "routed" ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {data.travel.quality === "partial"
            ? "Algunos sitios no tienen tiempo a pie calculado: van al final, con la distancia en línea recta."
            : "Sin tiempos a pie calculados: se ordena por distancia en línea recta."}
        </p>
      ) : null}
      {data.warnings.map((warning) => (
        <p key={warning} className="text-muted-foreground text-xs">
          {warning}
        </p>
      ))}

      {data.results.length === 0 ? (
        <div
          className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4"
          data-testid="food-empty"
        >
          <p className="font-medium">
            {data.totals.zone === 0
              ? "OpenStreetMap no tiene sitios para comer en esta zona"
              : filtered
                ? "Ningún sitio cumple los filtros"
                : "No hay sitios abiertos a esa hora cerca"}
          </p>
          {filtered ? (
            <Button variant="outline" size="sm" className="min-h-11" onClick={onClearFilters}>
              Quitar filtros
            </Button>
          ) : (
            <a
              href={`https://www.openstreetmap.org/#map=17/${reference.location.lat.toFixed(5)}/${reference.location.lng.toFixed(5)}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-sm underline underline-offset-2"
            >
              Ver la zona en OpenStreetMap (enlace externo)
            </a>
          )}
        </div>
      ) : (
        <ol className="flex flex-col" aria-label={`Sitios cerca de ${reference.name}`}>
          {data.results.map((result) => (
            <FoodRow
              key={result.place.id}
              result={result}
              reference={reference}
              others={others}
              Heading={RowHeading}
              canChoose={canChoose}
              chosen={result.place.id === chosenId}
              pending={pending}
              onChoose={() => onChoose(result.place)}
              onShowPlace={() => onShowPlace(result.place)}
              selected={result.place.id === selectedPlaceId}
            />
          ))}
        </ol>
      )}

      <p className="text-muted-foreground text-xs">
        Sin valoraciones ni menús: no hay un proveedor de valoraciones configurado. El precio solo
        aparece si OpenStreetMap publica el rango del local.
      </p>
      <div className="flex flex-col gap-1">
        {data.results[0] ? (
          <DataSource
            source={{
              ...data.results[0].place.source,
              url: "https://www.openstreetmap.org/copyright",
            }}
            isDemo={data.results[0].place.isDemo}
          />
        ) : null}
        {data.travel.source ? (
          <DataSource source={data.travel.source} isDemo={data.travel.isDemo ?? false} />
        ) : null}
      </div>
    </div>
  );
}

function distanceLine(result: FoodResult, ref: FoodReference) {
  const distance = result.distances[ref.key];
  if (!distance) return undefined;
  return distance.minutes !== undefined
    ? `${distance.minutes} min a pie${distance.meters ? ` (${formatDistance(distance.meters)})` : ""}`
    : `${formatDistance(distance.straightMeters)} en línea recta (sin tiempo calculado)`;
}

function FoodRow({
  result,
  reference,
  others,
  Heading,
  canChoose,
  chosen,
  pending,
  onChoose,
  onShowPlace,
  selected,
}: {
  result: FoodResult;
  reference: FoodReference;
  others: FoodReference[];
  Heading: "h3" | "h4";
  canChoose: boolean;
  chosen: boolean;
  pending: boolean;
  onChoose: () => void;
  onShowPlace: () => void;
  selected: boolean;
}) {
  const { place, opening } = result;
  const cuisine = (place.cuisine ?? []).slice(0, 3).map(cuisineLabel).join(", ");
  const traits = [
    place.food?.outdoorSeating ? "Terraza" : undefined,
    dietText(place.food),
    place.food?.takeaway === "only" ? "Solo para llevar" : undefined,
  ].filter(Boolean);
  const toward = reference.key === "next" ? "hasta" : "desde";
  return (
    <li
      className={cn(
        "flex flex-col gap-1.5 border-b py-3 first:pt-0",
        selected && "border-l-cta -ml-3 border-l-4 pl-2",
      )}
      data-testid="food-result"
    >
      <Heading className="text-sm leading-snug font-semibold">
        <button
          type="button"
          onClick={onShowPlace}
          className="focus-visible:ring-ring/50 rounded text-left underline-offset-2 outline-none hover:underline focus-visible:ring-3"
        >
          {place.name}
        </button>
      </Heading>
      <p className="text-muted-foreground text-xs">
        {CATEGORY_LABELS[place.category]}
        {cuisine ? ` · ${cuisine}` : ""}
      </p>
      <p
        className={cn(
          "flex items-center gap-1 text-xs",
          opening.status === "open" ? "text-primary" : "text-amber-800 dark:text-amber-300",
        )}
      >
        {opening.status === "open" ? (
          <CircleCheck aria-hidden className="size-3.5" />
        ) : (
          <AlertTriangle aria-hidden className="size-3.5" />
        )}
        {opening.status === "open"
          ? `Abierto${opening.window ? ` de ${opening.window.start} a ${opening.window.end}` : ""} según OSM`
          : opening.status === "no_hours"
            ? "Horario pendiente de confirmar (OSM no lo publica)"
            : "Horario pendiente de confirmar"}
      </p>
      <p className="flex items-start gap-1.5 text-sm tabular-nums">
        <Footprints aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span>
          {distanceLine(result, reference)}{" "}
          <span className="text-muted-foreground">
            {toward} {reference.name}
          </span>
          {others.map((other) => {
            const text = distanceLine(result, other);
            return text ? (
              <span key={other.key} className="text-muted-foreground block text-xs">
                {NEAR_LABELS[other.key]}: {text}
              </span>
            ) : null;
          })}
        </span>
      </p>
      <p className="text-muted-foreground text-xs">{[...traits, priceText(place)].join(" · ")}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {canChoose ? (
          chosen ? (
            <span className="text-primary inline-flex min-h-11 items-center gap-1 text-sm font-medium">
              <CircleCheck aria-hidden className="size-4" /> Elegido
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={pending}
              onClick={onChoose}
            >
              Elegir para esta comida
              <span className="sr-only">: {place.name}</span>
            </Button>
          )
        ) : null}
        <a
          href={walkingDirectionsUrl(reference.location, place.location)}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-2"
        >
          <Navigation aria-hidden className="size-3.5" />
          Cómo llegar
          <span className="sr-only"> a {place.name} (Google Maps, se abre en otra pestaña)</span>
        </a>
        {place.website ? (
          <a
            href={place.website}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-2"
          >
            Web
            <ExternalLink aria-hidden className="size-3" />
            <span className="sr-only"> de {place.name} (se abre en otra pestaña)</span>
          </a>
        ) : null}
        {place.food?.reservationUrl ? (
          <a
            href={place.food.reservationUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-2"
          >
            Reservar en su web
            <ExternalLink aria-hidden className="size-3" />
            <span className="sr-only"> (enlace externo; abrirlo no reserva)</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}
