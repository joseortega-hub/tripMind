import type { FoodComparison, FoodNear, FoodReference, FoodResult } from "@/domain/food";

/**
 * Minutos que se suman al tiempo a pie de un sitio con horario sin confirmar (sin horario, con
 * horario dudoso o ilegible) al ordenar: a igual distancia va antes el que confirma que abre.
 */
export const PENDING_PENALTY_MINUTES = 5;
/** Sin tiempo calculado, el límite de minutos se aplica a la línea recta a este ritmo prudente. */
export const STRAIGHT_METERS_PER_MINUTE = 60;
/** "Cerca" en la comparación de referencias. */
export const COMPARISON_MINUTES = 10;

export function withinMinutes(result: FoodResult, near: FoodNear, maxMinutes: number) {
  const distance = result.distances[near];
  if (!distance) return false;
  return distance.minutes !== undefined
    ? distance.minutes <= maxMinutes
    : distance.straightMeters <= maxMinutes * STRAIGHT_METERS_PER_MINUTE;
}

/**
 * Orden por cercanía a la referencia elegida: primero los que tienen tiempo a pie calculado
 * (tiempo + penalización si el horario está pendiente) y después, en línea recta, los que no.
 */
export function rankFood(
  results: readonly FoodResult[],
  near: FoodNear,
  maxMinutes?: number,
): FoodResult[] {
  const key = (result: FoodResult) => {
    const distance = result.distances[near];
    const pending = result.opening.status === "open" ? 0 : PENDING_PENALTY_MINUTES;
    if (distance?.minutes !== undefined) return [0, distance.minutes + pending] as const;
    return [1, distance?.straightMeters ?? Number.POSITIVE_INFINITY] as const;
  };
  return results
    .filter((result) => maxMinutes === undefined || withinMinutes(result, near, maxMinutes))
    .map((result) => ({ result, key: key(result) }))
    .sort(
      (a, b) =>
        a.key[0] - b.key[0] ||
        a.key[1] - b.key[1] ||
        a.result.place.name.localeCompare(b.result.place.name, "es"),
    )
    .map(({ result }) => result);
}

/** Para cada referencia, cuántos sitios quedan cerca y cuál es el más cercano. */
export function compareReferences(
  results: readonly FoodResult[],
  references: readonly FoodReference[],
  within = COMPARISON_MINUTES,
  measuredPerReference = Number.POSITIVE_INFINITY,
): FoodComparison[] {
  return references.map(({ key }) => {
    const ranked = rankFood(results, key);
    const best = ranked[0];
    const distance = best?.distances[key];
    const count = results.filter((result) => withinMinutes(result, key, within)).length;
    return {
      key,
      withinMinutes: within,
      count: Math.min(count, measuredPerReference),
      capped: count >= measuredPerReference,
      closest:
        best && distance
          ? {
              placeId: best.place.id,
              name: best.place.name,
              minutes: distance.minutes,
              straightMeters: distance.straightMeters,
            }
          : undefined,
    };
  });
}
