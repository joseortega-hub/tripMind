import { z } from "zod";
import type { LatLng } from "@/domain/geo";
import type { RoutedRoute, StreetMode } from "@/domain/route";
import type { Source } from "@/domain/source";
import { fetchJson, parseProviderResponse, type FetchLike } from "../core/http";
import { OSM_ATTRIBUTION, OSM_LICENSE } from "../core/osm";
import { externalRouteLinks } from "./links";
import {
  matrixLocations,
  type MatrixQuery,
  RouteNotFoundError,
  type StreetRouteQuery,
  toMinutes,
} from "./types";

export const ORS_URL = "https://api.openrouteservice.org";
export const ORS_NAME = "openrouteservice (HeiGIT)";

const PROFILES: Record<StreetMode, string> = { walk: "foot-walking", car: "driving-car" };

export function orsSource(retrievedAt: string): Source {
  return {
    name: ORS_NAME,
    url: "https://openrouteservice.org/",
    retrievedAt,
    license: OSM_LICENSE,
    attribution: `© openrouteservice.org by HeiGIT · ${OSM_ATTRIBUTION}`,
  };
}

const lngLat = ({ lat, lng }: LatLng): [number, number] => [lng, lat];

export const OrsDirectionsResponseSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }),
      properties: z.object({
        summary: z.object({ duration: z.number().optional(), distance: z.number().optional() }),
      }),
    }),
  ),
});

export const OrsMatrixResponseSchema = z.object({
  durations: z.array(z.array(z.number().nullable())),
  distances: z.array(z.array(z.number().nullable())).optional(),
});

export function mapOrsDirections(
  raw: z.infer<typeof OrsDirectionsResponseSchema>,
  query: StreetRouteQuery,
  meta: { retrievedAt: string; isDemo: boolean },
): RoutedRoute {
  const feature = raw.features[0];
  const coordinates = feature?.geometry.coordinates ?? [];
  if (!feature || coordinates.length < 2) {
    throw new RouteNotFoundError(
      "openrouteservice no encontró ruta",
      "openrouteservice",
      "no_route",
    );
  }
  const { duration = 0, distance = 0 } = feature.properties.summary;
  return {
    quality: "routed",
    mode: query.mode,
    from: query.from,
    to: query.to,
    durationMinutes: toMinutes(duration),
    distanceMeters: Math.round(distance),
    geometry: coordinates,
    externalLinks: externalRouteLinks(query.from, query.to, query.mode),
    source: orsSource(meta.retrievedAt),
    isDemo: meta.isDemo,
  };
}

export interface OrsDeps {
  apiKey: string;
  userAgent: string;
  fetch?: FetchLike;
}

const request = (deps: OrsDeps) => ({
  providerId: "openrouteservice",
  userAgent: deps.userAgent,
  fetch: deps.fetch,
  method: "POST" as const,
  // La clave viaja solo del servidor a ORS (cabecera), nunca al navegador.
  headers: { Authorization: deps.apiKey },
});

export async function orsDirections(query: StreetRouteQuery, deps: OrsDeps) {
  const raw = await fetchJson(`${ORS_URL}/v2/directions/${PROFILES[query.mode]}/geojson`, {
    ...request(deps),
    json: { coordinates: [lngLat(query.from), lngLat(query.to)] },
  });
  return mapOrsDirections(
    parseProviderResponse(OrsDirectionsResponseSchema, raw, "openrouteservice"),
    query,
    { retrievedAt: new Date().toISOString(), isDemo: false },
  );
}

export async function orsMatrix(query: MatrixQuery, deps: OrsDeps) {
  const { locations, sources, destinations } = matrixLocations(query);
  const raw = await fetchJson(`${ORS_URL}/v2/matrix/${PROFILES[query.mode]}`, {
    ...request(deps),
    timeoutMs: 30_000,
    json: {
      locations: locations.map(lngLat),
      sources,
      destinations,
      metrics: ["duration", "distance"],
    },
  });
  const parsed = parseProviderResponse(OrsMatrixResponseSchema, raw, "openrouteservice");
  return {
    durationsSeconds: parsed.durations,
    distancesMeters: parsed.distances ?? parsed.durations.map((row) => row.map(() => null)),
  };
}
