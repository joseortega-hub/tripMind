"use client";

import { PencilLine } from "lucide-react";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import type { Activity } from "@/domain/trip";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/booking/budget";
import { requirementOf } from "@/lib/booking/info";
import {
  BookingEditor,
  BookingLinks,
  BookingNoteLine,
  RequirementTag,
  StatusTag,
} from "./booking-ui";
import type { BookingsState } from "./use-bookings";

/** Reservas del viaje para las tarjetas del itinerario (evita pasarlas por cada nivel). */
export const BookingsContext = createContext<
  { bookings: BookingsState; currency: string; travelers: number } | undefined
>(undefined);

/**
 * Línea de entradas de una actividad del itinerario: estado según la fuente, lo anotado por el
 * usuario, el primer enlace por prioridad y el botón para anotar la reserva.
 */
export function ActivityBooking({
  activity,
  editing,
  onEditingChange: setEditing,
}: {
  activity: Activity;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const context = useContext(BookingsContext);
  if (!activity.place) return null;
  const isMeal = activity.kind === "meal";
  const charge = isMeal ? undefined : requirementOf(activity.place).charge;
  const links = [
    ...activity.bookingLinks,
    ...(context?.bookings.providerLinks(activity.place.id) ?? []),
  ];
  const name = isMeal ? `${activity.title}: ${activity.place.name}` : activity.title;

  return (
    <div className="mt-1 flex flex-col gap-1" data-testid="activity-booking">
      <div className="flex flex-wrap items-center gap-1">
        <RequirementTag requirement={activity.bookingRequirement} isMeal={isMeal} />
        {activity.bookingStatus ? <StatusTag status={activity.bookingStatus} /> : null}
        {!activity.paidPrice ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {charge
              ? `${formatPrice(charge.amount, charge.currency)} por persona (orientativo)`
              : "Sin precio"}
          </span>
        ) : null}
      </div>
      <BookingNoteLine paid={activity.paidPrice} note={activity.bookingNote} />
      {!editing ? (
        <BookingLinks links={links} isMeal={isMeal} compact />
      ) : context ? (
        <BookingEditor
          title={name}
          currency={context.currency}
          initial={{
            status: activity.bookingStatus,
            note: activity.bookingNote,
            paid: activity.paidPrice,
          }}
          saving={context.bookings.saving}
          error={context.bookings.error}
          onCancel={() => setEditing(false)}
          onSave={(update) =>
            context.bookings.save({ target: "activity", activityId: activity.id }, update, () =>
              setEditing(false),
            )
          }
        />
      ) : null}
    </div>
  );
}

/** Botón "Anotar reserva" para la fila de acciones de la tarjeta (sin contexto no hay nada que guardar). */
export function ActivityBookingButton({
  activity,
  onOpen,
  className,
}: {
  activity: Activity;
  onOpen: () => void;
  className?: string;
}) {
  const context = useContext(BookingsContext);
  if (!context || !activity.place) return null;
  const name =
    activity.kind === "meal" ? `${activity.title}: ${activity.place.name}` : activity.title;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("text-primary min-h-11", className)}
      onClick={onOpen}
    >
      <PencilLine aria-hidden />
      {activity.bookingStatus ? "Cambiar reserva" : "Anotar reserva"}
      <span className="sr-only"> de {name}</span>
    </Button>
  );
}
