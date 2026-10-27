import { BBoxStringSchema } from "@/domain/geo";
import type { FreeTimeRequest, FreeTimeSuggestion } from "@/domain/discover";
import type { ItineraryMeta } from "@/domain/itinerary";
import { toMinutes } from "@/domain/preferences";
import { straightLineMeters } from "@/domain/route";
import type { Trip } from "@/domain/trip";
import { areaAround } from "@/lib/map/layers";
import type { ProviderSelection } from "@/server/providers/core/registry";
import type { HolidaysProvider } from "@/server/providers/holidays";
import type { PlacesProvider } from "@/server/providers/pois";
import type { RoutingProvider } from "@/server/providers/routing";
import { isDemoMatrixPoint } from "@/server/providers/routing/demo";
import { holidayMap, holidaysForTrip } from "../calendar/holidays";
import { dayOpening, statusFor } from "../itinerary/opening";
import { minutesToTime } from "../itinerary/plan";
import {
  estimatedDuration,
  hasApplicableInterests,
  placeScore,
  VISIT_CATEGORIES,
} from "../itinerary/profile";
import { travelMatrix } from "../routes";

export interface FreeTimeDeps {
  places: ProviderSelection<PlacesProvider>;
  routing: ProviderSelection<RoutingProvider>;
  holidays: ProviderSelection<HolidaysProvider>;
}

export interface FreeTimeResult {
  /** Lugares que caben (ir + visitar + volver) en el tiempo, mejor primero. */
  suggestions: FreeTimeSuggestion[];
  /** Encadenado sugerido de varias visitas que cabe en el tiempo (vuelta incluida). */
  plan: FreeTimeSuggestion[];
  planMinutes: number;
  /** Lugares cercanos descartados porque no hay tiempo de trayecto calculado. */
  withoutTimes: number;
  travel: ItineraryMeta["travel"];
  notices: string[];
}

/** Candidatos que se miden con la matriz (con el origen, ≤ 100 puntos). */
const MAX_CANDIDATES = 30;
/** A pie, ~80 m/min en línea recta: cota para descartar lo que no puede caber. */
const STRAIGHT_METERS_PER_MINUTE = 80;

const minutes = (seconds: number | null | undefined) =>
  seconds === null || seconds === undefined ? undefined : Math.ceil(seconds / 60);

/**
 * "Tengo N horas libres" (REQUISITOS §14C): lugares visitables cerca del punto de partida que caben
 * en el tiempo con trayectos a pie reales (matriz del proveedor de rutas), duración estimada y el
 * horario de ese día (festivos incluidos). Sin tiempo calculado un lugar no se propone.
 */
