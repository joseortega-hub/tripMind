import { z } from "zod";
import { GeocodeResultSchema } from "@/domain/geocoding";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import type { FetchLike } from "../core/http";
import { normalizeText } from "../core/osm";
import type { RateLimiter } from "../core/rate-limit";
import { nominatimSearch } from "./nominatim";
import { PHOTON_NAME, photonSearch } from "./photon";
import type { GeocodeQuery, GeocodingProvider } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const ResultsSchema = z.array(GeocodeResultSchema);

export interface RealGeocodingDeps {
  userAgent: string;
  cache: CacheStore;
  fetch?: FetchLike;
  nominatimLimiter?: RateLimiter;
}

/** Clave independiente de mayúsculas/tildes y con el sesgo redondeado (~1 km). */
const queryKey = ({ q, limit, near }: GeocodeQuery) => [
  normalizeText(q),
  limit,
  near ? [near.lat.toFixed(2), near.lng.toFixed(2)] : null,
];

export function createRealGeocodingProvider(deps: RealGeocodingDeps): GeocodingProvider {
  const http = { userAgent: deps.userAgent, fetch: deps.fetch };

  const photon = (query: GeocodeQuery) =>
    cached(
      deps.cache,
      {
        key: cacheKey("photon", ...queryKey(query)),
        provider: "photon",
        ttlMs: 7 * DAY,
        schema: ResultsSchema,
      },
      () => photonSearch(query, http),
    );

  const nominatim = (query: GeocodeQuery) =>
    cached(
      deps.cache,
      {
        key: cacheKey("nominatim", ...queryKey({ ...query, near: undefined })),
        provider: "nominatim",
        ttlMs: 30 * DAY,
        schema: ResultsSchema,
      },
      () => nominatimSearch(query, { ...http, limiter: deps.nominatimLimiter }),
    );

  return {
    id: "photon",
    name: PHOTON_NAME,
    isDemo: false,

    async autocomplete(query) {
      const { value, fromCache } = await photon(query);
      return { results: value, providerId: "photon", fromCache };
    },

    async search(query) {
      let photonError: unknown;
      try {
        const { value, fromCache } = await photon(query);
        if (value.length > 0) return { results: value, providerId: "photon", fromCache };
      } catch (error) {
        photonError = error;
      }
      // Respaldo: Nominatim (permitido para búsquedas completas, no para autocompletado).
      try {
        const { value, fromCache } = await nominatim(query);
        return { results: value, providerId: "nominatim", fromCache };
      } catch (error) {
        throw photonError ?? error;
      }
    },
  };
}
