import { randomUUID } from "node:crypto";
import { BBoxStringSchema, type LatLng } from "@/domain/geo";
import type { ItineraryEdit, ItineraryMeta } from "@/domain/itinerary";
import type { Place } from "@/domain/place";
import { toMinutes } from "@/domain/preferences";
import { straightLineMeters, type TravelMatrix } from "@/domain/route";
import type { Activity, ItineraryDay, Trip } from "@/domain/trip";
import { areaAround } from "@/lib/map/layers";
import type { ProviderSelection } from "@/server/providers/core/registry";
import { ProviderError } from "@/server/providers/core/types";
import { getPlacesProvider, type PlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider, type RoutingProvider } from "@/server/providers/routing";
import { isDemoMatrixPoint } from "@/server/providers/routing/demo";
import { MAX_MATRIX_POINTS } from "@/server/providers/routing/types";
import { normalizeText as normalize } from "@/server/providers/core/osm";
import { travelMatrix } from "../routes";
import { type DayOpening, dayOpening } from "./opening";
import {
  ANCHOR_ID,
  type DayContext,
  generateItinerary,
  improveSequence,
  type PlanItem,
  scheduleSequence,
  type VisitItem,
} from "./optimizer";
import { defaultBlocks, itemFromActivity, toItineraryDay, tripDates, visitFromPlace } from "./plan";
import { hasApplicableInterests, PACE_PROFILES, placeScore, VISIT_CATEGORIES } from "./profile";
import { buildTravel, straightOnlyMatrix, type TravelPoint } from "./travel";

export interface ItineraryDeps {
  places: ProviderSelection<PlacesProvider>;
  routing: ProviderSelection<RoutingProvider>;
}

const defaultDeps = (): ItineraryDeps => ({
  places: getPlacesProvider(),
  routing: getRoutingProvider(),
});

export interface Itinerary {
  days: ItineraryDay[];
  meta?: ItineraryMeta;
}

/** Sin lugares no hay itinerario: el error recuerda dónde, para ofrecer el mapa de OSM. */
export class PlacesUnavailableError extends ProviderError {
  constructor(
    cause: ProviderError,
    readonly at: LatLng,
  ) {
    super(cause.message, cause.providerId);
    this.name = "PlacesUnavailableError";
  }
}

export class ItineraryEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItineraryEditError";
  }
}

/** Horarios de un día con memoria por lugar (el optimizador los consulta muchas veces). */
function openingFor(trip: Trip, date: string) {
  const memo = new Map<string, DayOpening>();
  const context = {
    countryCode: trip.destination.countryCode,
    location: trip.destination.location,
  };
  return (place: Place) => {
    let opening = memo.get(place.id);
    if (!opening) {
      opening = dayOpening(place.openingHours, date, context);
      memo.set(place.id, opening);
    }
    return opening;
  };
}

const anchorOf = (trip: Trip): LatLng | undefined => trip.hotel?.location;

/** Matrices a pie y en coche para los puntos; un fallo deja la matriz sin tiempos. */
async function matricesFor(
  points: readonly TravelPoint[],
  routing: ProviderSelection<RoutingProvider>,
) {
  const locations = points.map((p) => p.location);
  if (points.length < 2) {
    const empty = straightOnlyMatrix(points, "");
    return { walk: { ...empty, quality: "routed" as const }, car: undefined };
  }
  const [walk, car] = await Promise.all([
    travelMatrix({ origins: locations, destinations: locations, mode: "walk" }, routing),
    travelMatrix({ origins: locations, destinations: locations, mode: "car" }, routing),
  ]);
  return { walk, car: car.quality === "routed" ? car : undefined };
}

function travelQuality(walk: TravelMatrix): ItineraryMeta["travel"] {
  if (walk.quality === "unavailable") {
    return { quality: "unavailable", message: walk.message };
  }
  const hasGaps = walk.durationsSeconds?.some((row) => row.some((value) => value === null));
  return {
    quality: hasGaps ? "partial" : "routed",
    source: walk.source,
    isDemo: walk.isDemo,
  };
}

