import { z } from "zod";
import type { LatLng } from "@/domain/geo";
import type { RoutedRoute, StreetMode } from "@/domain/route";
import type { Source } from "@/domain/source";
import { fetchJson, parseProviderResponse, type FetchLike } from "../core/http";
import { OSM_ATTRIBUTION, OSM_LICENSE } from "../core/osm";
import { RateLimiter } from "../core/rate-limit";
import { externalRouteLinks } from "./links";
import {
  matrixLocations,
  type MatrixQuery,
  RouteNotFoundError,
  type StreetRouteQuery,
  toMinutes,
} from "./types";

/**
 * Servidores OSRM de FOSSGIS (los que usa openstreetmap.org), con un perfil real por modo.
 * El servidor demo de project-osrm.org solo tiene perfil de coche aunque acepte "foot".
 */
export const OSRM_BASE: Record<StreetMode, string> = {
  walk: "https://routing.openstreetmap.de/routed-foot",
  car: "https://routing.openstreetmap.de/routed-car",
};
export const OSRM_NAME = "OSRM (FOSSGIS, routing.openstreetmap.de)";

export function osrmSource(retrievedAt: string): Source {
  return {
    name: OSRM_NAME,
    url: "https://routing.openstreetmap.de/about.html",
    retrievedAt,
    license: OSM_LICENSE,
    attribution: `Rutas: FOSSGIS OSRM · ${OSM_ATTRIBUTION}`,
  };
}

/** Política de FOSSGIS: como máximo una petición por segundo. */
const limiter = new RateLimiter(1_000);

const lngLat = ({ lat, lng }: LatLng) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

export function osrmRouteUrl({ from, to, mode }: StreetRouteQuery) {
  return `${OSRM_BASE[mode]}/route/v1/driving/${lngLat(from)};${lngLat(to)}?overview=full&geometries=geojson&steps=false`;
}

export function osrmTableUrl(query: MatrixQuery) {
  const { locations, sources, destinations } = matrixLocations(query);
  return `${OSRM_BASE[query.mode]}/table/v1/driving/${locations.map(lngLat).join(";")}?sources=${sources.join(";")}&destinations=${destinations.join(";")}&annotations=duration,distance`;
}

export const OsrmRouteResponseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        duration: z.number(),
        distance: z.number(),
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }),
      }),
    )
    .optional(),
});

export const OsrmTableResponseSchema = z.object({
  code: z.string(),
  durations: z.array(z.array(z.number().nullable())).optional(),
  distances: z.array(z.array(z.number().nullable())).optional(),
});

interface MapMeta {
  retrievedAt: string;
  isDemo: boolean;
}

export function mapOsrmRoute(
  raw: z.infer<typeof OsrmRouteResponseSchema>,
  query: StreetRouteQuery,
  meta: MapMeta,
): RoutedRoute {
  const route = raw.routes?.[0];
  if (raw.code !== "Ok" || !route || route.geometry.coordinates.length < 2) {
    throw new RouteNotFoundError("OSRM no encontró ruta entre los dos puntos", "osrm", "no_route");
  }
  return {
    quality: "routed",
    mode: query.mode,
    from: query.from,
    to: query.to,
    durationMinutes: toMinutes(route.duration),
    distanceMeters: Math.round(route.distance),
    geometry: route.geometry.coordinates,
    externalLinks: externalRouteLinks(query.from, query.to, query.mode),
    source: osrmSource(meta.retrievedAt),
    isDemo: meta.isDemo,
  };
}

export function mapOsrmTable(raw: z.infer<typeof OsrmTableResponseSchema>) {
  if (raw.code !== "Ok" || !raw.durations) {
    throw new RouteNotFoundError("OSRM no devolvió la matriz", "osrm", "no_route");
  }
  return {
    durationsSeconds: raw.durations,
    distancesMeters: raw.distances ?? raw.durations.map((row) => row.map(() => null)),
  };
}

export interface OsrmDeps {
  userAgent: string;
  fetch?: FetchLike;
}

export async function osrmRoute(query: StreetRouteQuery, deps: OsrmDeps) {
  const raw = await limiter.schedule(() =>
    fetchJson(osrmRouteUrl(query), { providerId: "osrm", ...deps }),
  );
  return mapOsrmRoute(parseProviderResponse(OsrmRouteResponseSchema, raw, "osrm"), query, {
    retrievedAt: new Date().toISOString(),
    isDemo: false,
  });
}

export async function osrmTable(query: MatrixQuery, deps: OsrmDeps) {
  const raw = await limiter.schedule(() =>
    fetchJson(osrmTableUrl(query), { providerId: "osrm", timeoutMs: 30_000, ...deps }),
  );
  return mapOsrmTable(parseProviderResponse(OsrmTableResponseSchema, raw, "osrm"));
}
