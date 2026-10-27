import type { Place } from "@/domain/place";

export interface AvailabilityLink {
  id: "booking" | "google_hotels";
  label: string;
  url: string;
  /** Qué datos del viaje lleva el enlace (la UI lo explica). */
  carries: "dates_and_travelers" | "name_only";
}

export interface AvailabilityQuery {
  place: Pick<Place, "name" | "address">;
  /** Ciudad del destino si el alojamiento no la trae en su dirección. */
  city?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
}

/**
 * Enlaces de **búsqueda** de disponibilidad (REQUISITOS §7): no son reservas, ni afiliados, ni
 * garantizan disponibilidad. Booking acepta fechas, viajeros y habitaciones en la URL pública de
 * resultados; Google Hotels no documenta parámetros de fecha, así que solo lleva el nombre.
 */
export function availabilityLinks(query: AvailabilityQuery): AvailabilityLink[] {
  const city = query.place.address?.city ?? query.city;
  const text = city ? `${query.place.name}, ${city}` : query.place.name;
  const booking = new URLSearchParams({
    ss: text,
    checkin: query.checkIn,
    checkout: query.checkOut,
    group_adults: String(query.adults),
    group_children: String(query.children),
    no_rooms: String(query.rooms),
    lang: "es",
  });
  const google = new URLSearchParams({ q: text, hl: "es" });
  return [
    {
      id: "booking",
      label: "Booking.com",
      url: `https://www.booking.com/searchresults.html?${booking}`,
      carries: "dates_and_travelers",
    },
    {
      id: "google_hotels",
      label: "Google Hotels",
      url: `https://www.google.com/travel/search?${google}`,
      carries: "name_only",
    },
  ];
}
