import "server-only";
import type { ItineraryMeta } from "@/domain/itinerary";
import type { ItineraryDay } from "@/domain/trip";
import { prisma } from "@/server/db";
import { json, toDbDate } from "../trips";

/**
 * Sustituye los días indicados (actividades y tramos) en una transacción. Las actividades
 * conservan su id para que la UI mantenga la selección tras recalcular.
 */
export async function saveDays(
  tripId: string,
  days: readonly ItineraryDay[],
  options: { replaceAll?: boolean; meta?: ItineraryMeta } = {},
) {
  await prisma.$transaction(async (tx) => {
    if (options.replaceAll) {
      await tx.itineraryDay.deleteMany({
        where: { tripId, date: { notIn: days.map((day) => toDbDate(day.date)) } },
      });
    }
    for (const day of days) {
      const row = await tx.itineraryDay.upsert({
        where: { tripId_date: { tripId, date: toDbDate(day.date) } },
        create: { tripId, date: toDbDate(day.date), isRestDay: day.isRestDay },
        update: { isRestDay: day.isRestDay },
        select: { id: true },
      });
      await tx.leg.deleteMany({ where: { dayId: row.id } });
      await tx.activity.deleteMany({ where: { dayId: row.id } });
      if (day.activities.length > 0) {
        await tx.activity.createMany({
          data: day.activities.map((activity, position) => ({
            id: activity.id,
            dayId: row.id,
            position,
            kind: activity.kind,
            title: activity.title,
            placeId: activity.place?.id ?? null,
            place: activity.place ? json(activity.place) : undefined,
            startTime: activity.startTime ?? null,
            durationMinutes: activity.durationMinutes,
            locked: activity.locked,
            bookingRequirement: activity.bookingRequirement,
            bookingStatus: activity.bookingStatus ?? null,
            bookingLinks: json(activity.bookingLinks),
            price: activity.price ? json(activity.price) : undefined,
            bookingNote: activity.bookingNote ?? null,
            paidPrice: activity.paidPrice ? json(activity.paidPrice) : undefined,
            notes: activity.notes ?? null,
            planning: activity.planning ? json(activity.planning) : undefined,
          })),
        });
      }
      if (day.legs.length > 0) {
        await tx.leg.createMany({
          data: day.legs.map((leg, position) => ({
            id: leg.id,
            dayId: row.id,
            position,
            fromActivityId: leg.fromActivityId ?? null,
            toActivityId: leg.toActivityId ?? null,
            fromLat: leg.from.lat,
            fromLng: leg.from.lng,
            toLat: leg.to.lat,
            toLng: leg.to.lng,
            mode: leg.mode,
            quality: leg.quality,
            durationMinutes: leg.durationMinutes ?? null,
            distanceMeters: leg.distanceMeters ?? null,
            geometry: leg.geometry ? json(leg.geometry) : undefined,
            externalUrl: leg.externalUrl ?? null,
            source: leg.source ? json(leg.source) : undefined,
            isDemo: leg.isDemo ?? null,
            reservedMinutes: leg.reservedMinutes ?? null,
          })),
        });
      }
    }
    if (options.meta) {
      await tx.trip.update({ where: { id: tripId }, data: { itineraryMeta: json(options.meta) } });
    }
  });
}
