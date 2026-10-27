import { straightLineMeters } from "@/domain/route";
import type { ActivityWarning, OpeningStatus, UnscheduledPlace } from "@/domain/itinerary";
import type { LatLng } from "@/domain/geo";
import type { Place } from "@/domain/place";
import type { Source } from "@/domain/source";
import { closedAllDay, type DayOpening, earliestStart, statusFor } from "./opening";

/**
 * Optimizador de itinerario (puro y determinista): reparto geográfico por días alrededor del
 * hotel (barrido angular), orden por vecino más cercano + 2-opt y búsqueda local con ventanas
 * horarias (horario OSM, franjas de comida, actividades bloqueadas). Las horas se calculan en
 * secuencia con los tiempos reales de la matriz, así que un plan sin avisos es siempre realizable.
 */

/** Id del punto de partida y vuelta de cada día (el hotel). */
export const ANCHOR_ID = "anchor";

export interface TravelEstimate {
  mode: "walk" | "car";
  /** `routed`: tiempo de la matriz del proveedor; `approximate`: sin tiempo calculado. */
  quality: "routed" | "approximate";
  durationMinutes?: number;
  distanceMeters?: number;
  /** Margen que reserva el optimizador (estimación local; ver `Leg.reservedMinutes`). */
  reservedMinutes: number;
  straightMeters: number;
  source?: Source;
  isDemo?: boolean;
}

/** Las horas propuestas se redondean a múltiplos de 5 minutos (más legibles; nunca antes de llegar). */
const ceil5 = (minutes: number) => Math.ceil(minutes / 5) * 5;

export const travelTotal = (estimate: TravelEstimate) =>
  (estimate.durationMinutes ?? 0) + estimate.reservedMinutes;

export type TravelFn = (fromId: string, toId: string) => TravelEstimate;

export interface VisitItem {
  type: "visit";
  id: string;
  place: Place;
  duration: number;
  durationEstimated: boolean;
  score: number;
  /** Hora fijada (minutos) si la actividad está bloqueada. */
  lockedStart?: number;
}

export interface BlockItem {
  type: "block";
  id: string;
  kind: "meal" | "free_time";
  slot: "breakfast" | "lunch" | "dinner" | "afternoon";
  title: string;
  duration: number;
  earliest: number;
  latest: number;
  lockedStart?: number;
}

export type PlanItem = VisitItem | BlockItem;

export interface DayContext {
  date: string;
  dayStart: number;
  dayEnd: number;
  slackMinutes: number;
  hasAnchor: boolean;
  travel: TravelFn;
  /** Horario del lugar en la fecha de este día. */
  opening: (place: Place) => DayOpening;
}

export interface ScheduledItem {
  item: PlanItem;
  start: number;
  end: number;
  status?: OpeningStatus;
  warnings: ActivityWarning[];
}

export interface PlannedLeg {
  fromId: string;
  toId: string;
  estimate: TravelEstimate;
}

export interface DaySchedule {
  items: ScheduledItem[];
  /** Tramos en orden, incluido el de vuelta al hotel. */
  legs: PlannedLeg[];
  violations: number;
  travelMinutes: number;
  waitMinutes: number;
  /** Llegada al hotel (o fin de la última actividad sin hotel). */
  endTime: number;
}

/** Calcula horas y tramos de una secuencia fija (lo que se usa tras cada edición manual). */
export function scheduleSequence(sequence: readonly PlanItem[], ctx: DayContext): DaySchedule {
  const items: ScheduledItem[] = [];
  const legs: PlannedLeg[] = [];
  let t = ctx.dayStart;
  let lastEnd = ctx.dayStart;
  let prev: string | undefined = ctx.hasAnchor ? ANCHOR_ID : undefined;
  let travelMinutes = 0;
  let waitMinutes = 0;

  for (const item of sequence) {
    const warnings: ActivityWarning[] = [];
    let arrival = t;
    if (item.type === "visit" && prev !== undefined) {
      const estimate = ctx.travel(prev, item.id);
      legs.push({ fromId: prev, toId: item.id, estimate });
      travelMinutes += travelTotal(estimate);
      arrival = t + travelTotal(estimate);
    }
    const opening = item.type === "visit" ? ctx.opening(item.place) : undefined;
    let start: number;
    if (item.lockedStart !== undefined) {
      start = item.lockedStart;
      if (arrival > start) warnings.push("late_arrival");
    } else if (item.type === "visit") {
      const earliest = earliestStart(opening!, ceil5(arrival), item.duration);
      start = earliest ?? ceil5(arrival);
    } else {
      start = ceil5(Math.max(arrival, item.earliest));
      if (start > item.latest) warnings.push("meal_out_of_window");
    }
    const end = start + item.duration;
    let status: OpeningStatus | undefined;
    if (item.type === "visit") {
      status = statusFor(opening!, start, end);
      if (status === "closed") warnings.push("closed_at_time");
      prev = item.id;
    }
    waitMinutes += Math.max(0, start - arrival);
    items.push({ item, start, end, status, warnings });
    lastEnd = Math.max(lastEnd, end);
    t = end + (item.type === "visit" ? ctx.slackMinutes : 0);
  }

  let endTime = lastEnd;
  if (prev !== undefined && prev !== ANCHOR_ID) {
    const estimate = ctx.travel(prev, ANCHOR_ID);
    legs.push({ fromId: prev, toId: ANCHOR_ID, estimate });
    travelMinutes += travelTotal(estimate);
    endTime = lastEnd + travelTotal(estimate);
  }
  if (endTime > ctx.dayEnd) {
    for (const scheduled of items) {
      if (scheduled.end > ctx.dayEnd || scheduled === items.at(-1)) {
        scheduled.warnings.push("ends_after_day");
      }
    }
  }
  const violations = items.reduce((sum, s) => sum + s.warnings.length, 0);
  return { items, legs, violations, travelMinutes, waitMinutes, endTime };
}

