import "server-only";
import type { Hotel as HotelRow, Prisma, Trip as TripRow } from "@/generated/prisma/client";
import { type Trip, type TripInput, TripSchema } from "@/domain/trip";
import { prisma } from "@/server/db";

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);
const json = (value: unknown) => value as Prisma.InputJsonValue;

/** Traduce los datos del asistente a la fila de Prisma (los objetos anidados van como JSON). */
export function toTripCreateData(input: TripInput): Prisma.TripCreateInput {
  const { hotel } = input;
  return {
    title: input.title ?? null,
    destination: json(input.destination),
    destinationName: input.destination.name,
    startDate: toDbDate(input.startDate),
    endDate: toDbDate(input.endDate),
    adults: input.travelers.adults,
    children: input.travelers.children,
    preferences: json(input.preferences),
    pace: json(input.pace),
    budget: json(input.budget),
    accommodationPreferences: input.accommodationPreferences
      ? json(input.accommodationPreferences)
      : undefined,
    hotel: hotel
      ? {
          create: {
            placeId: hotel.place?.id ?? null,
            place: hotel.place ? json(hotel.place) : undefined,
            name: hotel.name,
            lat: hotel.location.lat,
            lng: hotel.location.lng,
            address: hotel.address ? json(hotel.address) : undefined,
            checkIn: toDbDate(hotel.checkIn),
            checkOut: toDbDate(hotel.checkOut),
            price: hotel.price ? json(hotel.price) : undefined,
            bookingStatus: hotel.bookingStatus,
            bookingUrl: hotel.bookingUrl ?? null,
          },
        }
      : undefined,
  };
}

const undef = <T>(value: T | null) => value ?? undefined;

/** Reconstruye el viaje de dominio y valida con Zod el JSON guardado. */
export function fromTripRow(row: TripRow & { hotel: HotelRow | null }): Trip {
  const { hotel } = row;
  return TripSchema.parse({
    id: row.id,
    title: undef(row.title),
    destination: row.destination,
    startDate: fromDbDate(row.startDate),
    endDate: fromDbDate(row.endDate),
    travelers: { adults: row.adults, children: row.children },
    hotel: hotel
      ? {
          id: hotel.id,
          place: undef(hotel.place),
          name: hotel.name,
          location: { lat: hotel.lat, lng: hotel.lng },
          address: undef(hotel.address),
          checkIn: fromDbDate(hotel.checkIn),
          checkOut: fromDbDate(hotel.checkOut),
          price: undef(hotel.price),
          bookingStatus: hotel.bookingStatus,
          bookingUrl: undef(hotel.bookingUrl),
        }
      : undefined,
    accommodationPreferences: undef(row.accommodationPreferences),
    preferences: row.preferences,
    pace: row.pace,
    budget: row.budget,
    // El itinerario por días llega en la Fase 5.
    days: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function createTrip(input: TripInput): Promise<{ id: string }> {
  return prisma.trip.create({ data: toTripCreateData(input), select: { id: true } });
}

export async function getTrip(id: string): Promise<Trip | null> {
  const row = await prisma.trip.findUnique({ where: { id }, include: { hotel: true } });
  return row ? fromTripRow(row) : null;
}
