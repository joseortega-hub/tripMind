import { z } from "zod";
import { bboxArea, bboxContains } from "@/domain/geo";
import { PlaceSchema } from "@/domain/place";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import type { FetchLike } from "../core/http";
import { ProviderInputError } from "../core/types";
import { OVERPASS_NAME, overpassSearch, snapBBox } from "./overpass";
import { MAX_BBOX_AREA, type PlacesProvider, type PlacesQuery } from "./types";
import { applyEnrichment, EnrichmentSchema, fetchEnrichment } from "./wikidata";

const HOUR = 60 * 60 * 1000;
const PlacesSchema = z.array(PlaceSchema);

export const ENRICHMENT_WARNING =
  "No se pudieron cargar fotos y webs oficiales de Wikidata/Wikimedia Commons.";

export interface RealPlacesDeps {
  userAgent: string;
  cache: CacheStore;
  fetch?: FetchLike;
}

export function assertBBoxSize(query: PlacesQuery) {
  if (bboxArea(query.bbox) > MAX_BBOX_AREA) {
    throw new ProviderInputError(
      "La zona es demasiado grande: acerca el mapa para buscar lugares.",
    );
  }
}

export function createRealPlacesProvider(deps: RealPlacesDeps): PlacesProvider {
  const http = { userAgent: deps.userAgent, fetch: deps.fetch };

  return {
    id: "overpass",
    name: OVERPASS_NAME,
    isDemo: false,

    async searchByBBox(query) {
      assertBBoxSize(query);
      const bbox = snapBBox(query.bbox);
      const categories = [...query.categories].sort();
      const { value, fromCache } = await cached(
        deps.cache,
        {
          key: cacheKey("overpass", bbox, categories, query.limit),
          provider: "overpass",
          ttlMs: 24 * HOUR,
          schema: PlacesSchema,
        },
        () => overpassSearch({ bbox, categories, limit: query.limit }, http),
      );
      // Un elemento puede entrar por un filtro y clasificarse en otra categoría (museo con
      // amenity=restaurant): se filtra también por categoría.
      const places = value.filter(
        (place) =>
          query.categories.includes(place.category) && bboxContains(query.bbox, place.location),
      );

      const wikidataIds = [
        ...new Set(places.flatMap((p) => (p.wikidataId ? [p.wikidataId] : []))),
      ].sort();
      if (wikidataIds.length === 0) return { places, fromCache, warnings: [] };

      // El enriquecimiento es opcional: si falla se devuelven los lugares de OSM con un aviso.
      try {
        const enrichment = await cached(
          deps.cache,
          {
            key: cacheKey("wikidata", wikidataIds),
            provider: "wikidata",
            ttlMs: 7 * 24 * HOUR,
            schema: EnrichmentSchema,
          },
          () => fetchEnrichment(wikidataIds, http),
        );
        return { places: applyEnrichment(places, enrichment.value), fromCache, warnings: [] };
      } catch (error) {
        console.warn("[places] enriquecimiento Wikidata fallido", error);
        return { places, fromCache, warnings: [ENRICHMENT_WARNING] };
      }
    },
  };
}