const cost = (s: DaySchedule, ctx: DayContext) =>
  s.violations * 10_000 + s.travelMinutes + 0.3 * s.waitMinutes + 0.01 * (s.endTime - ctx.dayStart);

/**
 * Búsqueda local (reubicar un elemento y 2-opt) sobre las posiciones ≥ `fixedPrefix`.
 * Con ventanas horarias el coste se evalúa programando la secuencia completa.
 */
export function improveSequence(
  sequence: readonly PlanItem[],
  ctx: DayContext,
  fixedPrefix = 0,
): PlanItem[] {
  let best = [...sequence];
  let bestCost = cost(scheduleSequence(best, ctx), ctx);
  for (let round = 0; round < 40; round++) {
    let improved = false;
    for (let i = fixedPrefix; i < best.length; i++) {
      for (let j = fixedPrefix; j < best.length; j++) {
        if (i === j) continue;
        const relocated = [...best];
        const [moved] = relocated.splice(i, 1);
        relocated.splice(j, 0, moved!);
        const candidates = [relocated];
        if (i < j) {
          candidates.push([
            ...best.slice(0, i),
            ...best.slice(i, j + 1).reverse(),
            ...best.slice(j + 1),
          ]);
        }
        for (const candidate of candidates) {
          const candidateCost = cost(scheduleSequence(candidate, ctx), ctx);
          if (candidateCost < bestCost - 1e-6) {
            best = candidate;
            bestCost = candidateCost;
            improved = true;
          }
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/** Orden geográfico inicial: vecino más cercano desde el hotel y 2-opt sobre el recorrido. */
export function routeOrder(visits: readonly VisitItem[], ctx: DayContext): VisitItem[] {
  if (visits.length < 2) return [...visits];
  const time = (a: string, b: string) => travelTotal(ctx.travel(a, b));
  const remaining = [...visits];
  const order: VisitItem[] = [];
  let current = ctx.hasAnchor ? ANCHOR_ID : remaining.shift()!.id;
  if (!ctx.hasAnchor) order.push(visits[0]!);
  while (remaining.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (time(current, remaining[i]!.id) < time(current, remaining[bestIndex]!.id)) bestIndex = i;
    }
    const [next] = remaining.splice(bestIndex, 1);
    order.push(next!);
    current = next!.id;
  }
  const ids = (list: VisitItem[]) =>
    ctx.hasAnchor ? [ANCHOR_ID, ...list.map((v) => v.id), ANCHOR_ID] : list.map((v) => v.id);
  const length = (list: VisitItem[]) => {
    const path = ids(list);
    let total = 0;
    for (let k = 1; k < path.length; k++) total += time(path[k - 1]!, path[k]!);
    return total;
  };
  let best = order;
  let bestLength = length(best);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const candidateLength = length(candidate);
        if (candidateLength < bestLength - 1e-6) {
          best = candidate;
          bestLength = candidateLength;
          improved = true;
        }
      }
    }
  }
  return best;
}

const fixedTime = (item: PlanItem) =>
  item.lockedStart ?? (item.type === "block" ? item.earliest : Number.POSITIVE_INFINITY);

/** Secuencia optimizada de un día con unas visitas flexibles y unos elementos fijos. */
export function buildDay(
  flexible: readonly VisitItem[],
  fixed: readonly PlanItem[],
  ctx: DayContext,
): DaySchedule & { sequence: PlanItem[] } {
  // El desayuno abre el día: va siempre primero y la búsqueda local no lo mueve.
  const isBreakfast = (item: PlanItem) =>
    item.type === "block" && item.slot === "breakfast" && item.lockedStart === undefined;
  const prefix = fixed.filter(isBreakfast);
  let sequence: PlanItem[] = routeOrder(flexible, ctx);
  // Inserta cada elemento con hora (bloqueados, comidas) donde menos cuesta.
  for (const item of [...fixed]
    .filter((i) => !isBreakfast(i))
    .sort((a, b) => fixedTime(a) - fixedTime(b))) {
    let bestSequence: PlanItem[] = [...sequence, item];
    let bestCost = cost(scheduleSequence(bestSequence, ctx), ctx);
    for (let position = 0; position < sequence.length; position++) {
      const candidate = [...sequence.slice(0, position), item, ...sequence.slice(position)];
      const candidateCost = cost(scheduleSequence(candidate, ctx), ctx);
      if (candidateCost < bestCost) {
        bestSequence = candidate;
        bestCost = candidateCost;
      }
    }
    sequence = bestSequence;
  }
  sequence = improveSequence([...prefix, ...sequence], ctx, prefix.length);
  return { ...scheduleSequence(sequence, ctx), sequence };
}

export interface DayPlanResult {
  schedule: DaySchedule & { sequence: PlanItem[] };
  rejected: { visit: VisitItem; reason: UnscheduledPlace["reason"] }[];
}

/**
 * Llena un día por orden de puntuación: cada candidato entra solo si el día sigue sin avisos
 * nuevos (los que ya causan los bloqueos del usuario no cuentan).
 */
export function planDay(
  fixed: readonly PlanItem[],
  candidates: readonly VisitItem[],
  ctx: DayContext,
  maxVisits: number,
): DayPlanResult {
  const accepted: VisitItem[] = [];
  let schedule = buildDay(accepted, fixed, ctx);
  const baseViolations = schedule.violations;
  const lockedVisits = fixed.filter((item) => item.type === "visit").length;
  const rejected: DayPlanResult["rejected"] = [];
  for (const visit of candidates) {
    if (closedAllDay(ctx.opening(visit.place))) {
      rejected.push({ visit, reason: "closed" });
      continue;
    }
    if (accepted.length + lockedVisits >= maxVisits) {
      rejected.push({ visit, reason: "no_room" });
      continue;
    }
    const trial = buildDay([...accepted, visit], fixed, ctx);
    if (trial.violations <= baseViolations) {
      accepted.push(visit);
      schedule = trial;
    } else {
      rejected.push({ visit, reason: "no_time" });
    }
  }
  return { schedule, rejected };
}

/** Reparte los candidatos en `days` grupos por ángulo alrededor del centro (barrido). */
export function sweepGroups<T extends { place: Place }>(
  items: readonly T[],
  center: LatLng,
  days: number,
): T[][] {
  if (days <= 0) return [];
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const withAngle = items
    .map((item) => ({
      item,
      angle: Math.atan2(
        item.place.location.lat - center.lat,
        (item.place.location.lng - center.lng) * cos,
      ),
    }))
    .sort((a, b) => a.angle - b.angle);
  // Empieza tras el mayor hueco angular para no partir una zona compacta en dos días.
  let gapIndex = 0;
  let gap = -1;
  for (let i = 0; i < withAngle.length; i++) {
    const next =
      withAngle[(i + 1) % withAngle.length]!.angle + (i + 1 === withAngle.length ? 2 * Math.PI : 0);
    if (next - withAngle[i]!.angle > gap) {
      gap = next - withAngle[i]!.angle;
      gapIndex = (i + 1) % withAngle.length;
    }
  }
  const rotated = [...withAngle.slice(gapIndex), ...withAngle.slice(0, gapIndex)].map(
    (x) => x.item,
  );
  const size = Math.ceil(rotated.length / days);
  return Array.from({ length: days }, (_, d) => rotated.slice(d * size, (d + 1) * size));
}

export interface GenerateDayInput {
  ctx: DayContext;
  isRestDay: boolean;
  /** Actividades bloqueadas que se conservan y elementos fijos (comidas) del día. */
  fixed: PlanItem[];
}

export interface GenerateInput {
  days: GenerateDayInput[];
  /** Candidatos ya puntuados (sin los que están bloqueados en algún día). */
  candidates: VisitItem[];
  maxVisitsPerDay: number;
  center: LatLng;
}

export interface GeneratedDay {
  date: string;
  isRestDay: boolean;
  schedule: (DaySchedule & { sequence: PlanItem[] }) | undefined;
  /** Alternativa (confirmada abierta a esa hora) por id de visita con horario sin confirmar. */
  alternatives: Map<string, Place>;
}

/** Genera el itinerario completo. */
export function generateItinerary(input: GenerateInput): {
  days: GeneratedDay[];
  unscheduled: UnscheduledPlace[];
} {
  const active = input.days.filter((day) => !day.isRestDay);
  const pool = [...input.candidates].sort((a, b) => b.score - a.score);
  const groups = sweepGroups(pool, input.center, active.length);
  const results = new Map<string, DayPlanResult>();
  const leftovers: DayPlanResult["rejected"] = [];

  active.forEach((day, index) => {
    const group = [...(groups[index] ?? [])].sort((a, b) => b.score - a.score);
    const result = planDay(day.fixed, group, day.ctx, input.maxVisitsPerDay);
    results.set(day.ctx.date, result);
    leftovers.push(...result.rejected);
  });

  // Segunda pasada: lo que no cupo en su zona se prueba en los días con hueco más cercanos.
  const unscheduled: UnscheduledPlace[] = [];
  for (const { visit, reason } of leftovers.sort((a, b) => b.visit.score - a.visit.score)) {
    const byDistance = [...active].sort(
      (a, b) =>
        dayDistance(results.get(a.ctx.date)!, visit) - dayDistance(results.get(b.ctx.date)!, visit),
    );
    let placed = false;
    for (const day of byDistance) {
      const current = results.get(day.ctx.date)!;
      const accepted = current.schedule.sequence.filter(
        (item): item is VisitItem => item.type === "visit" && item.lockedStart === undefined,
      );
      const lockedVisits = day.fixed.filter((item) => item.type === "visit").length;
      if (accepted.length + lockedVisits >= input.maxVisitsPerDay) continue;
      if (closedAllDay(day.ctx.opening(visit.place))) continue;
      const base = buildDay([], day.fixed, day.ctx).violations;
      const trial = buildDay([...accepted, visit], day.fixed, day.ctx);
      if (trial.violations <= base) {
        results.set(day.ctx.date, { schedule: trial, rejected: current.rejected });
        placed = true;
        break;
      }
    }
    if (!placed) {
      // "Cerrado" solo si el horario confirma que no abre ningún día del viaje.
      const closedEveryDay = active.every((day) => closedAllDay(day.ctx.opening(visit.place)));
      unscheduled.push({
        place: visit.place,
        reason: closedEveryDay ? "closed" : reason === "closed" ? "no_time" : reason,
      });
    }
  }

  const used = new Set<string>();
  for (const result of results.values()) {
    for (const item of result.schedule.sequence) if (item.type === "visit") used.add(item.place.id);
  }
  const spare = pool.filter((visit) => !used.has(visit.place.id));

  return {
    days: input.days.map((day) => {
      const result = results.get(day.ctx.date);
      const alternatives = new Map<string, Place>();
      for (const scheduled of result?.schedule.items ?? []) {
        if (scheduled.item.type !== "visit" || scheduled.status === "open") continue;
        const alternative = findAlternative(scheduled, spare, day.ctx);
        if (alternative) alternatives.set(scheduled.item.id, alternative);
      }
      return {
        date: day.ctx.date,
        isRestDay: day.isRestDay,
        schedule: result?.schedule,
        alternatives,
      };
    }),
    unscheduled: dedupeUnscheduled(unscheduled).slice(0, 12),
  };
}

function dayDistance(result: DayPlanResult, visit: VisitItem) {
  const visits = result.schedule.sequence.filter(
    (item): item is VisitItem => item.type === "visit",
  );
  if (visits.length === 0) return 0;
  return Math.min(...visits.map((v) => straightLineMeters(v.place.location, visit.place.location)));
}

/** Lugar a ≤ 1 km abierto con horario confirmado en la misma franja. */
export function findAlternative(
  scheduled: ScheduledItem,
  spare: readonly VisitItem[],
  ctx: DayContext,
) {
  if (scheduled.item.type !== "visit") return undefined;
  const origin = scheduled.item.place.location;
  let best: { place: Place; meters: number } | undefined;
  for (const visit of spare) {
    const meters = straightLineMeters(origin, visit.place.location);
    if (meters > 1000 || (best && meters >= best.meters)) continue;
    const status = statusFor(
      ctx.opening(visit.place),
      scheduled.start,
      scheduled.start + visit.duration,
    );
    if (status === "open") best = { place: visit.place, meters };
  }
  return best?.place;
}

function dedupeUnscheduled(list: UnscheduledPlace[]) {
  const seen = new Set<string>();
  return list.filter((entry) => !seen.has(entry.place.id) && seen.add(entry.place.id));
}
