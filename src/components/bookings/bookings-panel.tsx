"use client";

import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  CircleCheck,
  Info,
  PencilLine,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BookingStatus } from "@/domain/booking";
import type { Activity, Trip } from "@/domain/trip";
import {
  type BudgetPart,
  type BudgetSummary,
  type Deviation,
  formatPrice,
} from "@/lib/booking/budget";
import { HOTEL_STATUS_LABELS } from "@/lib/booking/labels";
import { BUDGET_CATEGORY_LABELS, formatDay } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import type { ItineraryResponse } from "@/components/itinerary/use-itinerary";
import {
  BookingEditor,
  BookingLinks,
  BookingNoteLine,
  RequirementTag,
  StatusTag,
} from "./booking-ui";
import { TicketsProviderNote } from "./place-tickets";
import { bookableActivities, type BookingsState } from "./use-bookings";

type Group = "to_book" | "noted" | "unverified" | "not_needed" | "cancelled";

const GROUP_LABELS: Record<Group, { title: string; empty?: string }> = {
  to_book: { title: "Por reservar" },
  noted: { title: "Reservadas o compradas" },
  unverified: { title: "Pendientes de verificar" },
  not_needed: { title: "Gratis o sin reserva" },
  cancelled: { title: "Canceladas" },
};

function groupOf(activity: Activity): Group {
  const status = activity.bookingStatus;
  if (status === "cancelled") return "cancelled";
  if (status === "booked" || status === "ticket_purchased") return "noted";
  if (activity.bookingRequirement === "ticket_required") return "to_book";
  if (activity.bookingRequirement === "booking_recommended") return "to_book";
  if (activity.bookingRequirement === "unverified") return "unverified";
  return "not_needed";
}

