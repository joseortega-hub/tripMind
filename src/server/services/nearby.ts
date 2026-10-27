import type { BBox, LatLng } from "@/domain/geo";
import { categoriesForLayers, type Place, type PlaceCategory } from "@/domain/place";
import { straightLineMeters, type TravelMatrix } from "@/domain/route";
import { providerMeta } from "@/server/api/responses";
import type { ProviderSelection } from "@/server/providers/core/registry";
import type { ProviderInfo } from "@/server/providers/core/types";
import { getPlacesProvider, type PlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider, type RoutingProvider } from "@/server/providers/routing";
import { MAX_MATRIX_POINTS } from "@/server/providers/routing/types";
import { travelMatrix } from "./routes";

/** Radio de búsqueda de estaciones y paradas (~10 minutos andando). */
export const NEARBY_RADIUS_METERS = 800;

/** Cuántas estaciones o paradas de cada tipo se miden a pie (las más cercanas en línea recta). */
const PER_CATEGORY: Partial<Record<PlaceCategory, number>> = {
  metro_station: 3,
  train_station: 2,
  tram_stop: 2,
  bus_station: 1,
  bus_stop: 3,
};

/** Rectángulo que contiene el círculo de `radius` metros alrededor de un punto. */
export function bboxAround({ lat, lng }: LatLng, radius: number): BBox {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

export interface WalkTime {
  durationMinutes: number;
  distanceMeters?: number;
}

export interface NearbyStop {
  place: Place;
  straightLineMeters: number;
  /** Tiempo a pie calculado por el proveedor de rutas; sin él, solo la línea recta. */
  walk?: WalkTime;
}

function walkTimes(matrix: TravelMatrix, count: number): (WalkTime | undefined)[] {
  return Array.from({ length: count }, (_, index) => {
    const seconds = matrix.durationsSeconds?.[0]?.[index];
    if (seconds === null || seconds === undefined) return undefined;
    const meters = matrix.distancesMeters?.[0]?.[index];
    return {
      durationMinutes: Math.round(seconds / 6) / 10,
      distanceMeters: meters === null || meters === undefined ? undefined : Math.round(meters),
    };
  });
}

/**
 * "¿Hay metro cerca?": estaciones y paradas de OSM en ~800 m, con el tiempo a pie real hasta las
 * más cercanas de cada tipo. Las estaciones y las paradas de autobús se miden por separado para
 * que un fallo en unas no deje sin tiempos a las otras.
 */
export async function nearbyStops(
  origin: LatLng,
  services: {
    places: ProviderSelection<PlacesProvider>;
    routing: ProviderSelection<RoutingProvider>;
  } = { places: getPlacesProvider(), routing: getRoutingProvider() },
) {
  const response = await services.places.provider.searchByBBox({
    bbox: bboxAround(origin, NEARBY_RADIUS_METERS),
    categories: categoriesForLayers(["transport"]),
    limit: 300,
  });
  const candidates = response.places
    .map((place) => ({ place, straightLineMeters: straightLineMeters(origin, place.location) }))
    .filter((item) => item.straightLineMeters <= NEARBY_RADIUS_METERS)
    .sort((a, b) => a.straightLineMeters - b.straightLineMeters);

  const picked = new Map<PlaceCategory, typeof candidates>();
  for (const item of candidates) {
    const list = picked.get(item.place.category) ?? [];
    if (list.length < (PER_CATEGORY[item.place.category] ?? 0)) list.push(item);
    picked.set(item.place.category, list);
  }
  const stations = [...picked.entries()]
    .filter(([category]) => category !== "bus_stop")
    .flatMap(([, list]) => list);
  const busStops = picked.get("bus_stop") ?? [];

  const groups = await Promise.all(
    [stations, busStops].map(async (group) => {
      if (group.length === 0) return { stops: [] as NearbyStop[], matrix: undefined };
      const matrix = await travelMatrix(
        {
          origins: [origin],
          destinations: group.slice(0, MAX_MATRIX_POINTS - 1).map((item) => item.place.location),
          mode: "walk",
        },
        services.routing,
      );
      const times = walkTimes(matrix, group.length);
      return {
        stops: group.map((item, index) => ({
          place: item.place,
          straightLineMeters: Math.round(item.straightLineMeters),
          walk: times[index],
        })),
        matrix,
      };
    }),
  );

  const stops = groups
    .flatMap((group) => group.stops)
    .sort(
      (a, b) =>
        (a.walk?.durationMinutes ?? Infinity) - (b.walk?.durationMinutes ?? Infinity) ||
        a.straightLineMeters - b.straightLineMeters,
    );
  const matrices = groups.flatMap((group) => (group.matrix ? [group.matrix] : []));
  const routed = matrices.find((matrix) => matrix.quality === "routed");
  const unavailable = matrices.find((matrix) => matrix.quality === "unavailable");

  return {
    radiusMeters: NEARBY_RADIUS_METERS,
    stops,
    walkSource: routed?.source,
    walkIsDemo: routed?.isDemo,
    /** Aviso si algún grupo no tiene tiempos a pie (se muestra solo la línea recta). */
    walkNotice: unavailable?.message,
    warnings: response.warnings,
    providers: {
      places: providerMeta(services.places as ProviderSelection<ProviderInfo>),
      routing: providerMeta(services.routing as ProviderSelection<ProviderInfo>),
    },
  };
}

/** Velocidad máxima para el filtro previo (m/min): ninguna ruta a pie es más corta que la recta. */
const PREFILTER_SPEED = 100;

/**
 * "¿Qué puedo hacer a pie?": de los destinos dados, los que están a ≤ `maxMinutes` andando según
 * el proveedor de rutas. Si no hay tiempos reales no se devuelve ninguno (no se adivina).
 */
export async function walkableFrom(
  input: { origin: LatLng; maxMinutes: number; targets: { id: string; location: LatLng }[] },
  routing: ProviderSelection<RoutingProvider> = getRoutingProvider(),
) {
  const maxMeters = input.maxMinutes * PREFILTER_SPEED;
  const candidates = input.targets
    .map((target) => ({ ...target, straight: straightLineMeters(input.origin, target.location) }))
    .filter((target) => target.straight <= maxMeters)
    .sort((a, b) => a.straight - b.straight)
    .slice(0, MAX_MATRIX_POINTS - 1);

  const base = {
    maxMinutes: input.maxMinutes,
    provider: providerMeta(routing as ProviderSelection<ProviderInfo>),
  };
  if (candidates.length === 0) {
    return { ...base, quality: "routed" as const, results: [] };
  }
  const matrix = await travelMatrix(
    {
      origins: [input.origin],
      destinations: candidates.map((target) => target.location),
      mode: "walk",
    },
    routing,
  );
  if (matrix.quality === "unavailable") {
    return { ...base, quality: "unavailable" as const, message: matrix.message, results: [] };
  }
  const times = walkTimes(matrix, candidates.length);
  const results = candidates
    .flatMap((target, index) => {
      const walk = times[index];
      return walk && walk.durationMinutes <= input.maxMinutes ? [{ id: target.id, ...walk }] : [];
    })
    .sort((a, b) => a.durationMinutes - b.durationMinutes);
  return {
    ...base,
    quality: "routed" as const,
    results,
    source: matrix.source,
    isDemo: matrix.isDemo,
  };
}
