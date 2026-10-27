import type { LatLng } from "@/domain/geo";
import type { RoutedRoute, RouteUnavailableReason, StreetMode } from "@/domain/route";
import type { Source } from "@/domain/source";
import { ProviderError, type ProviderInfo } from "../core/types";

export interface StreetRouteQuery {
  from: LatLng;
  to: LatLng;
  mode: StreetMode;
}

export interface MatrixQuery {
  origins: LatLng[];
  destinations: LatLng[];
  mode: StreetMode;
}

/** Matriz origen × destino en segundos y metros; `null` si no hay ruta entre ese par. */
export interface MatrixResult {
  durationsSeconds: (number | null)[][];
  distancesMeters: (number | null)[][];
  source: Source;
  isDemo: boolean;
  fromCache: boolean;
}

export interface RoutingProvider extends ProviderInfo {
  route(query: StreetRouteQuery): Promise<{ route: RoutedRoute; fromCache: boolean }>;
  matrix(query: MatrixQuery): Promise<MatrixResult>;
}

/**
 * El proveedor respondió, pero no hay ruta (o la demo no la tiene grabada). No es una caída:
 * la UI lo explica con su motivo y ofrece enlaces externos.
 */
export class RouteNotFoundError extends ProviderError {
  constructor(
    message: string,
    providerId: string,
    readonly reason: Exclude<RouteUnavailableReason, "provider_failed">,
  ) {
    super(message, providerId);
    this.name = "RouteNotFoundError";
  }
}

/** Máximo de coordenadas por matriz (límite habitual de OSRM `table`; ORS admite 3500 rutas). */
export const MAX_MATRIX_POINTS = 100;

/** Coordenadas redondeadas (~1 m) para claves de caché y para casar con los fixtures demo. */
export const pointKey = ({ lat, lng }: LatLng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

/** Segundos → minutos con un decimal (la UI redondea al mostrar). */
export const toMinutes = (seconds: number) => Math.round(seconds / 6) / 10;

/**
 * Coordenadas únicas de una matriz y la posición de cada origen y destino en ellas: una matriz
 * "todos con todos" envía cada punto una sola vez.
 */
export function matrixLocations({
  origins,
  destinations,
}: Pick<MatrixQuery, "origins" | "destinations">) {
  const unique: LatLng[] = [];
  const positions = new Map<string, number>();
  const indexOf = (point: LatLng) => {
    const key = pointKey(point);
    let index = positions.get(key);
    if (index === undefined) {
      index = unique.push(point) - 1;
      positions.set(key, index);
    }
    return index;
  };
  const sources = origins.map(indexOf);
  const targets = destinations.map(indexOf);
  return { locations: unique, sources, destinations: targets };
}
