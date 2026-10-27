import "server-only";
import { z } from "zod";
import { BookingUpdateSchema } from "@/domain/booking";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { getTicketsProvider, type TicketOffer } from "@/server/providers/tickets";
import { getTripItinerary } from "./itinerary/service";
import { getTrip, json } from "./trips";

/** Reserva que anota el usuario: de una actividad del itinerario o del hotel. */
export const BookingChangeSchema = z.discriminatedUnion("target", [
  BookingUpdateSchema.extend({ target: z.literal("activity"), activityId: z.string().min(1) }),
  BookingUpdateSchema.extend({ target: z.literal("hotel") }),
]);
export type BookingChange = z.infer<typeof BookingChangeSchema>;

export class BookingTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingTargetError";
  }
}

/**
 * Estado del proveedor de entradas y sus productos para los lugares del itinerario. Sin proveedor
 * configurado no hay productos: la UI lo dice y usa los enlaces de la fuente.
 */
export async function getTripTicketOffers(tripId: string) {
  const trip = await getTrip(tripId);
  if (!trip) return null;
  const provider = getTicketsProvider();
  const places = trip.days.flatMap((day) =>
    day.activities.flatMap((activity) =>
      activity.place && activity.kind !== "meal" ? [activity.place] : [],
    ),
  );
  const offers: Record<string, TicketOffer[]> = {};
  if (provider.configured && places.length > 0) {
    const found = await provider.offers({
      places,
      adults: trip.travelers.adults,
      children: trip.travelers.children,
      currency: trip.budget.currency,
    });
    for (const [placeId, list] of found) offers[placeId] = list;
  }
  return {
    provider: { id: provider.id, name: provider.name, isDemo: provider.isDemo },
    status: provider.status,
    offers,
  };
}

/**
 * Guarda lo que el usuario anota (estado, nota, precio pagado). Sustituye lo anterior: sin nota o
 * sin precio se borran. Abrir un enlace nunca llama aquí.
 */
export async function updateTripBooking(tripId: string, change: BookingChange) {
  const data = {
    bookingStatus: change.status,
    bookingNote: change.note?.trim() ? change.note.trim() : null,
    paidPrice: change.paid ? json(change.paid) : Prisma.DbNull,
  };
  if (change.target === "hotel") {
    const trip = await getTrip(tripId);
    if (!trip) return null;
    if (!trip.hotel) throw new BookingTargetError("El viaje aún no tiene hotel.");
    await prisma.hotel.update({ where: { tripId }, data });
    const updated = await getTrip(tripId);
    return { hotel: updated?.hotel };
  }
  const activity = await prisma.activity.findFirst({
    where: { id: change.activityId, day: { tripId } },
    select: { id: true, place: true },
  });
  if (!activity) {
    const trip = await getTrip(tripId);
    if (!trip) return null;
    throw new BookingTargetError(
      "La actividad ya no está en el itinerario (puede que se haya recalculado). Vuelve a abrirla.",
    );
  }
  if (activity.place === null) {
    throw new BookingTargetError("Solo se pueden anotar reservas de actividades con lugar.");
  }
  await prisma.activity.update({ where: { id: activity.id }, data });
  return { itinerary: await getTripItinerary(tripId) };
}