/** Evita el mismo lugar dos veces (OSM a veces tiene nodo y área con el mismo nombre). */
function dedupePlaces(places: readonly Place[]) {
  const kept: Place[] = [];
  for (const place of places) {
    const duplicate = kept.some(
      (other) =>
        other.id === place.id ||
        (normalize(other.name) === normalize(place.name) &&
          straightLineMeters(other.location, place.location) < 250),
    );
    if (!duplicate) kept.push(place);
  }
  return kept;
}

function dayContext(trip: Trip, date: string, travel: DayContext["travel"]): DayContext {
  return {
    date,
    dayStart: toMinutes(trip.pace.dayStart),
    dayEnd: toMinutes(trip.pace.dayEnd),
    slackMinutes: PACE_PROFILES[trip.pace.level].slackMinutes,
    hasAnchor: anchorOf(trip) !== undefined,
    travel,
    opening: openingFor(trip, date),
  };
}

const previousActivities = (trip: Trip) =>
  new Map<string, Activity>(trip.days.flatMap((day) => day.activities.map((a) => [a.id, a])));

/**
 * Genera el itinerario completo del viaje. Se conservan las actividades bloqueadas (en su día y
 * hora); el resto se vuelve a calcular.
 */
export async function computeItinerary(
  trip: Trip,
  deps: ItineraryDeps = defaultDeps(),
): Promise<Itinerary> {
  const { pace, preferences } = trip;
  const profile = PACE_PROFILES[pace.level];
  const anchor = anchorOf(trip);
  const center = anchor ?? trip.destination.location;
  const dates = tripDates(trip.startDate, trip.endDate);
  const restDays = new Set(pace.restDays);
  const activeDays = dates.filter((date) => !restDays.has(date)).length;
  const notices: string[] = [];

  const lockedByDate = new Map<string, Activity[]>();
  for (const day of trip.days) {
    const locked = day.activities.filter((a) => a.locked && a.startTime);
    if (locked.length > 0 && dates.includes(day.date)) lockedByDate.set(day.date, locked);
  }
  const lockedPlaceIds = new Set(
    [...lockedByDate.values()].flat().flatMap((a) => (a.place ? [a.place.id] : [])),
  );

  let search: Awaited<ReturnType<PlacesProvider["searchByBBox"]>>;
  try {
    search = await deps.places.provider.searchByBBox({
      bbox: BBoxStringSchema.parse(areaAround(center)),
      categories: [...VISIT_CATEGORIES],
      limit: 500,
    });
  } catch (error) {
    if (error instanceof ProviderError) throw new PlacesUnavailableError(error, center);
    throw error;
  }
  const applicable = hasApplicableInterests(preferences);
  if (!applicable && Object.keys(preferences.interests).length > 0) {
    notices.push(
      "Tus intereses aún no tienen lugares que programar (gastronomía, compras, eventos… llegan en próximas fases): se proponen visitas generales.",
    );
  }
  let places = dedupePlaces(search.places).filter(
    (place) =>
      !lockedPlaceIds.has(place.id) && !(pace.reducedMobility && place.wheelchair === "no"),
  );
  // En demo solo hay tiempos grabados entre los lugares de Madrid centro y el hotel de la demo.
  if (deps.routing.isDemo) {
    const covered = places.filter((place) => isDemoMatrixPoint(place.location));
    if (covered.length > 0) places = covered;
  }

  const lockedVisitCount = [...lockedByDate.values()].flat().filter((a) => a.place).length;
  const poolSize = Math.max(
    0,
    Math.min(
      MAX_MATRIX_POINTS - (anchor ? 1 : 0) - lockedVisitCount,
      activeDays * profile.maxVisitsPerDay * 2,
    ),
  );
  const candidates: VisitItem[] = places
    .map((place) => ({ place, score: placeScore(place, preferences, applicable) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, poolSize)
    .map(({ place, score }) => visitFromPlace(place, pace, score));

  const lockedItems = new Map<string, PlanItem[]>(
    [...lockedByDate].map(([date, activities]) => [
      date,
      activities.map((activity) => itemFromActivity(activity, pace)),
    ]),
  );
  const points: TravelPoint[] = [
    ...(anchor ? [{ id: ANCHOR_ID, location: anchor }] : []),
    ...candidates.map((c) => ({ id: c.id, location: c.place.location })),
    ...[...lockedItems.values()]
      .flat()
      .flatMap((item) =>
        item.type === "visit" ? [{ id: item.id, location: item.place.location }] : [],
      ),
  ];
  const matrices = await matricesFor(points, deps.routing);
  const travel = buildTravel(points, matrices, { reducedMobility: pace.reducedMobility });
  if (matrices.walk.quality === "unavailable") {
    notices.push(
      "No hay tiempos de trayecto calculados: se reserva un margen estimado entre actividades. Consulta cada trayecto con el enlace externo.",
    );
  }
  if (candidates.length === 0) {
    notices.push("No se han encontrado lugares visitables en la zona del destino.");
  }

  const generated = generateItinerary({
    days: dates.map((date) => {
      const fixed = lockedItems.get(date) ?? [];
      const takenSlots = new Set(
        fixed.flatMap((item) => (item.type === "block" ? [item.slot] : [])),
      );
      return {
        ctx: dayContext(trip, date, travel),
        isRestDay: restDays.has(date),
        fixed: restDays.has(date) ? [] : [...fixed, ...defaultBlocks(pace, takenSlots)],
      };
    }),
    candidates,
    maxVisitsPerDay: profile.maxVisitsPerDay,
    center,
  });

  const previous = previousActivities(trip);
  const existingIds = new Map(trip.days.map((day) => [day.date, day.id]));
  return {
    days: generated.days.map((day) =>
      toItineraryDay({
        dayId: existingIds.get(day.date) ?? randomUUID(),
        date: day.date,
        isRestDay: day.isRestDay,
        schedule: day.schedule,
        anchor,
        previous,
        alternatives: day.alternatives,
      }),
    ),
    meta: {
      generatedAt: new Date().toISOString(),
      travel: travelQuality(matrices.walk),
      places: { isDemo: deps.places.isDemo, sourceName: deps.places.provider.name },
      unscheduled: generated.unscheduled,
      notices: [...notices, ...search.warnings],
    },
  };
}

/** Recalcula un día con el orden dado (tras una edición) o reoptimizando a partir de un punto. */
async function recomputeDay(
  trip: Trip,
  day: ItineraryDay,
  deps: ItineraryDeps,
  reorganizeFrom?: number,
): Promise<ItineraryDay> {
  const anchor = anchorOf(trip);
  if (day.isRestDay && day.activities.length === 0) return { ...day, legs: [] };
  const sequence = day.activities.map((activity) => itemFromActivity(activity, trip.pace));
  const points: TravelPoint[] = [
    ...(anchor ? [{ id: ANCHOR_ID, location: anchor }] : []),
    ...sequence.flatMap((item) =>
      item.type === "visit" ? [{ id: item.id, location: item.place.location }] : [],
    ),
  ];
  const matrices = await matricesFor(points, deps.routing);
  const ctx = dayContext(trip, day.date, buildTravel(points, matrices, trip.pace));
  const ordered =
    reorganizeFrom === undefined ? sequence : improveSequence(sequence, ctx, reorganizeFrom);
  return toItineraryDay({
    dayId: day.id,
    date: day.date,
    isRestDay: day.isRestDay,
    schedule: scheduleSequence(ordered, ctx),
    anchor,
    previous: new Map(day.activities.map((a) => [a.id, a])),
  });
}

function findActivity(days: ItineraryDay[], activityId: string) {
  for (const day of days) {
    const index = day.activities.findIndex((a) => a.id === activityId);
    if (index >= 0) return { day, index, activity: day.activities[index]! };
  }
  throw new ItineraryEditError("La actividad ya no está en el itinerario.");
}

function findDay(days: ItineraryDay[], date: string) {
  const day = days.find((d) => d.date === date);
  if (!day) throw new ItineraryEditError("Ese día no forma parte del viaje.");
  return day;
}

/** Días del viaje (con los que falten creados vacíos) en orden. */
function tripDays(trip: Trip): ItineraryDay[] {
  const existing = new Map(trip.days.map((day) => [day.date, day]));
  return tripDates(trip.startDate, trip.endDate).map(
    (date) =>
      existing.get(date) ?? {
        id: randomUUID(),
        date,
        isRestDay: trip.pace.restDays.includes(date),
        activities: [],
        legs: [],
      },
  );
}

/**
 * Aplica una edición manual y recalcula solo los días afectados (horas y tramos). Las
 * ediciones nunca descartan actividades: si algo no encaja, la actividad lleva su aviso.
 */
export async function computeEdit(
  trip: Trip,
  edit: ItineraryEdit,
  deps: ItineraryDeps = defaultDeps(),
): Promise<ItineraryDay[]> {
  const days = tripDays(trip).map((day) => ({ ...day, activities: [...day.activities] }));
  const affected = new Set<string>();
  let reorganizeFrom: number | undefined;

  switch (edit.op) {
    case "add": {
      const day = findDay(days, edit.date);
      const visit = visitFromPlace(edit.place, trip.pace, 0);
      const activity: Activity = {
        id: visit.id,
        kind: "visit",
        title: edit.place.name,
        place: edit.place,
        durationMinutes: visit.duration,
        locked: false,
        bookingRequirement: "unverified",
        bookingLinks: [],
        planning: { slot: "morning", durationEstimated: true, warnings: [] },
      };
      day.activities.splice(edit.position ?? day.activities.length, 0, activity);
      affected.add(day.date);
      break;
    }
    case "remove": {
      const { day, index } = findActivity(days, edit.activityId);
      day.activities.splice(index, 1);
      affected.add(day.date);
      break;
    }
    case "move": {
      const { day, index, activity } = findActivity(days, edit.activityId);
      const target = findDay(days, edit.date);
      day.activities.splice(index, 1);
      // Al cambiar de día una hora bloqueada deja de tener sentido: se desbloquea.
      const moved = target === day ? activity : { ...activity, locked: false };
      target.activities.splice(Math.min(edit.position, target.activities.length), 0, moved);
      affected.add(day.date).add(target.date);
      break;
    }
    case "set_time": {
      const { day, index, activity } = findActivity(days, edit.activityId);
      day.activities[index] = { ...activity, startTime: edit.time, locked: true };
      // Se recoloca según la hora para que la secuencia siga el reloj.
      day.activities.sort((a, b) => sortKey(a) - sortKey(b));
      affected.add(day.date);
      break;
    }
    case "lock": {
      const { day, index, activity } = findActivity(days, edit.activityId);
      day.activities[index] = { ...activity, locked: edit.locked };
      affected.add(day.date);
      break;
    }
    case "reorganize": {
      const day = findDay(days, edit.date);
      reorganizeFrom = edit.afterActivityId
        ? findActivity([day], edit.afterActivityId).index + 1
        : 0;
      affected.add(day.date);
      break;
    }
  }

  return Promise.all(
    days
      .filter((day) => affected.has(day.date))
      .map((day) => recomputeDay(trip, day, deps, reorganizeFrom)),
  );
}

const sortKey = (activity: Activity) =>
  activity.startTime ? toMinutes(activity.startTime) : Number.POSITIVE_INFINITY;
