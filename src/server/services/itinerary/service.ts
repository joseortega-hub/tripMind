import "server-only";
import type { ItineraryEdit } from "@/domain/itinerary";
import { getTrip } from "../trips";
import { computeEdit, computeItinerary, type Itinerary } from "./index";
import { saveDays } from "./repository";

const itineraryOf = (trip: NonNullable<Awaited<ReturnType<typeof getTrip>>>): Itinerary => ({
  days: trip.days,
  meta: trip.itineraryMeta,
});

export async function getTripItinerary(tripId: string): Promise<Itinerary | null> {
  const trip = await getTrip(tripId);
  return trip ? itineraryOf(trip) : null;
}

/** Genera (o regenera conservando lo bloqueado) y guarda el itinerario. */
export async function generateTripItinerary(tripId: string): Promise<Itinerary | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;
  const itinerary = await computeItinerary(trip);
  await saveDays(tripId, itinerary.days, { replaceAll: true, meta: itinerary.meta });
  return getTripItinerary(tripId);
}

/** Aplica una edición manual, guarda los días afectados y devuelve el itinerario completo. */
export async function editTripItinerary(
  tripId: string,
  edit: ItineraryEdit,
): Promise<Itinerary | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;
  const days = await computeEdit(trip, edit);
  await saveDays(tripId, days);
  return getTripItinerary(tripId);
}