export function BookingsPanel({
  trip,
  itinerary,
  bookings,
  headingLevel = 3,
  onSelectPlace,
  onOpenItinerary,
}: {
  trip: Trip;
  itinerary: ItineraryResponse;
  bookings: BookingsState;
  headingLevel?: 2 | 3;
  onSelectPlace: (activity: Activity) => void;
  onOpenItinerary: () => void;
}) {
  const Heading = `h${headingLevel}` as const;
  const SubHeading = `h${headingLevel + 1}` as "h3" | "h4";
  const items = bookableActivities(itinerary.days);
  const currency = trip.budget.currency;
  const groups = (Object.keys(GROUP_LABELS) as Group[])
    .map((group) => ({ group, items: items.filter(({ activity }) => groupOf(activity) === group) }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="budget-title" className="flex flex-col gap-3">
        <Heading id="budget-title" className="text-base font-semibold">
          Presupuesto
        </Heading>
        <BudgetTotal budget={bookings.budget} />
      </section>

      <section aria-labelledby="bookings-title" className="flex flex-col gap-3">
        <Heading id="bookings-title" className="text-base font-semibold">
          Tus reservas
        </Heading>
        <p className="text-muted-foreground text-xs">
          Abrir un enlace no reserva nada: anota aquí lo que reserves o pagues.
        </p>
        {bookings.hotel ? (
          <HotelBooking trip={trip} bookings={bookings} SubHeading={SubHeading} />
        ) : null}
        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Aún no hay actividades en el itinerario.</p>
            <p className="text-muted-foreground text-sm">
              Genera el plan para ver qué visitas piden entrada o reserva.
            </p>
            <Button variant="outline" className="min-h-11" onClick={onOpenItinerary}>
              <CalendarDays aria-hidden />
              Ir al itinerario
            </Button>
          </div>
        ) : (
          groups.map(({ group, items: entries }) => (
            <section key={group} aria-labelledby={`bookings-${group}`} className="flex flex-col">
              <SubHeading
                id={`bookings-${group}`}
                className="text-muted-foreground mb-1 text-sm font-medium"
              >
                {GROUP_LABELS[group].title} <span className="tabular-nums">({entries.length})</span>
              </SubHeading>
              <ul className="divide-y rounded-lg border">
                {entries.map(({ activity, date }) => (
                  <BookingRow
                    key={activity.id}
                    activity={activity}
                    date={date}
                    currency={currency}
                    bookings={bookings}
                    onSelectPlace={() => onSelectPlace(activity)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
        <div className="flex flex-col gap-1 border-t pt-3">
          <p className="text-muted-foreground text-xs">
            Si hay que pagar o reservar sale de OpenStreetMap; las webs oficiales, de Wikidata y
            OpenStreetMap.
          </p>
          <TicketsProviderNote bookings={bookings} />
        </div>
      </section>

      <section aria-labelledby="budget-parts-title" className="flex flex-col gap-3">
        <Heading id="budget-parts-title" className="text-base font-semibold">
          Presupuesto por partidas
        </Heading>
        <BudgetParts budget={bookings.budget} />
      </section>
    </div>
  );
}

function BookingRow({
  activity,
  date,
  currency,
  bookings,
  onSelectPlace,
}: {
  activity: Activity;
  date: string;
  currency: string;
  bookings: BookingsState;
  onSelectPlace: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const isMeal = activity.kind === "meal";
  const name = isMeal ? `${activity.title}: ${activity.place!.name}` : activity.title;
  const links = [...activity.bookingLinks, ...bookings.providerLinks(activity.place!.id)];
  return (
    <li className="flex flex-col gap-1.5 p-3" data-testid="booking-row">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onSelectPlace}
            className="focus-visible:ring-ring/50 rounded text-left text-sm leading-snug font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-3"
          >
            {name}
          </button>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatDay(date)}
            {activity.startTime ? `, ${activity.startTime}` : ""}
          </p>
        </div>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-primary -mr-2 min-h-11 shrink-0"
            onClick={() => setEditing(true)}
          >
            <PencilLine aria-hidden />
            {activity.bookingStatus ? "Cambiar" : "Anotar"}
            <span className="sr-only"> tu reserva de {name}</span>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <RequirementTag requirement={activity.bookingRequirement} isMeal={isMeal} />
        {activity.bookingStatus ? <StatusTag status={activity.bookingStatus} /> : null}
      </div>
      <BookingNoteLine paid={activity.paidPrice} note={activity.bookingNote} />
      {!editing ? <BookingLinks links={links} isMeal={isMeal} compact /> : null}
      {editing ? (
        <BookingEditor
          title={name}
          currency={currency}
          initial={{
            status: activity.bookingStatus,
            note: activity.bookingNote,
            paid: activity.paidPrice,
          }}
          saving={bookings.saving}
          error={bookings.error}
          onCancel={() => setEditing(false)}
          onSave={(update) =>
            bookings.save({ target: "activity", activityId: activity.id }, update, () =>
              setEditing(false),
            )
          }
        />
      ) : null}
    </li>
  );
}

function HotelBooking({
  trip,
  bookings,
  SubHeading,
}: {
  trip: Trip;
  bookings: BookingsState;
  SubHeading: "h3" | "h4";
}) {
  const [editing, setEditing] = useState(false);
  const hotel = bookings.hotel!;
  const status: BookingStatus = hotel.bookingStatus;
  return (
    <section aria-labelledby="bookings-hotel" className="flex flex-col">
      <SubHeading id="bookings-hotel" className="text-muted-foreground mb-1 text-sm font-medium">
        Alojamiento
      </SubHeading>
      <div className="flex flex-col gap-1.5 rounded-lg border p-3" data-testid="hotel-booking">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <BedDouble aria-hidden className="text-layer-lodging mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm leading-snug font-medium">{hotel.name}</p>
              <p className="text-muted-foreground text-xs">
                {formatDay(hotel.checkIn)} – {formatDay(hotel.checkOut)}
              </p>
            </div>
          </div>
          {!editing ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary -mr-2 min-h-11 shrink-0"
              onClick={() => setEditing(true)}
            >
              <PencilLine aria-hidden />
              Cambiar
              <span className="sr-only"> la reserva del hotel</span>
            </Button>
          ) : null}
        </div>
        <p className="text-xs font-medium">
          <span className="sr-only">Tu reserva: </span>
          {HOTEL_STATUS_LABELS[status]}
        </p>
        <BookingNoteLine paid={hotel.paidPrice} note={hotel.bookingNote} />
        {editing ? (
          <BookingEditor
            title={hotel.name}
            isHotel
            currency={trip.budget.currency}
            initial={{ status, note: hotel.bookingNote, paid: hotel.paidPrice }}
            saving={bookings.saving}
            error={bookings.error}
            onCancel={() => setEditing(false)}
            onSave={(update) => bookings.save({ target: "hotel" }, update, () => setEditing(false))}
          />
        ) : null}
      </div>
    </section>
  );
}

// ---------- Presupuesto ----------

function deviationText(deviation: Deviation, planned: number | undefined, currency: string) {
  const money = (value: number) => formatPrice(Math.abs(value), currency);
  switch (deviation.level) {
    case "no_plan":
      return "Sin presupuesto fijado.";
    case "ok":
      return `Quedan ${money(deviation.remaining!)} de ${money(planned!)}.`;
    case "near":
      return `Quedan ${money(deviation.remaining!)} de ${money(planned!)}: cerca del límite.`;
    case "at_risk":
      return `Con los precios orientativos te pasarías ${money(deviation.remaining!)}.`;
    case "over":
      return `Te has pasado ${money(deviation.remaining!)}.`;
  }
}

const DEVIATION_TONE: Record<Deviation["level"], string> = {
  no_plan: "text-muted-foreground",
  ok: "text-primary",
  near: "text-amber-800 dark:text-amber-300",
  at_risk: "text-amber-800 dark:text-amber-300",
  over: "text-destructive",
};

/**
 * Barra de una partida: lo confirmado (relleno), lo orientativo (rayado) y la marca del
 * presupuesto. Si te pasas, la escala se amplía y la marca queda dentro.
 */
function Meter({
  planned,
  confirmed,
  estimated,
  label,
}: {
  planned?: number;
  confirmed: number;
  estimated: number;
  label: string;
}) {
  const scale = Math.max(planned ?? 0, confirmed + estimated);
  if (scale <= 0) {
    return <div aria-hidden className="bg-muted h-2.5 rounded-full" />;
  }
  const pct = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
  const over = planned !== undefined && confirmed + estimated > planned;
  return (
    <div
      role="img"
      aria-label={label}
      className="bg-muted relative h-2.5 overflow-hidden rounded-full"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0",
          over && confirmed > planned! ? "bg-destructive" : "bg-primary",
        )}
        style={{ width: pct(confirmed) }}
      />
      <div
        className="absolute inset-y-0 [background:repeating-linear-gradient(135deg,var(--primary)_0_3px,transparent_3px_6px)]"
        style={{ left: pct(confirmed), width: pct(estimated) }}
      />
      {planned !== undefined && over ? (
        <div className="bg-foreground absolute inset-y-0 w-0.5" style={{ left: pct(planned) }} />
      ) : null}
    </div>
  );
}

function amounts(
  part: Pick<BudgetPart, "confirmed" | "estimated" | "unknownCount">,
  currency: string,
) {
  return (
    <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      <dt className="flex items-center gap-1.5">
        <span aria-hidden className="bg-primary inline-block size-2.5 rounded-sm" />
        Confirmado
      </dt>
      <dd className="text-foreground text-right tabular-nums">
        {formatPrice(part.confirmed, currency)}
      </dd>
      <dt className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-sm [background:repeating-linear-gradient(135deg,var(--primary)_0_2px,transparent_2px_4px)]"
        />
        Orientativo
      </dt>
      <dd className="text-foreground text-right tabular-nums">
        {formatPrice(part.estimated, currency)}
      </dd>
      <dt className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="border-muted-foreground inline-block size-2.5 rounded-sm border border-dashed"
        />
        Sin precio
      </dt>
      <dd className="text-foreground text-right tabular-nums">
        {part.unknownCount === 1 ? "1 elemento" : `${part.unknownCount} elementos`}
      </dd>
    </dl>
  );
}

const meterLabel = (
  currency: string,
  planned: number | undefined,
  confirmed: number,
  estimated: number,
) =>
  `${formatPrice(confirmed, currency)} confirmado y ${formatPrice(estimated, currency)} orientativo${
    planned !== undefined ? ` de ${formatPrice(planned, currency)}` : ""
  }`;

function BudgetTotal({ budget }: { budget: BudgetSummary }) {
  const { currency } = budget;
  const committed = budget.confirmed + budget.estimated;
  // Con elementos sin precio, "te queda" no es una buena noticia segura: tono neutro.
  const uncertain = budget.deviation.level === "ok" && budget.unknownCount > 0;
  const DeviationIcon =
    budget.deviation.level === "no_plan"
      ? null
      : uncertain
        ? Info
        : budget.deviation.level === "ok"
          ? CircleCheck
          : AlertTriangle;
  return (
    <div className="flex flex-col gap-4" data-testid="budget-overview">
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">Total del viaje</p>
          <p className="text-right tabular-nums">
            <span className="text-2xl font-semibold">{formatPrice(committed, currency)}</span>
            {budget.planned !== undefined ? (
              <span className="text-muted-foreground text-sm">
                {" "}
                de {formatPrice(budget.planned, currency)}
              </span>
            ) : null}
          </p>
        </div>
        <Meter
          planned={budget.planned}
          confirmed={budget.confirmed}
          estimated={budget.estimated}
          label={meterLabel(currency, budget.planned, budget.confirmed, budget.estimated)}
        />
        <p
          className={cn(
            "flex items-start gap-1 text-sm font-medium",
            uncertain ? "text-foreground" : DEVIATION_TONE[budget.deviation.level],
          )}
          data-testid="budget-deviation"
          data-level={budget.deviation.level}
        >
          {DeviationIcon ? <DeviationIcon aria-hidden className="mt-0.5 size-4 shrink-0" /> : null}
          {budget.plannedBasis === "none"
            ? "No fijaste un presupuesto en el asistente."
            : deviationText(budget.deviation, budget.planned, currency)}
          {uncertain ? " Sin contar lo que no tiene precio." : ""}
        </p>
        {budget.plannedBasis === "categories" ? (
          <p className="text-muted-foreground text-xs">Presupuesto: suma de tus partidas.</p>
        ) : null}
        {amounts(budget, currency)}
        {budget.unknownCount > 0 ? (
          <p className="text-muted-foreground text-xs">
            Lo que no tiene precio no suma: el gasto real será mayor que este total. Anota lo que
            pagues para que cuente como confirmado.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BudgetParts({ budget }: { budget: BudgetSummary }) {
  const { currency } = budget;
  return (
    <ul className="flex flex-col gap-4">
      {budget.parts.map((part) => {
        const label = BUDGET_CATEGORY_LABELS[part.category];
        return (
          <li
            key={part.category}
            className="flex flex-col gap-1.5"
            data-testid={`budget-${part.category}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-sm tabular-nums">
                {formatPrice(part.confirmed + part.estimated, currency)}
                {part.planned !== undefined ? (
                  <span className="text-muted-foreground">
                    {" "}
                    de {formatPrice(part.planned, currency)}
                  </span>
                ) : null}
              </p>
            </div>
            <Meter
              planned={part.planned}
              confirmed={part.confirmed}
              estimated={part.estimated}
              label={`${label}: ${meterLabel(currency, part.planned, part.confirmed, part.estimated)}`}
            />
            <p
              className={cn("text-xs font-medium", DEVIATION_TONE[part.deviation.level])}
              data-level={part.deviation.level}
            >
              {deviationText(part.deviation, part.planned, currency)}
              {part.unknownCount > 0
                ? ` ${part.unknownCount === 1 ? "1 elemento" : `${part.unknownCount} elementos`} sin precio.`
                : ""}
            </p>
            <BudgetLines part={part} currency={currency} />
          </li>
        );
      })}
    </ul>
  );
}

function BudgetLines({ part, currency }: { part: BudgetPart; currency: string }) {
  if (part.lines.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {part.category === "transport"
          ? "Sin trayectos en taxi ni transporte público en el plan. TripMind no conoce tarifas de transporte."
          : "Nada en el plan todavía."}
      </p>
    );
  }
  return (
    <details className="group text-xs">
      <summary className="text-primary focus-visible:ring-ring/50 min-h-11 cursor-pointer content-center rounded outline-none focus-visible:ring-3 sm:min-h-8">
        Ver detalle ({part.lines.length})
      </summary>
      <ul className="mt-1 flex flex-col gap-1.5">
        {part.lines.map((line) => (
          <li
            key={line.id}
            className={cn("flex flex-col", line.cancelled && "text-muted-foreground")}
          >
            <div className="flex justify-between gap-3">
              <span className={cn("min-w-0", line.cancelled && "line-through")}>
                {line.label}
                {line.date ? (
                  <span className="text-muted-foreground">, {formatDay(line.date)}</span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">
                {line.cancelled
                  ? "Cancelada"
                  : line.amount !== undefined
                    ? `${formatPrice(line.amount, currency)} ${line.certainty === "confirmed" ? "confirmado" : "orientativo"}`
                    : "Sin precio"}
              </span>
            </div>
            {line.basis ? (
              <span className="text-muted-foreground">
                {line.basis}
                {line.source
                  ? ` (consultado el ${formatDay(line.source.retrievedAt.slice(0, 10))})`
                  : ""}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
