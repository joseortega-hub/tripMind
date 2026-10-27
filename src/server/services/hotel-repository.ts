import "server-only";
import type { Place } from "@/domain/place";
import { Prisma } from "@/generated/prisma/client";
import type { Hotel } from "@/domain/trip";
import { prisma } from "@/server/db";
import { PlacesUnavailableError } from "./itinerary";
import { generateTripItinerary, getTripItinerary } from "./itinerary/service";
import { getTrip, json, toDbDate } from "./trips";
import { hasItinerary, hotelFromPlace } from "./hotel";

/**
 * Elige o cambia el hotel del viaje (§14A): lo guarda y, si ya hay itinerario, lo vuelve a
 * calcular desde el hotel nuevo conservando las actividades bloqueadas.
 */
export async function changeTripHotel(tripId: string, place: Place) {
  const trip = await getTrip(tripId);
  if (!trip) return null;
  const hotel: Hotel = hotelFromPlace(trip, place);
  const data = {
    placeId: place.id,
    place: json(place),
    name: hotel.name,
    lat: hotel.location.lat,
    lng: hotel.location.lng,
    address: hotel.address ? json(hotel.address) : undefined,
    checkIn: toDbDate(hotel.checkIn),
    checkOut: toDbDate(hotel.checkOut),
    // Un hotel nuevo no hereda precio ni reserva del anterior.
    price: undefined,
    bookingStatus: "pending" as const,
    bookingUrl: null,
    bookingNote: null,
  };
  await prisma.hotel.upsert({
    where: { tripId },
    create: { ...data, tripId },
    update: {
      ...data,
      address: hotel.address ? json(hotel.address) : Prisma.DbNull,
      price: Prisma.DbNull,
      paidPrice: Prisma.DbNull,
    },
  });
  // El hotel ya está guardado: si el recálculo falla (sin lugares), se avisa y se conserva el plan.
  let regenerated = false;
  let itineraryError: string | undefined;
  let itinerary = null;
  if (hasItinerary(trip)) {
    try {
      itinerary = await generateTripItinerary(tripId);
      regenerated = true;
    } catch (error) {
      if (!(error instanceof PlacesUnavailableError)) throw error;
      itineraryError =
        "El hotel se ha guardado, pero no se ha podido recalcular el itinerario: el proveedor de lugares no responde. Pulsa «Rehacer el plan» en el itinerario más tarde.";
    }
  }
  itinerary ??= await getTripItinerary(tripId);
  const updated = await getTrip(tripId);
  return { hotel: updated?.hotel, itinerary, regenerated, itineraryError };
}
