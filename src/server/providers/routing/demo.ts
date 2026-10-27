import type { LatLng } from "@/domain/geo";
import type { StreetMode } from "@/domain/route";
import fixture from "./fixtures/routing.json";
import {
  mapOsrmRoute,
  mapOsrmTable,
  OsrmRouteResponseSchema,
  OsrmTableResponseSchema,
  osrmSource,
} from "./osrm";
import { assertMatrixSize } from "./real";
import { pointKey, RouteNotFoundError, type RoutingProvider } from "./types";

interface RecordedRoute {
  mode: StreetMode;
  from: LatLng;
  to: LatLng;
  response: unknown;
}

interface RecordedTable {
  mode: StreetMode;
  origins: LatLng[];
  destinations: LatLng[];
  response: unknown;
}

const recorded = fixture as unknown as {
  recordedAt: string;
  hotel: { id: string; name: string; location: LatLng };
  routes: RecordedRoute[];
  tables: RecordedTable[];
};

/** Hotel real (OSM) desde el que se grabaron los trayectos de demostración. */
export const DEMO_ROUTING_HOTEL = recorded.hotel;

export const DEMO_ROUTE_COVERAGE =
  `Los datos de demostración solo incluyen trayectos desde ${recorded.hotel.name} ` +
  "a los lugares turísticos de Madrid centro.";

let matrixPoints: Set<string> | undefined;

/** true si la demo tiene tiempos grabados para este punto (las matrices 71×71 de Madrid centro). */
export function isDemoMatrixPoint(point: LatLng) {
  matrixPoints ??= new Set(recorded.tables[0]?.origins.map(pointKey) ?? []);
  return matrixPoints.has(pointKey(point));
}

const routeKey = (mode: StreetMode, from: LatLng, to: LatLng) =>
  `${mode}|${pointKey(from)}|${pointKey(to)}`;

let routes: Map<string, RecordedRoute> | undefined;

export function createDemoRoutingProvider(): RoutingProvider {
  return {
    id: "demo-routing",
    name: "Demostración (respuestas grabadas de OSRM)",
    isDemo: true,

    async route(query) {
      routes ??= new Map(recorded.routes.map((r) => [routeKey(r.mode, r.from, r.to), r]));
      const hit = routes.get(routeKey(query.mode, query.from, query.to));
      if (!hit) throw new RouteNotFoundError(DEMO_ROUTE_COVERAGE, "demo-routing", "no_coverage");
      const route = mapOsrmRoute(OsrmRouteResponseSchema.parse(hit.response), query, {
        retrievedAt: recorded.recordedAt,
        isDemo: true,
      });
      return { route, fromCache: false };
    },

    async matrix(query) {
      assertMatrixSize(query);
      // Se busca una tabla grabada que contenga todos los orígenes y destinos pedidos.
      for (const table of recorded.tables) {
        if (table.mode !== query.mode) continue;
        const rows = indexes(table.origins, query.origins);
        const cols = indexes(table.destinations, query.destinations);
        if (!rows || !cols) continue;
        const full = mapOsrmTable(OsrmTableResponseSchema.parse(table.response));
        const pick = (matrix: (number | null)[][]) =>
          rows.map((row) => cols.map((col) => matrix[row]?.[col] ?? null));
        return {
          durationsSeconds: pick(full.durationsSeconds),
          distancesMeters: pick(full.distancesMeters),
          source: osrmSource(recorded.recordedAt),
          isDemo: true,
          fromCache: false,
        };
      }
      throw new RouteNotFoundError(DEMO_ROUTE_COVERAGE, "demo-routing", "no_coverage");
    },
  };
}

function indexes(recordedPoints: LatLng[], wanted: LatLng[]): number[] | undefined {
  const positions = new Map(recordedPoints.map((point, index) => [pointKey(point), index]));
  const result: number[] = [];
  for (const point of wanted) {
    const index = positions.get(pointKey(point));
    if (index === undefined) return undefined;
    result.push(index);
  }
  return result;
}
