import {
  LODGING_TYPE_OF,
  type LodgingCandidate,
  type LodgingScoreKey,
  type LodgingSort,
  type LodgingWeights,
  type PointDistance,
} from "@/domain/lodging";
import type { AccommodationPreferences } from "@/domain/preferences";

/**
 * Puntuación interna de alojamientos (REQUISITOS §7): media ponderada de componentes de 0 a 100.
 * Un componente sin datos (p. ej. presupuesto sin precio) no cuenta: no se rellena con supuestos.
 * Solo usa datos con fuente (OSM, tiempos del proveedor de rutas) o la recta, marcada como tal.
 */

/** Cómo se mide una distancia en toda la lista: con tiempos a pie o solo en línea recta. */
export type DistanceBasis = "walk" | "straight";

/** Escala lineal: `best` o mejor → 100, `worst` o peor → 0. */
export function linearScore(value: number, best: number, worst: number) {
  if (value <= best) return 100;
  if (value >= worst) return 0;
  return Math.round((100 * (worst - value)) / (worst - best));
}

const SCALES = {
  /** Media de minutos a pie a los puntos clave. */
  proximityWalk: [8, 35],
  /** Media de metros en línea recta a los puntos clave. */
  proximityStraight: [600, 2800],
  stationWalk: [3, 15],
  stationStraight: [200, 1200],
  center: [500, 2500],
} as const satisfies Record<string, readonly [number, number]>;

const hasWalk = (point: PointDistance) => point.walkMinutes !== undefined;

/**
 * Base común para comparar: tiempos a pie solo si todos los candidatos los tienen; si falta
 * alguno, todos se comparan en línea recta (mezclar ambas medidas sería injusto).
 */
export function proximityBasis(candidates: readonly LodgingCandidate[]): DistanceBasis {
  return candidates.every((c) => c.keyPoints.length > 0 && c.keyPoints.every(hasWalk))
    ? "walk"
    : "straight";
}

export function stationBasis(candidates: readonly LodgingCandidate[]): DistanceBasis {
  return candidates.every((c) => !c.station || hasWalk(c.station)) ? "walk" : "straight";
}

const mean = (values: number[]) =>
  values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Media a los puntos clave en la base dada (minutos a pie o metros en línea recta). */
export function proximityValue(candidate: LodgingCandidate, basis: DistanceBasis) {
  return mean(
    candidate.keyPoints.map((point) =>
      basis === "walk" ? (point.walkMinutes ?? Infinity) : point.straightLineMeters,
    ),
  );
}

export function stationValue(candidate: LodgingCandidate, basis: DistanceBasis) {
  const { station } = candidate;
  if (!station) return undefined;
  return basis === "walk" ? station.walkMinutes : station.straightLineMeters;
}

export interface ScoreComponent {
  key: LodgingScoreKey;
  /** 0–100 o `null` si no hay datos para calcularlo. */
  score: number | null;
  weight: number;
  /** Explicación breve para el desglose. */
  reason: string;
}

export interface LodgingScore {
  /** 0–100 o `null` si ningún componente con peso tiene datos. */
  total: number | null;
  components: ScoreComponent[];
}

export interface ScoreContext {
  preferences?: AccommodationPreferences;
  weights: LodgingWeights;
  proximity: DistanceBasis;
  station: DistanceBasis;
}

