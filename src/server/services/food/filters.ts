import type { FoodDiet, FoodQuery } from "@/domain/food";
import type { DietValue, Place } from "@/domain/place";

/**
 * Valores de `cuisine` de OSM que cuentan como cocina local por país (filtro "tradicional").
 * "regional" cuenta en todas partes. Solo se usa la etiqueta de la fuente: un sitio sin `cuisine`
 * nunca es "local".
 */
const LOCAL_CUISINES: Record<string, readonly string[]> = {
  ES: [
    "spanish",
    "tapas",
    "andalusian",
    "asturian",
    "basque",
    "catalan",
    "galician",
    "valencian",
    "paella",
    "churros",
  ],
  FR: ["french", "crepe", "brasserie"],
  IT: ["italian", "pizza", "pasta"],
  PT: ["portuguese"],
  GR: ["greek"],
  DE: ["german"],
  AT: ["austrian"],
  GB: ["british", "fish_and_chips"],
  IE: ["irish"],
  MX: ["mexican"],
  JP: ["japanese", "sushi", "ramen"],
};

export const cuisinesOf = (place: Place) =>
  (place.cuisine ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);

export function isLocalCuisine(place: Place, countryCode: string | undefined) {
  const local = new Set(["regional", ...(LOCAL_CUISINES[countryCode?.toUpperCase() ?? ""] ?? [])]);
  return cuisinesOf(place).some((value) => local.has(value));
}

/** Comida rápida: categoría de OSM o `takeaway=only`. */
export const isQuick = (place: Place) =>
  place.category === "fast_food" ||
  place.category === "food_court" ||
  place.food?.takeaway === "only";

const offers = (value: DietValue | undefined) =>
  value === "yes" || value === "only" || value === "limited";

/** Vegetariano: `diet:vegetarian` (o `diet:vegan`, que también lo es) yes/only/limited. */
export function matchesDiet(place: Place, diet: FoodDiet) {
  if (diet === "vegan") return offers(place.food?.vegan);
  return offers(place.food?.vegetarian) || offers(place.food?.vegan);
}

/** Filtros que no dependen de la distancia (la de tiempo se aplica al ordenar). */
export function matchesFoodFilters(
  place: Place,
  query: Pick<FoodQuery, "cuisine" | "diet" | "terrace" | "style">,
  countryCode: string | undefined,
) {
  if (query.cuisine && !cuisinesOf(place).includes(query.cuisine)) return false;
  if (query.diet && !matchesDiet(place, query.diet)) return false;
  if (query.terrace && place.food?.outdoorSeating !== true) return false;
  if (query.style === "local" && !isLocalCuisine(place, countryCode)) return false;
  if (query.style === "quick" && !isQuick(place)) return false;
  return true;
}

/** Cocinas presentes (etiqueta OSM) con su número de sitios, de más a menos frecuente. */
export function cuisineFacets(places: readonly Place[]) {
  const counts = new Map<string, number>();
  for (const place of places) {
    for (const value of new Set(cuisinesOf(place))) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
