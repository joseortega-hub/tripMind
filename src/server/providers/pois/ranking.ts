import type { MapLayer, Place } from "@/domain/place";

/** Más peso a lo turístico: es lo que alimenta el itinerario; luego alojamiento y comida. */
const LAYER_SCORE: Record<MapLayer, number> = { tourism: 4, lodging: 1, food: 0, transport: 0 };

/**
 * Relevancia de un lugar según señales de la propia fuente (no es una valoración): tener
 * entidad de Wikidata o artículo de Wikipedia, imagen y web oficial.
 */
export function relevanceScore(place: Place): number {
  return (
    LAYER_SCORE[place.layer] +
    (place.wikidataId ? 4 : 0) +
    (place.wikipedia ? 2 : 0) +
    (place.image ? 1 : 0) +
    (place.websiteSource === "wikidata" ? 1 : 0) +
    (place.website ? 1 : 0)
  );
}

/**
 * Ordena por relevancia (estable: a igual puntuación se conserva el orden de la fuente) y recorta
 * a `limit`, para que un recorte nunca deje fuera los imprescindibles (p. ej. el Museo del Prado).
 */
export function rankPlaces(places: readonly Place[], limit: number): Place[] {
  return places
    .map((place, index) => ({ place, index, score: relevanceScore(place) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ place }) => place);
}
