import type { Place } from "@/domain/place";
import type { Hotel, Trip } from "@/domain/trip";

/**
 * Hotel del viaje a partir de un alojamiento real (snapshot con fuente). Las noches son las del
 * viaje; el estado de reserva empieza en "pendiente" y no hay precio: elegir no es reservar.
 */
export function hotelFromPlace(trip: Pick<Trip, "startDate" | "endDate">, place: Place): Hotel {
  return {
    id: place.id,
    place,
    name: place.name,
    location: place.location,
    address: place.address,
    checkIn: trip.startDate,
    checkOut: trip.endDate,
    bookingStatus: "pending",
  };
}

/** Hay que recalcular el itinerario si ya tiene alguna actividad. */
export const hasItinerary = (trip: Pick<Trip, "days">) =>
  trip.days.some((day) => day.activities.length > 0);