const minutes = (value: number) => `${Math.round(value)} min`;
const meters = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(value)} m`;

function proximityComponent(candidate: LodgingCandidate, basis: DistanceBasis) {
  const value = proximityValue(candidate, basis);
  if (value === undefined) return { score: null, reason: "Sin puntos de referencia" };
  const [best, worst] = basis === "walk" ? SCALES.proximityWalk : SCALES.proximityStraight;
  return {
    score: linearScore(value, best, worst),
    reason:
      basis === "walk"
        ? `Media de ${minutes(value)} a pie`
        : `Media de ${meters(value)} en línea recta`,
  };
}

function transportComponent(candidate: LodgingCandidate, basis: DistanceBasis, radius: number) {
  const value = stationValue(candidate, basis);
  if (value === undefined) {
    return { score: 0, reason: `Sin estación a menos de ${meters(radius)} según OSM` };
  }
  const [best, worst] = basis === "walk" ? SCALES.stationWalk : SCALES.stationStraight;
  return {
    score: linearScore(value, best, worst),
    reason:
      basis === "walk"
        ? `Estación a ${minutes(value)} a pie`
        : `Estación a ${meters(value)} en línea recta`,
  };
}

function budgetComponent(candidate: LodgingCandidate, budgetPerNight?: number) {
  const { pricing } = candidate;
  if (pricing.status !== "available") return { score: null, reason: "Sin precio disponible" };
  if (budgetPerNight === undefined) {
    return { score: null, reason: "No has indicado presupuesto por noche" };
  }
  if (budgetPerNight === 0) {
    const free = pricing.amountPerNight === 0;
    return {
      score: free ? 100 : 0,
      reason: free ? "Dentro del presupuesto" : "Por encima del presupuesto",
    };
  }
  return {
    score: linearScore(pricing.amountPerNight, budgetPerNight, budgetPerNight * 1.5),
    reason:
      pricing.amountPerNight <= budgetPerNight
        ? "Dentro del presupuesto"
        : "Por encima del presupuesto",
  };
}

/** Preferencias del paso 2: tipo, categoría, accesibilidad y zona. Solo las que el usuario fijó. */
function preferencesComponent(
  candidate: LodgingCandidate,
  context: ScoreContext,
  transportScore: number | null,
) {
  const prefs = context.preferences;
  const parts: { score: number; label: string }[] = [];
  const { place } = candidate;
  if (prefs && prefs.types.length > 0) {
    const type = LODGING_TYPE_OF[place.category];
    const match = type !== undefined && prefs.types.includes(type);
    parts.push({ score: match ? 100 : 0, label: match ? "tipo elegido" : "otro tipo" });
  }
  if (prefs?.minStars !== undefined) {
    const { stars } = place;
    parts.push(
      stars === undefined
        ? { score: 50, label: "sin estrellas en OSM" }
        : stars >= prefs.minStars
          ? { score: 100, label: `${stars}★` }
          : { score: 0, label: `${stars}★, menos de las pedidas` },
    );
  }
  if (prefs?.accessible) {
    const scores = { yes: 100, limited: 50, no: 0 } as const;
    const labels = { yes: "accesible", limited: "accesibilidad parcial", no: "no accesible" };
    parts.push(
      place.wheelchair
        ? { score: scores[place.wheelchair], label: labels[place.wheelchair] }
        : { score: 25, label: "accesibilidad sin datos" },
    );
  }
  if (prefs?.zone === "central") {
    const [best, worst] = SCALES.center;
    parts.push({
      score: linearScore(candidate.centerMeters, best, worst),
      label: `a ${meters(candidate.centerMeters)} del centro`,
    });
  } else if (prefs?.zone === "well_connected" && transportScore !== null) {
    parts.push({ score: transportScore, label: "bien comunicado" });
  }
  if (parts.length === 0) return { score: null, reason: "No has indicado preferencias" };
  return {
    score: Math.round(mean(parts.map((part) => part.score)) ?? 0),
    reason: parts.map((part) => part.label).join(" · "),
  };
}

export function scoreLodging(
  candidate: LodgingCandidate,
  context: ScoreContext & { stationRadiusMeters: number },
): LodgingScore {
  const transport = transportComponent(candidate, context.station, context.stationRadiusMeters);
  const parts: Record<LodgingScoreKey, { score: number | null; reason: string }> = {
    budget: budgetComponent(candidate, context.preferences?.budgetPerNight),
    proximity: proximityComponent(candidate, context.proximity),
    transport,
    preferences: preferencesComponent(candidate, context, transport.score),
  };
  const components = (Object.keys(parts) as LodgingScoreKey[]).map((key) => ({
    key,
    ...parts[key],
    weight: context.weights[key],
  }));
  const counted = components.filter((c) => c.score !== null && c.weight > 0);
  const weightSum = counted.reduce((sum, c) => sum + c.weight, 0);
  const total =
    weightSum === 0
      ? null
      : Math.round(counted.reduce((sum, c) => sum + (c.score ?? 0) * c.weight, 0) / weightSum);
  return { total, components };
}

export interface RankedLodging {
  candidate: LodgingCandidate;
  score: LodgingScore;
}

const componentScore = (ranked: RankedLodging, key: LodgingScoreKey) =>
  ranked.score.components.find((c) => c.key === key)?.score ?? null;

const byName = (a: RankedLodging, b: RankedLodging) =>
  a.candidate.place.name.localeCompare(b.candidate.place.name, "es");

/** Ascendente con los vacíos al final. */
const ascending = (a: number | undefined | null, b: number | undefined | null) =>
  (a ?? Infinity) - (b ?? Infinity);

/** Puntúa y ordena. Empates por nombre, para un orden estable y predecible. */
export function rankLodging(
  candidates: readonly LodgingCandidate[],
  sort: LodgingSort,
  context: Omit<ScoreContext, "proximity" | "station"> & { stationRadiusMeters: number },
): { items: RankedLodging[]; proximity: DistanceBasis; station: DistanceBasis } {
  const proximity = proximityBasis(candidates);
  const station = stationBasis(candidates);
  const full = { ...context, proximity, station };
  const items = candidates.map((candidate) => ({
    candidate,
    score: scoreLodging(candidate, full),
  }));
  const compare: Record<LodgingSort, (a: RankedLodging, b: RankedLodging) => number> = {
    score: (a, b) => ascending(negate(a.score.total), negate(b.score.total)),
    location: (a, b) =>
      ascending(proximityValue(a.candidate, proximity), proximityValue(b.candidate, proximity)),
    transport: (a, b) =>
      ascending(stationValue(a.candidate, station), stationValue(b.candidate, station)),
    location_transport: (a, b) => ascending(negate(balance(a)), negate(balance(b))),
  };
  items.sort((a, b) => compare[sort](a, b) || byName(a, b));
  return { items, proximity, station };
}

const negate = (value: number | null) => (value === null ? null : -value);

/** Relación ubicación/transporte: media de ambos componentes. */
function balance(ranked: RankedLodging) {
  const location = componentScore(ranked, "proximity");
  const transport = componentScore(ranked, "transport");
  if (location === null || transport === null) return null;
  return (location + transport) / 2;
}
