import type { Place, PlaceCategory } from "@/domain/place";
import { type Interest, type Pace, type Preferences, toMinutes } from "@/domain/preferences";

/** Categorías que el optimizador programa como visita. Teatros: sin cartelera, llegan con eventos. */
export const VISIT_CATEGORIES = [
  "museum",
  "gallery",
  "monument",
  "attraction",
  "viewpoint",
  "park",
  "place_of_worship",
] as const satisfies readonly PlaceCategory[];
export type VisitCategory = (typeof VISIT_CATEGORIES)[number];

export const isVisitCategory = (category: PlaceCategory): category is VisitCategory =>
  (VISIT_CATEGORIES as readonly PlaceCategory[]).includes(category);

/** Afinidad de cada categoría con los intereses del asistente (los demás llegan en otras fases). */
const CATEGORY_INTERESTS: Record<VisitCategory, Interest[]> = {
  museum: ["museums", "monuments_history", "family"],
  gallery: ["museums", "original_experiences", "hidden_gems"],
  monument: ["monuments_history", "architecture", "photography"],
  attraction: [
    "monuments_history",
    "architecture",
    "photography",
    "family",
    "original_experiences",
  ],
  viewpoint: ["photography", "nature", "free"],
  park: ["nature", "family", "free", "photography"],
  place_of_worship: ["monuments_history", "architecture"],
};

/** Intereses con lugares visitables en esta fase. */
export const PLANNABLE_INTERESTS = [...new Set(Object.values(CATEGORY_INTERESTS).flat())];

/** Señales de la fuente; un horario publicado permite confirmar la visita y suma un poco. */
const prominence = (place: Place) =>
  (place.wikidataId ? 1.5 : 0) +
  (place.wikipedia ? 1 : 0) +
  (place.image ? 0.5 : 0) +
  (place.openingHours ? 0.5 : 0);

/**
 * Puntuación de un lugar para el viaje: afinidad con los intereses (peso 1–3; el mejor cuenta
 * entero y el resto a la mitad) más señales de relevancia de la propia fuente. Sin intereses
 * aplicables todas las categorías valen 1. "Lugares poco conocidos" premia lo que no tiene
 * artículo en Wikipedia.
 */
export function placeScore(place: Place, preferences: Preferences, anyApplicable: boolean) {
  if (!isVisitCategory(place.category)) return 0;
  const weights = CATEGORY_INTERESTS[place.category]
    .map((interest) => preferences.interests[interest] ?? 0)
    .filter((weight) => weight > 0)
    .sort((a, b) => b - a);
  let affinity = anyApplicable
    ? (weights[0] ?? 0) + weights.slice(1).reduce((sum, w) => sum + w / 2, 0)
    : 1;
  if (affinity === 0) return 0;
  const hidden = preferences.interests.hidden_gems ?? 0;
  if (hidden > 0 && !place.wikipedia) affinity += hidden;
  return affinity + (hidden > 0 ? 0 : prominence(place));
}

export const hasApplicableInterests = (preferences: Preferences) =>
  PLANNABLE_INTERESTS.some((interest) => (preferences.interests[interest] ?? 0) > 0);

/** Duración base por categoría (minutos). Es una estimación de TripMind, no un dato de la fuente. */
const BASE_DURATION: Record<VisitCategory, number> = {
  museum: 90,
  gallery: 45,
  monument: 20,
  attraction: 30,
  viewpoint: 20,
  park: 45,
  place_of_worship: 30,
};

export interface PaceProfile {
  maxVisitsPerDay: number;
  /** Margen entre actividades (minutos). */
  slackMinutes: number;
  durationFactor: number;
}

export const PACE_PROFILES: Record<Pace["level"], PaceProfile> = {
  relaxed: { maxVisitsPerDay: 3, slackMinutes: 15, durationFactor: 1.15 },
  balanced: { maxVisitsPerDay: 5, slackMinutes: 10, durationFactor: 1 },
  intensive: { maxVisitsPerDay: 7, slackMinutes: 5, durationFactor: 0.85 },
};

const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);

/** Duración estimada de una visita: los lugares destacados (Wikidata + Wikipedia) llevan más. */
export function estimatedDuration(place: Place, pace: Pace): number {
  const category = isVisitCategory(place.category) ? place.category : "attraction";
  const major = place.wikidataId && place.wikipedia;
  const base =
    BASE_DURATION[category] +
    (major ? (category === "museum" ? 60 : category === "park" ? 30 : 10) : 0);
  return roundTo5(base * PACE_PROFILES[pace.level].durationFactor);
}

/** Bloque sin lugar (comidas y tiempo libre) con ventana de inicio [earliest, latest]. */
export interface BlockTemplate {
  kind: "meal" | "free_time";
  slot: "breakfast" | "lunch" | "dinner" | "afternoon";
  title: string;
  duration: number;
  earliest: number;
  latest: number;
}

/**
 * Franjas reservadas del día (los restaurantes concretos llegan en la Fase 7). Horas típicas de
 * comida y cena editables; solo se incluyen las que caben entre la hora de inicio y la de fin.
 */
export function dayBlocks(pace: Pace): BlockTemplate[] {
  const start = toMinutes(pace.dayStart);
  const end = toMinutes(pace.dayEnd);
  const blocks: BlockTemplate[] = [];
  const add = (block: BlockTemplate) => {
    const earliest = Math.max(block.earliest, start);
    const latest = Math.min(block.latest, end - block.duration);
    if (block.duration > 0 && earliest <= latest) blocks.push({ ...block, earliest, latest });
  };
  if (start <= 10 * 60) {
    add({
      kind: "meal",
      slot: "breakfast",
      title: "Desayuno",
      duration: 30,
      earliest: start,
      latest: 10 * 60 + 30,
    });
  }
  add({
    kind: "meal",
    slot: "lunch",
    title: "Comida",
    duration: pace.lunchMinutes,
    earliest: 13 * 60,
    latest: 15 * 60,
  });
  if (pace.freeTimeMinutes > 0) {
    add({
      kind: "free_time",
      slot: "afternoon",
      title: "Tiempo libre",
      duration: pace.freeTimeMinutes,
      earliest: 16 * 60,
      latest: end,
    });
  }
  add({
    kind: "meal",
    slot: "dinner",
    title: "Cena",
    duration: 90,
    earliest: 20 * 60 + 30,
    latest: 22 * 60,
  });
  return blocks;
}
