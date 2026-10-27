import { z } from "zod";
import { RoutedRouteSchema } from "@/domain/route";
import { SourceSchema } from "@/domain/source";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import type { FetchLike } from "../core/http";
import { ProviderInputError } from "../core/types";
import { ORS_NAME, orsDirections, orsMatrix, orsSource } from "./ors";
import { OSRM_NAME, osrmRoute, osrmSource, osrmTable } from "./osrm";
import {
  MAX_MATRIX_POINTS,
  matrixLocations,
  type MatrixQuery,
  pointKey,
  type RoutingProvider,
} from "./types";

const DAY = 24 * 60 * 60 * 1000;
/** Las calles cambian poco: rutas y matrices se guardan una semana. */
const TTL = 7 * DAY;

const MatrixCacheSchema = z.object({
  durationsSeconds: z.array(z.array(z.number().nullable())),
  distancesMeters: z.array(z.array(z.number().nullable())),
  source: SourceSchema,
});

export interface RealRoutingDeps {
  userAgent: string;
  cache: CacheStore;
  /** Con clave se usa OpenRouteService; sin ella, OSRM de FOSSGIS. */
  orsApiKey?: string;
  fetch?: FetchLike;
}

export function assertMatrixSize(query: MatrixQuery) {
  if (query.origins.length === 0 || query.destinations.length === 0) {
    throw new ProviderInputError("La matriz necesita al menos un origen y un destino.");
  }
  if (matrixLocations(query).locations.length > MAX_MATRIX_POINTS) {
    throw new ProviderInputError(`La matriz admite como máximo ${MAX_MATRIX_POINTS} puntos.`);
  }
}

export function createRealRoutingProvider(deps: RealRoutingDeps): RoutingProvider {
  const http = { userAgent: deps.userAgent, fetch: deps.fetch };
  const apiKey = deps.orsApiKey;
  const id = apiKey ? "openrouteservice" : "osrm";

  return {
    id,
    name: apiKey ? ORS_NAME : OSRM_NAME,
    isDemo: false,

    async route(query) {
      const { value, fromCache } = await cached(
        deps.cache,
        {
          key: cacheKey(id, "route", query.mode, pointKey(query.from), pointKey(query.to)),
          provider: id,
          ttlMs: TTL,
          schema: RoutedRouteSchema,
        },
        () => (apiKey ? orsDirections(query, { ...http, apiKey }) : osrmRoute(query, http)),
      );
      return { route: value, fromCache };
    },

    async matrix(query) {
      assertMatrixSize(query);
      const { value, fromCache } = await cached(
        deps.cache,
        {
          key: cacheKey(
            id,
            "matrix",
            query.mode,
            query.origins.map(pointKey),
            query.destinations.map(pointKey),
          ),
          provider: id,
          ttlMs: TTL,
          schema: MatrixCacheSchema,
        },
        async () => {
          const retrievedAt = new Date().toISOString();
          const matrix = apiKey
            ? await orsMatrix(query, { ...http, apiKey })
            : await osrmTable(query, http);
          return { ...matrix, source: apiKey ? orsSource(retrievedAt) : osrmSource(retrievedAt) };
        },
      );
      return { ...value, isDemo: false, fromCache };
    },
  };
}
