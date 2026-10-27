"use client";

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BedDouble,
  CalendarDays,
  Car,
  CircleCheck,
  Clock,
  Coffee,
  ExternalLink,
  Footprints,
  GripVertical,
  MapPinned,
  Lock,
  LockOpen,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { DataSource, DemoBadge } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import type { ItineraryEdit } from "@/domain/itinerary";
import type { Place } from "@/domain/place";
import type { Activity, ItineraryDay, Leg, Trip } from "@/domain/trip";
import {
  addMinutes,
  dayTravelMinutes,
  legTo,
  OPENING_LABELS,
  SLOT_LABELS,
  UNSCHEDULED_LABELS,
  WARNING_LABELS,
} from "@/lib/itinerary-labels";
import { formatDistance, formatDuration } from "@/lib/route-labels";
import { formatDay, formatMinutes, formatMoney, PACE_LABELS } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import type { useItinerary } from "./use-itinerary";

type ItineraryState = ReturnType<typeof useItinerary>;

const BOOKING_LABELS: Record<Activity["bookingRequirement"], string> = {
  ticket_required: "Entrada obligatoria",
  booking_recommended: "Reserva recomendada",
  free: "Entrada libre",
  no_booking: "Sin reserva",
  unverified: "Reserva sin verificar",
};

export interface ItineraryPanelProps {
  trip: Trip;
  itinerary: ItineraryState;
  /** Día que se muestra (y cuya ruta dibuja el mapa). */
  date: string | undefined;
  onDateChange: (date: string) => void;
  /** Abrir la ficha de un lugar y centrar el mapa en él. */
  onSelectPlace: (place: Place) => void;
  selectedPlaceId?: string;
  headingLevel?: 2 | 3;
  /** La ruta del día se dibuja en el mapa (capa 5). */
  routeShown: boolean;
  onToggleRoute: () => void;
}

