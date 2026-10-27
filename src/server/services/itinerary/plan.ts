import { randomUUID } from "node:crypto";
import type { LatLng } from "@/domain/geo";
import type { ActivityPlanning, DaySlot } from "@/domain/itinerary";
import type { Place } from "@/domain/place";
import { type Pace, toMinutes } from "@/domain/preferences";
import type { Activity, ItineraryDay, Leg } from "@/domain/trip";
import { bookingLinksOf, requirementOf } from "@/lib/booking/info";
import { googleMapsDirectionsUrl } from "@/server/providers/routing/links";
import {
  ANCHOR_ID,
  type BlockItem,
  type DaySchedule,
  type PlanItem,
  type ScheduledItem,
  type VisitItem,
} from "./optimizer";
import { type BlockTemplate, dayBlocks, estimatedDuration } from "./profile";

export const minutesToTime = (minutes: number) => {
  const clamped = Math.min(Math.max(0, Math.round(minutes)), 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};

/** Fechas del viaje, ambas incluidas. */
export function tripDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const day = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (day <= end) {
    dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

export function visitFromPlace(
  place: Place,
  pace: Pace,
  score: number,
  id = randomUUID(),
): VisitItem {
  return {
    type: "visit",
    id,
    place,
    duration: estimatedDuration(place, pace),
    durationEstimated: true,
    score,
  };
}

export const blockFromTemplate = (template: BlockTemplate, id = randomUUID()): BlockItem => ({
  type: "block",
  id,
  kind: template.kind,
  slot: template.slot,
  title: template.title,
  duration: template.duration,
  earliest: template.earliest,
  latest: template.latest,
});

/** Bloques de comida y tiempo libre del día, salvo las franjas que ya ocupa un bloque bloqueado. */
export function defaultBlocks(pace: Pace, taken: ReadonlySet<string> = new Set()): BlockItem[] {
  return dayBlocks(pace)
    .filter((template) => !taken.has(template.slot))
    .map((template) => blockFromTemplate(template));
}

/** Convierte una actividad guardada en elemento del optimizador conservando su id. */
export function itemFromActivity(activity: Activity, pace: Pace): PlanItem {
  const lockedStart =
    activity.locked && activity.startTime ? toMinutes(activity.startTime) : undefined;
  const slot = activity.planning?.slot;
  const mealSlot = slot === "breakfast" || slot === "lunch" || slot === "dinner";
  if (activity.place && !(activity.kind === "meal" && mealSlot)) {
    return {
      type: "visit",
      id: activity.id,
      place: activity.place,
      duration: activity.durationMinutes,
      durationEstimated: activity.planning?.durationEstimated ?? true,
      score: 0,
      lockedStart,
    };
  }
  const template = dayBlocks(pace).find((block) => block.slot === slot);
  return {
    type: "block",
    id: activity.id,
    kind: activity.kind === "meal" ? "meal" : "free_time",
    slot: mealSlot ? slot : "afternoon",
    title: activity.title,
    duration: activity.durationMinutes,
    earliest: template?.earliest ?? toMinutes(pace.dayStart),
    latest: template?.latest ?? toMinutes(pace.dayEnd),
    lockedStart,
    // Restaurante elegido para la comida (Fase 7).
    place: activity.kind === "meal" ? activity.place : undefined,
  };
}

function slotFor(scheduled: ScheduledItem): DaySlot {
  if (scheduled.item.type === "block") return scheduled.item.slot;
  if (scheduled.start < 13 * 60) return "morning";
  if (scheduled.start < 20 * 60 + 30) return "afternoon";
  return "night";
}

export interface DayConversion {
  dayId: string;
  date: string;
  isRestDay: boolean;
  schedule: DaySchedule | undefined;
  anchor?: LatLng;
  /** Actividades previas por id (para conservar estado de reserva, notas, precio…). */
  previous: ReadonlyMap<string, Activity>;
  alternatives?: ReadonlyMap<string, Place>;
}

/** Resultado del optimizador → día de dominio con actividades y tramos. */
export function toItineraryDay(input: DayConversion): ItineraryDay {
  const { schedule } = input;
  // Al regenerar, las visitas nuevas reciben otro id: la reserva del usuario sigue al lugar.
  const previousByPlace = new Map<string, Activity>();
  for (const activity of input.previous.values()) {
    if (activity.place && activity.kind !== "meal")
      previousByPlace.set(activity.place.id, activity);
  }
  const activities: Activity[] = (schedule?.items ?? []).map((scheduled) => {
    const { item } = scheduled;
    const before =
      input.previous.get(item.id) ??
      (item.type === "visit" ? previousByPlace.get(item.place.id) : undefined);
    const planning: ActivityPlanning = {
      slot: slotFor(scheduled),
      durationEstimated: item.type === "visit" ? item.durationEstimated : true,
      openingStatus: scheduled.status,
      warnings: scheduled.warnings,
      alternative:
        input.alternatives?.get(item.id) ??
        (scheduled.status === "open" ? undefined : before?.planning?.alternative),
    };
    return {
      id: item.id,
      kind: item.type === "visit" ? (before?.kind ?? "visit") : item.kind,
      title: item.type === "visit" ? item.place.name : item.title,
      place: item.place,
      startTime: minutesToTime(scheduled.start),
      durationMinutes: item.duration,
      locked: item.lockedStart !== undefined,
      // Estado informativo y enlaces: siempre de la fuente del lugar (snapshot actual).
      bookingRequirement: requirementOf(item.place).requirement,
      bookingStatus: before?.bookingStatus,
      bookingLinks: item.place ? bookingLinksOf(item.place) : [],
      price: before?.price,
      bookingNote: before?.bookingNote,
      paidPrice: before?.paidPrice,
      notes: before?.notes,
      planning,
    };
  });

  const locationOf = (id: string): LatLng | undefined => {
    if (id === ANCHOR_ID) return input.anchor;
    return schedule?.items.find((s) => s.item.id === id)?.item.place?.location;
  };
  const legs: Leg[] = (schedule?.legs ?? []).flatMap(({ fromId, toId, estimate }) => {
    const from = locationOf(fromId);
    const to = locationOf(toId);
    if (!from || !to) return [];
    const leg: Leg = {
      id: randomUUID(),
      fromActivityId: fromId === ANCHOR_ID ? undefined : fromId,
      toActivityId: toId === ANCHOR_ID ? undefined : toId,
      from,
      to,
      mode: estimate.mode,
      quality: estimate.quality,
      durationMinutes: estimate.durationMinutes,
      distanceMeters: estimate.distanceMeters,
      reservedMinutes: estimate.reservedMinutes || undefined,
      externalUrl: googleMapsDirectionsUrl(from, to, estimate.mode),
      source: estimate.quality === "routed" ? estimate.source : undefined,
      isDemo: estimate.quality === "routed" ? estimate.isDemo : undefined,
    };
    return [leg];
  });

  return { id: input.dayId, date: input.date, isRestDay: input.isRestDay, activities, legs };
}