export async function freeTime(
  trip: Trip,
  request: FreeTimeRequest,
  deps: FreeTimeDeps,
): Promise<FreeTimeResult> {
  const notices: string[] = [];
  const search = await deps.places.provider.searchByBBox({
    bbox: BBoxStringSchema.parse(areaAround(request.origin)),
    categories: [...VISIT_CATEGORIES],
    limit: 500,
  });
  const reach = (request.minutes / 2) * STRAIGHT_METERS_PER_MINUTE;
  const applicable = hasApplicableInterests(trip.preferences);
  const planned = new Set(
    trip.days
      .filter((day) => day.date === request.date)
      .flatMap((day) => day.activities.flatMap((a) => (a.place ? [a.place.id] : []))),
  );
  let nearby = search.places
    .map((place) => ({
      place,
      meters: straightLineMeters(request.origin, place.location),
      score: placeScore(place, trip.preferences, applicable),
    }))
    .filter(({ meters, score, place }) => meters <= reach && score > 0 && !planned.has(place.id));
  if (deps.routing.isDemo) {
    const covered = nearby.filter(({ place }) => isDemoMatrixPoint(place.location));
    if (covered.length < nearby.length) {
      notices.push("Datos de demostración: solo se miden los lugares con trayectos grabados.");
    }
    nearby = covered;
  }
  // Los mejores por puntuación, con la cercanía como desempate.
  const candidates = nearby
    .sort((a, b) => b.score - a.score || a.meters - b.meters)
    .slice(0, MAX_CANDIDATES);

  const points = [request.origin, ...candidates.map(({ place }) => place.location)];
  const matrix = await travelMatrix(
    { origins: points, destinations: points, mode: "walk" },
    deps.routing,
  );
  const travel: ItineraryMeta["travel"] =
    matrix.quality === "unavailable"
      ? { quality: "unavailable", message: matrix.message }
      : { quality: "routed", source: matrix.source, isDemo: matrix.isDemo };
  const time = (from: number, to: number) => minutes(matrix.durationsSeconds?.[from]?.[to]);

  const holidays = holidayMap((await holidaysForTrip(trip, deps.holidays)).holidays);
  const context = {
    countryCode: trip.destination.countryCode,
    location: trip.destination.location,
    holidays,
  };
  const start = toMinutes(request.start);
  const end = start + request.minutes;

  let withoutTimes = 0;
  const suggestions: (FreeTimeSuggestion & { index: number })[] = [];
  candidates.forEach(({ place, score }, i) => {
    const index = i + 1;
    const to = time(0, index);
    const back = time(index, 0);
    if (to === undefined || back === undefined) {
      withoutTimes += 1;
      return;
    }
    const visit = estimatedDuration(place, trip.pace);
    const arrival = start + to;
    if (arrival + visit + back > end) return;
    const status = statusFor(
      dayOpening(place.openingHours, request.date, context),
      arrival,
      arrival + visit,
    );
    if (status === "closed") return;
    suggestions.push({
      index,
      place,
      walkToMinutes: to,
      walkBackMinutes: back,
      visitMinutes: visit,
      arrival: minutesToTime(arrival),
      openingStatus: status,
      score,
    });
  });
  // Mejor encaje: la puntuación (intereses) menos lo que cuesta llegar, con el horario confirmado
  // por delante; no se premian las visitas cortas.
  const value = (s: FreeTimeSuggestion) =>
    worth(s.score, s.walkToMinutes) + (s.openingStatus === "open" ? 0.5 : 0);
  suggestions.sort((a, b) => value(b) - value(a));

  const plan = chain(suggestions, { start, end, time, trip, context, request });
  if (withoutTimes > 0 && suggestions.length === 0) {
    notices.push(
      "No hay tiempos de trayecto calculados desde este punto: no se proponen lugares sin saber cuánto se tarda.",
    );
  }
  return {
    suggestions: suggestions.map(withoutIndex),
    plan: plan.items,
    planMinutes: plan.minutes,
    withoutTimes,
    travel,
    notices: [...notices, ...search.warnings],
  };
}

/** Cada 15 minutos andando restan un punto de interés. */
const worth = (score: number, walkMinutes: number) => score - walkMinutes / 15;

function withoutIndex(suggestion: FreeTimeSuggestion & { index: number }): FreeTimeSuggestion {
  const copy: Partial<typeof suggestion> = { ...suggestion };
  delete copy.index;
  return copy as FreeTimeSuggestion;
}

/** Encadena visitas (la mejor que quepa desde el punto actual) mientras quepa la vuelta. */
function chain(
  pool: (FreeTimeSuggestion & { index: number })[],
  input: {
    start: number;
    end: number;
    time: (from: number, to: number) => number | undefined;
    trip: Trip;
    context: Parameters<typeof dayOpening>[2];
    request: FreeTimeRequest;
  },
) {
  const items: FreeTimeSuggestion[] = [];
  const used = new Set<number>();
  let at = 0;
  let clock = input.start;
  for (;;) {
    let best: { s: FreeTimeSuggestion & { index: number }; arrival: number; v: number } | undefined;
    for (const s of pool) {
      if (used.has(s.index)) continue;
      const to = input.time(at, s.index);
      const back = input.time(s.index, 0);
      if (to === undefined || back === undefined) continue;
      const arrival = clock + to;
      if (arrival + s.visitMinutes + back > input.end) continue;
      const status = statusFor(
        dayOpening(s.place.openingHours, input.request.date, input.context),
        arrival,
        arrival + s.visitMinutes,
      );
      if (status === "closed") continue;
      const v = worth(s.score, to) + (status === "open" ? 0.5 : 0);
      if (!best || v > best.v)
        best = {
          s: { ...s, walkToMinutes: to, walkBackMinutes: back, openingStatus: status },
          arrival,
          v,
        };
    }
    if (!best) break;
    used.add(best.s.index);
    items.push({ ...withoutIndex(best.s), arrival: minutesToTime(best.arrival) });
    clock = best.arrival + best.s.visitMinutes;
    at = best.s.index;
  }
  const last = items.at(-1);
  return {
    items,
    minutes: last ? clock + last.walkBackMinutes - input.start : 0,
  };
}
