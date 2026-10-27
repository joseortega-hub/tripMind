import "server-only";
import type {
  Activity as ActivityRow,
  Hotel as HotelRow,
  ItineraryDay as DayRow,
  Leg as LegRow,
  Prisma,
  Trip as TripRow,
} from "@/generated/prisma/client";
import { type Trip, type TripInput, TripSchema } from "@/domain/trip";
import { prisma } from "@/server/db";

export const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
export const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);
export const json = (value: unknown) => value as Prisma.InputJsonValue;

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

export type DayRowWithItems = DayRow & { activities: ActivityRow[]; legs: LegRow[] };

/** Día guardado → objeto plano que valida `ItineraryDaySchema` (dentro de `TripSchema`). */
export function fromDayRow(day: DayRowWithItems) {
  return {
    id: day.id,
    date: fromDbDate(day.date),
    isRestDay: day.isRestDay,
    activities: [...day.activities]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        place: undef(a.place),
        startTime: undef(a.startTime),
        durationMinutes: a.durationMinutes,
        locked: a.locked,
        bookingRequirement: a.bookingRequirement,
        bookingStatus: undef(a.bookingStatus),
        bookingLinks: a.bookingLinks,
        price: undef(a.price),
        notes: undef(a.notes),
        planning: undef(a.planning),
      })),
    legs: [...day.legs]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        fromActivityId: undef(l.fromActivityId),
        toActivityId: undef(l.toActivityId),
        from: { lat: l.fromLat, lng: l.fromLng },
        to: { lat: l.toLat, lng: l.toLng },
        mode: l.mode,
        quality: l.quality,
        durationMinutes: undef(l.durationMinutes),
        distanceMeters: undef(l.distanceMeters),
        geometry: undef(l.geometry),
        externalUrl: undef(l.externalUrl),
        source: undef(l.source),
        isDemo: undef(l.isDemo),
        reservedMinutes: undef(l.reservedMinutes),
      })),
  };
}

/** Reconstruye el viaje de dominio y valida con Zod el JSON guardado. */
export function fromTripRow(
  row: TripRow & { hotel: HotelRow | null; days?: DayRowWithItems[] },
): Trip {
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
    days: [...(row.days ?? [])].sort((a, b) => a.date.getTime() - b.date.getTime()).map(fromDayRow),
    itineraryMeta: undef(row.itineraryMeta),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function createTrip(input: TripInput): Promise<{ id: string }> {
  return prisma.trip.create({ data: toTripCreateData(input), select: { id: true } });
}

export async function getTrip(id: string): Promise<Trip | null> {
  const row = await prisma.trip.findUnique({
    where: { id },
    include: { hotel: true, days: { include: { activities: true, legs: true } } },
  });
  return row ? fromTripRow(row) : null;
}
