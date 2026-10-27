import type { LatLng } from "@/domain/geo";
import type { StreetMode } from "@/domain/route";
import fixture from "./fixtures/routing.json";
import lodgingFixture from "./fixtures/lodging.json";
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

/** Tablas grabadas desde los alojamientos de la demo (Fase 6): ida y vuelta a los lugares. */
const lodgingTables = (lodgingFixture as unknown as { tables: RecordedTable[] }).tables;

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
      // Cada celda se busca en todas las tablas grabadas (la de Hotel México y las de los
      // alojamientos de la demo); si falta alguna, la demo no cubre la consulta.
      cells ??= recordedCells();
      const durations: (number | null)[][] = [];
      const distances: (number | null)[][] = [];
      for (const origin of query.origins) {
        const durationRow: (number | null)[] = [];
        const distanceRow: (number | null)[] = [];
        for (const destination of query.destinations) {
          const same = pointKey(origin) === pointKey(destination);
          const hit = same ? ([0, 0] as const) : cells.get(cellKey(query.mode, origin, destination));
          if (!hit) throw new RouteNotFoundError(DEMO_ROUTE_COVERAGE, "demo-routing", "no_coverage");
          durationRow.push(hit[0]);
          distanceRow.push(hit[1]);
        }
        durations.push(durationRow);
        distances.push(distanceRow);
      }
      return {
        durationsSeconds: durations,
        distancesMeters: distances,
        source: osrmSource(recorded.recordedAt),
        isDemo: true,
        fromCache: false,
      };
    },
  };
}

const cellKey = (mode: StreetMode, from: LatLng, to: LatLng) =>
  `${mode}|${pointKey(from)}|${pointKey(to)}`;

let cells: Map<string, readonly [number | null, number | null]> | undefined;

function recordedCells() {
  const map = new Map<string, readonly [number | null, number | null]>();
  for (const table of [...recorded.tables, ...lodgingTables]) {
    const full = mapOsrmTable(OsrmTableResponseSchema.parse(table.response));
    table.origins.forEach((origin, row) => {
      table.destinations.forEach((destination, col) => {
        map.set(cellKey(table.mode, origin, destination), [
          full.durationsSeconds[row]?.[col] ?? null,
          full.distancesMeters[row]?.[col] ?? null,
        ]);
      });
    });
  }
  return map;
}
