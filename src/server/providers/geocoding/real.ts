import { z } from "zod";
import { GeocodeResultSchema } from "@/domain/geocoding";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import type { FetchLike } from "../core/http";
import { normalizeText } from "../core/osm";
import type { RateLimiter } from "../core/rate-limit";
import { geoapifyAutocomplete, GEOAPIFY_NAME } from "./geoapify";
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
  /** Con clave, el autocompletado usa Geoapify (nombres en español); si no, Photon. */
  geoapifyApiKey?: string;
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
        // "v2-en": cambia la clave para no servir respuestas antiguas sin idioma ni orden.
        key: cacheKey("photon", "v2-en", ...queryKey(query)),
        provider: "photon",
        ttlMs: 7 * DAY,
        schema: ResultsSchema,
      },
      () => photonSearch(query, http),
    );

  const geoapifyApiKey = deps.geoapifyApiKey;
  const geoapify = (query: GeocodeQuery, apiKey: string) =>
    cached(
      deps.cache,
      {
        key: cacheKey("geoapify", "es", ...queryKey(query)),
        provider: "geoapify",
        ttlMs: 7 * DAY,
        schema: ResultsSchema,
      },
      () => geoapifyAutocomplete(query, { ...http, apiKey }),
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
    id: geoapifyApiKey ? "geoapify" : "photon",
    name: geoapifyApiKey ? GEOAPIFY_NAME : PHOTON_NAME,
    isDemo: false,

    async autocomplete(query) {
      if (geoapifyApiKey) {
        try {
          const { value, fromCache } = await geoapify(query, geoapifyApiKey);
          return { results: value, providerId: "geoapify", fromCache };
        } catch {
          // Clave inválida, créditos agotados o caída: seguimos con Photon.
        }
      }
      const { value, fromCache } = await photon(query);
      return { results: value, providerId: "photon", fromCache };
    },

    async search(query) {
      // Búsqueda explícita (al pulsar "Buscar"): primero Nominatim, que entiende y devuelve
      // nombres en español (Varsovia → Polonia); el Photon público no admite español.
      // Nominatim está permitido para búsquedas completas, no para autocompletado.
      let nominatimError: unknown;
      try {
        const { value, fromCache } = await nominatim(query);
        if (value.length > 0) return { results: value, providerId: "nominatim", fromCache };
      } catch (error) {
        nominatimError = error;
      }
      try {
        const { value, fromCache } = await photon(query);
        return { results: value, providerId: "photon", fromCache };
      } catch (error) {
        throw nominatimError ?? error;
      }
    },
  };
}
