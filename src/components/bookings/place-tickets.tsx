"use client";

import { ExternalLink, PencilLine } from "lucide-react";
import { useState } from "react";
import { DemoBadge } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Place } from "@/domain/place";
import { bookingLinksOf, requirementOf } from "@/lib/booking/info";
import { formatDay } from "@/lib/trip-labels";
import {
  BookingEditor,
  BookingLinks,
  BookingNoteLine,
  BookingSources,
  RequirementTag,
  StatusTag,
} from "./booking-ui";
import type { BookingsState } from "./use-bookings";

/** Estado del proveedor de entradas: no configurado, cargando o con error (con alternativa). */
export function TicketsProviderNote({ bookings }: { bookings: BookingsState }) {
  const { tickets } = bookings;
  if (tickets.isLoading) {
    return (
      <p role="status" className="flex items-center">
        <Skeleton className="h-4 w-48" aria-hidden />
        <span className="sr-only">Consultando el proveedor de entradas…</span>
      </p>
    );
  }
  if (tickets.isError) {
    return (
      <p className="text-muted-foreground text-xs">
        No se ha podido consultar el proveedor de entradas. Los enlaces de abajo son los de la
        fuente.
      </p>
    );
  }
  const status = tickets.data?.status;
  if (!status) return null;
  if (status.status === "not_configured") {
    return <p className="text-muted-foreground text-xs">{status.message}</p>;
  }
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      Entradas de {status.providerName}
      {status.isProposal ? " (integración propuesta, sin acuerdo)" : ""}
      {status.isDemo ? <DemoBadge /> : null}
    </p>
  );
}

/**
 * Sección "Entradas y reservas" de la ficha: estado según la fuente, enlaces por prioridad y, si
 * el lugar está en el itinerario, lo que ha anotado el usuario.
 */
export function PlaceTickets({
  place,
  bookings,
  currency,
  headingLevel = 3,
}: {
  place: Place;
  bookings: BookingsState;
  currency: string;
  headingLevel?: 3 | 4;
}) {
  const [editing, setEditing] = useState(false);
  const Heading = `h${headingLevel}` as const;
  const isMeal = place.layer === "food";
  const info = requirementOf(place);
  const links = bookingLinksOf(place, bookings.providerLinks(place.id));
  const planned = bookings.findActivity(place.id);
  const activity = planned?.activity;

  return (
    <section aria-labelledby="place-tickets-title" className="flex flex-col gap-2 border-t pt-4">
      <Heading id="place-tickets-title" className="text-sm font-semibold">
        {isMeal ? "Reserva" : "Entradas y reservas"}
      </Heading>
      <div className="flex flex-wrap items-center gap-1.5">
        <RequirementTag requirement={info.requirement} isMeal={isMeal} />
        {activity?.bookingStatus ? <StatusTag status={activity.bookingStatus} /> : null}
      </div>
      {activity && planned ? (
        editing ? (
          <BookingEditor
            title={place.name}
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
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-xs">
              En tu itinerario el {formatDay(planned.date)}
              {activity.startTime ? ` a las ${activity.startTime}` : ""}.
            </p>
            <BookingNoteLine paid={activity.paidPrice} note={activity.bookingNote} />
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 self-start"
              onClick={() => setEditing(true)}
            >
              <PencilLine aria-hidden />
              {activity.bookingStatus ? "Cambiar tu reserva" : "Anotar tu reserva"}
            </Button>
          </div>
        )
      ) : (
        <p className="text-muted-foreground text-xs">
          Añádelo al itinerario para anotar si ya lo tienes reservado.
        </p>
      )}
      {info.evidence.length > 0 ? (
        <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          {info.evidence.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">
          OpenStreetMap no indica si hay que pagar o reservar. Compruébalo en la web del lugar antes
          de ir.
        </p>
      )}
      {links.length > 0 ? (
        <BookingLinks links={links} isMeal={isMeal} />
      ) : place.source.url ? (
        <a
          href={place.source.url}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex min-h-11 items-center gap-1.5 self-start text-sm underline underline-offset-2"
        >
          Ver la ficha en OpenStreetMap
          <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      ) : null}
      {!isMeal ? <TicketsProviderNote bookings={bookings} /> : null}
      <p className="text-muted-foreground text-xs">
        Abrir un enlace no reserva nada. Cuando reserves, anótalo aquí.
      </p>
      {links.length > 0 ? <BookingSources links={links} /> : null}
    </section>
  );
}