export function ItineraryPanel({
  trip,
  itinerary,
  date,
  onDateChange,
  onSelectPlace,
  selectedPlaceId,
  headingLevel = 3,
  routeShown,
  onToggleRoute,
}: ItineraryPanelProps) {
  const { data } = itinerary;
  const hasPlan = data.days.some((day) => day.activities.length > 0);
  const day = data.days.find((d) => d.date === date) ?? data.days[0];
  const Heading = `h${headingLevel}` as const;

  if (!hasPlan) {
    return <EmptyItinerary trip={trip} itinerary={itinerary} />;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="itinerary">
      <DayPicker days={data.days} value={day?.date} onChange={onDateChange} />
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground -mt-2 min-h-11 self-start"
        aria-pressed={routeShown}
        onClick={onToggleRoute}
      >
        <MapPinned aria-hidden />
        {routeShown ? "Ruta del día visible en el mapa" : "Mostrar la ruta del día en el mapa"}
      </Button>
      {day ? (
        <DayView
          key={day.date}
          trip={trip}
          day={day}
          days={data.days}
          itinerary={itinerary}
          onSelectPlace={onSelectPlace}
          selectedPlaceId={selectedPlaceId}
          Heading={Heading}
        />
      ) : null}
      {itinerary.error ? (
        <p role="alert" className="text-destructive text-sm">
          {itinerary.error}
        </p>
      ) : null}
      <Unscheduled
        trip={trip}
        itinerary={itinerary}
        day={day}
        onSelectPlace={onSelectPlace}
        Heading={Heading}
      />
      <PlanSources itinerary={itinerary} />
      <div className="flex flex-col gap-1.5 border-t pt-3">
        <Button
          variant="outline"
          className="min-h-11 self-start"
          disabled={itinerary.generating}
          onClick={itinerary.generate}
        >
          <RefreshCw aria-hidden className={cn(itinerary.generating && "animate-spin")} />
          {itinerary.generating ? "Recalculando el plan…" : "Rehacer el plan"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Vuelve a repartir las visitas. Lo que tengas bloqueado se queda en su día y hora.
        </p>
      </div>
    </div>
  );
}

function EmptyItinerary({ trip, itinerary }: { trip: Trip; itinerary: ItineraryState }) {
  const pace = trip.pace;
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4"
      data-testid="itinerary-empty"
    >
      <CalendarDays className="text-primary size-6" aria-hidden />
      <p className="font-medium">Todavía no hay plan por días</p>
      <p className="text-muted-foreground text-sm">
        TripMind reparte las visitas por zonas alrededor de{" "}
        {trip.hotel ? trip.hotel.name : "el centro del destino"}, con ritmo{" "}
        {PACE_LABELS[pace.level].title.toLowerCase()}, de {pace.dayStart} a {pace.dayEnd}, y reserva
        tiempo para comer. Solo propone lugares reales y respeta sus horarios publicados.
      </p>
      <Button
        variant="cta"
        className="min-h-11"
        disabled={itinerary.generating}
        onClick={itinerary.generate}
      >
        <Sparkles aria-hidden />
        {itinerary.generating ? "Calculando el plan…" : "Crear el plan por días"}
      </Button>
      {itinerary.generating ? (
        <p role="status" className="text-muted-foreground text-sm">
          Calculando trayectos y horarios…
        </p>
      ) : null}
      {itinerary.error ? (
        <p role="alert" className="text-destructive text-sm">
          {itinerary.error}{" "}
          {itinerary.externalUrl ? (
            <a href={itinerary.externalUrl} target="_blank" rel="noreferrer" className="underline">
              Ver la zona en OpenStreetMap (enlace externo)
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function DayPicker({
  days,
  value,
  onChange,
}: {
  days: ItineraryDay[];
  value?: string;
  onChange: (date: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Día del itinerario"
      className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pb-1"
    >
      {days.map((day, index) => {
        const [weekday, ...rest] = formatDay(day.date).split(" ");
        const active = day.date === value;
        return (
          <button
            key={day.date}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(day.date)}
            className={cn(
              "focus-visible:ring-ring/50 flex min-h-12 min-w-16 shrink-0 flex-col items-center justify-center rounded-lg border px-2.5 py-1 text-xs outline-none focus-visible:ring-3",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-muted",
            )}
          >
            <span className="font-semibold tabular-nums">Día {index + 1}</span>
            <span className={cn(active ? "text-primary-foreground" : "text-muted-foreground")}>
              {weekday?.replace(",", "")} {rest.join(" ")}
              {day.isRestDay ? " · libre" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DayView({
  trip,
  day,
  days,
  itinerary,
  onSelectPlace,
  selectedPlaceId,
  Heading,
}: {
  trip: Trip;
  day: ItineraryDay;
  days: ItineraryDay[];
  itinerary: ItineraryState;
  onSelectPlace: (place: Place) => void;
  selectedPlaceId?: string;
  Heading: "h2" | "h3";
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // Teclado: flechas sobre el asa (más fiable que el sensor de dnd-kit con filas de alturas
  // distintas). Tras mover se devuelve el foco al asa y se anuncia la nueva posición.
  const [focusId, setFocusId] = useState<string>();
  const [announcement, setAnnouncement] = useState("");
  const ids = day.activities.map((a) => a.id);
  const visits = day.activities.filter((a) => a.place);
  const numbers = useMemo(() => {
    const map = new Map<string, number>();
    for (const activity of day.activities) if (activity.place) map.set(activity.id, map.size + 1);
    return map;
  }, [day.activities]);
  const names = new Map(day.activities.map((a) => [a.id, a.title]));
  const returnLeg = legTo(day, undefined);

  useEffect(() => {
    if (!focusId) return;
    document
      .querySelector<HTMLElement>(`[data-activity-id="${focusId}"] [data-drag-handle]`)
      ?.focus();
    setFocusId(undefined);
  }, [focusId, day.activities]);

  const moveByKey = (activityId: string, delta: -1 | 1) => {
    const index = ids.indexOf(activityId);
    const position = index + delta;
    if (index < 0 || position < 0 || position >= ids.length) return;
    setFocusId(activityId);
    setAnnouncement(
      `${names.get(activityId)} pasa a la posición ${position + 1} de ${ids.length}.`,
    );
    itinerary.edit({ op: "move", activityId, date: day.date, position });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const position = ids.indexOf(String(over.id));
    itinerary.edit({ op: "move", activityId: String(active.id), date: day.date, position });
  };

  let lastSlot: string | undefined;
  return (
    <section aria-labelledby={`day-${day.date}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Heading
            id={`day-${day.date}`}
            className="text-base font-semibold first-letter:uppercase"
          >
            {formatDay(day.date)}
          </Heading>
          <p className="text-muted-foreground text-sm tabular-nums">
            {day.isRestDay && visits.length === 0
              ? "Día libre, sin actividades"
              : `${visits.length === 1 ? "1 visita" : `${visits.length} visitas`} · ${formatMinutes(dayTravelMinutes(day))} de trayectos`}
          </p>
        </div>
        {visits.length > 1 ? (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={itinerary.editing}
            onClick={() => itinerary.edit({ op: "reorganize", date: day.date })}
          >
            Reorganizar el día
          </Button>
        ) : null}
      </div>

      {day.activities.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
          {day.isRestDay
            ? "Lo marcaste como día libre. Puedes añadir lugares desde su ficha si cambias de idea."
            : "No hay actividades este día. Añade lugares desde su ficha con «Añadir al itinerario»."}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Arrastra la actividad con el ratón o el dedo, o usa las flechas arriba y abajo para cambiarla de posición.",
            },
            announcements: {
              onDragStart: ({ active }) => `Has cogido ${names.get(String(active.id))}.`,
              onDragOver: ({ active, over }) =>
                over
                  ? `${names.get(String(active.id))} irá en la posición ${ids.indexOf(String(over.id)) + 1}.`
                  : "",
              onDragEnd: ({ active, over }) =>
                over
                  ? `${names.get(String(active.id))} queda en la posición ${ids.indexOf(String(over.id)) + 1}.`
                  : "Movimiento cancelado.",
              onDragCancel: () => "Movimiento cancelado.",
            },
          }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col" aria-label={`Actividades del ${formatDay(day.date)}`}>
              {day.activities.map((activity, index) => {
                const slot = activity.planning?.slot;
                const showSlot =
                  activity.place &&
                  slot &&
                  slot !== lastSlot &&
                  slot !== "lunch" &&
                  slot !== "dinner";
                if (slot) lastSlot = slot;
                return (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    index={index}
                    count={day.activities.length}
                    number={numbers.get(activity.id)}
                    slotLabel={showSlot ? SLOT_LABELS[slot] : undefined}
                    leg={activity.place ? legTo(day, activity.id) : undefined}
                    fromHotel={trip.hotel?.name}
                    day={day}
                    days={days}
                    itinerary={itinerary}
                    onSelectPlace={onSelectPlace}
                    onMoveKey={(delta) => moveByKey(activity.id, delta)}
                    selected={activity.place !== undefined && activity.place.id === selectedPlaceId}
                  />
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {returnLeg && trip.hotel ? (
        <div className="flex items-center gap-2 pl-1 text-sm">
          <BedDouble className="text-muted-foreground size-4" aria-hidden />
          <span>
            Vuelta a {trip.hotel.name}: <LegText leg={returnLeg} />
          </span>
        </div>
      ) : null}
    </section>
  );
}

function LegText({ leg }: { leg: Leg }) {
  const mode = leg.mode === "walk" ? "a pie" : "en taxi o coche";
  if (leg.quality === "approximate" || leg.durationMinutes === undefined) {
    return (
      <span>
        sin tiempo calculado {mode}; se reservan ≈
        {formatMinutes(Math.round(leg.reservedMinutes ?? 0))} (estimación).{" "}
        {leg.externalUrl ? (
          <a
            href={leg.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Ver el trayecto en Google Maps (enlace externo)
          </a>
        ) : null}
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {formatDuration(leg.durationMinutes)} {mode}
      {leg.distanceMeters ? ` · ${formatDistance(leg.distanceMeters)}` : ""}
      {leg.reservedMinutes
        ? ` · +${Math.round(leg.reservedMinutes)} min de margen (estimación)`
        : ""}
    </span>
  );
}

function ActivityRow({
  activity,
  index,
  count,
  number,
  slotLabel,
  leg,
  fromHotel,
  day,
  days,
  itinerary,
  onSelectPlace,
  onMoveKey,
  selected,
}: {
  activity: Activity;
  index: number;
  count: number;
  number?: number;
  slotLabel?: string;
  leg?: Leg;
  fromHotel?: string;
  day: ItineraryDay;
  days: ItineraryDay[];
  itinerary: ItineraryState;
  onSelectPlace: (place: Place) => void;
  onMoveKey: (delta: -1 | 1) => void;
  selected: boolean;
}) {
  const sortable = useSortable({ id: activity.id });
  const [open, setOpen] = useState(false);
  const optionsId = useId();
  const style = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  };
  const edit = (change: ItineraryEdit) => itinerary.edit(change);
  const start = activity.startTime;
  const end = start ? addMinutes(start, activity.durationMinutes) : undefined;
  const opening = activity.planning?.openingStatus;
  const warnings = activity.planning?.warnings ?? [];
  const isMeal = !activity.place;
  const MealIcon =
    activity.planning?.slot === "breakfast" ? Coffee : activity.kind === "meal" ? Utensils : Clock;
  const LegIcon = leg?.mode === "car" ? Car : Footprints;
  const fromLabel =
    leg && !leg.fromActivityId ? `Desde ${fromHotel ?? "el hotel"}` : "Desde la anterior";

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={cn("relative", sortable.isDragging && "z-10 opacity-80")}
      data-testid="itinerary-activity"
      data-activity-id={activity.id}
    >
      {slotLabel ? (
        <p className="text-muted-foreground mt-2 mb-1 pl-12 text-xs font-medium">{slotLabel}</p>
      ) : null}
      {leg ? (
        <p className="text-muted-foreground flex items-start gap-2 py-1 pl-12 text-xs">
          <LegIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">{fromLabel}: </span>
            <LegText leg={leg} />
          </span>
        </p>
      ) : null}
      <div
        className={cn(
          "flex gap-2 rounded-lg border",
          // Las franjas de comida pesan menos que las visitas: fila más compacta.
          isMeal ? "bg-muted/60 border-dashed px-2 py-1" : "bg-card p-2",
          selected && "border-cta ring-cta/30 ring-2",
          warnings.length > 0 && "border-destructive/60",
        )}
      >
        <div className="flex w-10 shrink-0 flex-col items-center gap-1">
          {number ? (
            <span
              aria-hidden
              className="border-primary text-primary flex size-7 items-center justify-center rounded-md border-[3px] bg-white text-sm font-bold tabular-nums"
            >
              {number}
            </span>
          ) : (
            <MealIcon className="text-muted-foreground mt-1 size-5" aria-hidden />
          )}
          <span className="text-xs font-medium tabular-nums">{start}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <p className="min-w-0 flex-1 text-sm leading-snug font-medium">
              {activity.place ? (
                <button
                  type="button"
                  onClick={() => onSelectPlace(activity.place!)}
                  className="focus-visible:ring-ring/50 rounded text-left underline-offset-2 outline-none hover:underline focus-visible:ring-3"
                >
                  {number ? <span className="sr-only">Parada {number}: </span> : null}
                  {activity.title}
                </button>
              ) : (
                activity.title
              )}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-pressed={activity.locked}
              disabled={itinerary.editing}
              onClick={() =>
                edit({ op: "lock", activityId: activity.id, locked: !activity.locked })
              }
            >
              {activity.locked ? (
                <Lock aria-hidden className="text-cta" />
              ) : (
                <LockOpen aria-hidden />
              )}
              <span className="sr-only">
                {activity.locked
                  ? `Desbloquear ${activity.title}`
                  : `Bloquear ${activity.title} en esta hora`}
              </span>
            </Button>
            <button
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
              data-drag-handle
              aria-roledescription="actividad reordenable"
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  onMoveKey(event.key === "ArrowUp" ? -1 : 1);
                }
              }}
              className="text-muted-foreground focus-visible:ring-ring/50 flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md outline-none focus-visible:ring-3"
            >
              <GripVertical aria-hidden className="size-4" />
              <span className="sr-only">Arrastrar para reordenar {activity.title}</span>
            </button>
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {start}–{end} · {formatMinutes(activity.durationMinutes)}
            {activity.place && activity.planning?.durationEstimated ? " (duración estimada)" : ""}
            {activity.locked ? " · hora bloqueada" : ""}
          </p>
          {activity.place ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs">
              {opening ? (
                <li
                  className={cn(
                    "flex items-center gap-1",
                    OPENING_LABELS[opening].tone === "ok" && "text-primary",
                    OPENING_LABELS[opening].tone === "pending" &&
                      "text-amber-800 dark:text-amber-300",
                    OPENING_LABELS[opening].tone === "bad" && "text-destructive",
                  )}
                >
                  {OPENING_LABELS[opening].tone === "ok" ? (
                    <CircleCheck aria-hidden className="size-3.5" />
                  ) : (
                    <AlertTriangle aria-hidden className="size-3.5" />
                  )}
                  {OPENING_LABELS[opening].text}
                </li>
              ) : null}
              <li className="text-muted-foreground">
                {activity.price &&
                activity.price.certainty !== "unknown" &&
                activity.price.amount !== undefined
                  ? `${formatMoney(activity.price.amount, activity.price.currency ?? "EUR")} (${activity.price.certainty === "confirmed" ? "confirmado" : "orientativo"})`
                  : "Sin precio"}{" "}
                · {BOOKING_LABELS[activity.bookingRequirement]}
              </li>
              {activity.place.website ? (
                <li>
                  <a
                    href={activity.place.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex min-h-6 items-center gap-1 underline underline-offset-2"
                  >
                    {activity.place.websiteSource === "wikidata" ? "Web oficial" : "Web"}
                    <ExternalLink aria-hidden className="size-3" />
                    <span className="sr-only">(se abre en otra pestaña)</span>
                  </a>
                </li>
              ) : null}
              {activity.planning?.alternative && opening !== "open" ? (
                <li className="text-muted-foreground">
                  Si está cerrado:{" "}
                  <button
                    type="button"
                    onClick={() => onSelectPlace(activity.planning!.alternative!)}
                    className="text-primary min-h-6 underline underline-offset-2"
                  >
                    {activity.planning.alternative.name}
                  </button>{" "}
                  (abierto a esa hora)
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {activity.kind === "meal"
                ? "Franja reservada; los restaurantes cercanos llegarán más adelante."
                : "Tiempo sin planificar para lo que te apetezca."}
            </p>
          )}
          {warnings.length > 0 ? (
            <ul className="text-destructive mt-1 flex flex-col gap-0.5 text-xs font-medium">
              {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {WARNING_LABELS[warning]}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground -ml-2 min-h-11"
              aria-expanded={open}
              aria-controls={optionsId}
              onClick={() => setOpen((value) => !value)}
            >
              <MoreHorizontal aria-hidden />
              Cambiar
              <span className="sr-only"> {activity.title}</span>
            </Button>
          </div>
          {open ? (
            <ActivityOptions
              id={optionsId}
              activity={activity}
              index={index}
              count={count}
              day={day}
              days={days}
              itinerary={itinerary}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ActivityOptions({
  id,
  activity,
  index,
  count,
  day,
  days,
  itinerary,
}: {
  id: string;
  activity: Activity;
  index: number;
  count: number;
  day: ItineraryDay;
  days: ItineraryDay[];
  itinerary: ItineraryState;
}) {
  const [time, setTime] = useState(activity.startTime ?? "10:00");
  const [target, setTarget] = useState(day.date);
  const timeId = useId();
  const dayId = useId();
  const disabled = itinerary.editing;
  const move = (position: number) =>
    itinerary.edit({ op: "move", activityId: activity.id, date: day.date, position });

  return (
    <div id={id} className="bg-muted/50 mt-1 flex flex-col gap-3 rounded-md p-2.5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={disabled || index === 0}
          onClick={() => move(index - 1)}
        >
          <ArrowUp aria-hidden /> Antes
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={disabled || index === count - 1}
          onClick={() => move(index + 1)}
        >
          <ArrowDown aria-hidden /> Después
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={disabled}
          onClick={() =>
            itinerary.edit({ op: "reorganize", date: day.date, afterActivityId: activity.id })
          }
        >
          Reorganizar lo que viene después
        </Button>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          itinerary.edit({ op: "set_time", activityId: activity.id, time });
        }}
      >
        <label htmlFor={timeId} className="flex flex-col gap-1 text-xs font-medium">
          Hora de inicio
          <input
            id={timeId}
            type="time"
            required
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="border-input bg-background focus-visible:ring-ring/50 min-h-11 rounded-md border px-2 text-sm tabular-nums outline-none focus-visible:ring-3"
          />
        </label>
        <Button type="submit" size="sm" className="min-h-11" disabled={disabled}>
          Fijar hora
        </Button>
      </form>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (target === day.date) return;
          const destination = days.find((d) => d.date === target);
          itinerary.edit({
            op: "move",
            activityId: activity.id,
            date: target,
            position: destination?.activities.length ?? 0,
          });
        }}
      >
        <label htmlFor={dayId} className="flex flex-col gap-1 text-xs font-medium">
          Mover a otro día
          <select
            id={dayId}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="border-input bg-background focus-visible:ring-ring/50 min-h-11 rounded-md border px-2 text-sm outline-none focus-visible:ring-3"
          >
            {days.map((option, i) => (
              <option key={option.date} value={option.date}>
                Día {i + 1} · {formatDay(option.date)}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={disabled || target === day.date}
        >
          Mover
        </Button>
      </form>
      <Button
        variant="destructive"
        size="sm"
        className="min-h-11 self-start"
        disabled={disabled}
        onClick={() => itinerary.edit({ op: "remove", activityId: activity.id })}
      >
        <Trash2 aria-hidden /> Quitar del plan
      </Button>
    </div>
  );
}

function Unscheduled({
  trip,
  itinerary,
  day,
  onSelectPlace,
  Heading,
}: {
  trip: Trip;
  itinerary: ItineraryState;
  day?: ItineraryDay;
  onSelectPlace: (place: Place) => void;
  Heading: "h2" | "h3";
}) {
  const list = itinerary.data.meta?.unscheduled ?? [];
  const planned = new Set(
    itinerary.data.days.flatMap((d) => d.activities.flatMap((a) => (a.place ? [a.place.id] : []))),
  );
  const pending = list.filter((entry) => !planned.has(entry.place.id));
  if (pending.length === 0) return null;
  return (
    <details className="rounded-lg border p-3">
      <summary className="focus-visible:ring-ring/50 min-h-6 cursor-pointer text-sm font-medium outline-none focus-visible:ring-3">
        <Heading className="inline">Se quedaron fuera ({pending.length})</Heading>
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {pending.map(({ place, reason }) => (
          <li
            key={place.id}
            className="flex flex-wrap items-center justify-between gap-x-2 text-sm"
          >
            <span className="min-w-0">
              <button
                type="button"
                onClick={() => onSelectPlace(place)}
                className="text-primary underline underline-offset-2"
              >
                {place.name}
              </button>{" "}
              <span className="text-muted-foreground text-xs">({UNSCHEDULED_LABELS[reason]})</span>
            </span>
            {day && !day.isRestDay && trip ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                disabled={itinerary.editing}
                onClick={() => itinerary.edit({ op: "add", date: day.date, place })}
              >
                Añadir a este día
                <span className="sr-only">: {place.name}</span>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function PlanSources({ itinerary }: { itinerary: ItineraryState }) {
  const meta = itinerary.data.meta;
  if (!meta) return null;
  return (
    <div className="text-muted-foreground flex flex-col gap-1.5 text-xs">
      {meta.notices.map((notice) => (
        <p key={notice} className="text-amber-800 dark:text-amber-300">
          {notice}
        </p>
      ))}
      {meta.travel.source ? (
        <span>
          Tiempos de trayecto:{" "}
          <DataSource source={meta.travel.source} isDemo={meta.travel.isDemo ?? false} />
        </span>
      ) : (
        <p>{meta.travel.message ?? "Sin tiempos de trayecto calculados."}</p>
      )}
      <span className="inline-flex flex-wrap items-center gap-2">
        Lugares y horarios: {meta.places.sourceName} (OpenStreetMap, horario sin garantía)
        {meta.places.isDemo ? <DemoBadge /> : null}
      </span>
      <p>Las duraciones son estimaciones de TripMind por tipo de lugar.</p>
    </div>
  );
}
