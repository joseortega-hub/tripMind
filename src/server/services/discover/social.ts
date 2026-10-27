import type { Place } from "@/domain/place";
import { normalizeText } from "@/server/providers/core/osm";

const compact = (value: string) => normalizeText(value).replace(/[^\p{L}\p{N}]/gu, "");
/** Palabras genéricas que por sí solas no identifican un lugar. */
const GENERIC = new Set(["madrid", "museo", "parque", "plaza", "iglesia", "mercado", "jardin"]);

/**
 * Lugares del destino cuyo nombre aparece en el texto del vídeo (título o descripción del oEmbed),
 * también dentro de hashtags sin espacios ("#templodedebod"). Son solo candidatos: el usuario
 * confirma cuál es antes de guardarlo (REQUISITOS §18).
 */
export function detectPlaces(text: string, places: readonly Place[], limit = 5): Place[] {
  const plain = ` ${normalizeText(text).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const tight = compact(text);
  if (!tight) return [];
  const found = new Map<string, { place: Place; weight: number }>();
  for (const place of places) {
    const name = normalizeText(place.name)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    const key = compact(place.name);
    if (key.length < 5 || GENERIC.has(name)) continue;
    const inWords = plain.includes(` ${name} `);
    const inTags = key.length >= 7 && tight.includes(key);
    if (!inWords && !inTags) continue;
    const weight = key.length + (place.wikidataId ? 3 : 0) + (place.layer === "tourism" ? 2 : 0);
    const previous = found.get(key);
    if (!previous || previous.weight < weight) found.set(key, { place, weight });
  }
  return [...found.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(({ place }) => place);
}
