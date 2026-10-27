import { BBoxStringSchema, type LatLng } from "@/domain/geo";
import {
  LODGING_TYPE_OF,
  type LodgingCandidate,
  type LodgingFilters,
  type LodgingKeyPoint,
  type LodgingSearch,
  type LodgingTravelInfo,
  type PointDistance,
} from "@/domain/lodging";
import { categoriesForLayers, type Place, type PlaceCategory } from "@/domain/place";
import { straightLineMeters, type TravelMatrix } from "@/domain/route";
import type { Trip } from "@/domain/trip";
import { areaAround } from "@/lib/map/layers";
import type { ProviderSelection } from "@/server/providers/core/registry";
import { ProviderError } from "@/server/providers/core/types";
import { getLodgingPriceProvider, type LodgingPriceProvider } from "@/server/providers/lodging";
import { getPlacesProvider, type PlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider, type RoutingProvider } from "@/server/providers/routing";
import { MAX_MATRIX_POINTS } from "@/server/providers/routing/types";
import { VISIT_CATEGORIES } from "./itinerary/profile";
import { travelMatrix } from "./routes";

/** Alojamientos que se comparan con tiempos reales (los más cercanos en línea recta). */
export const MAX_COMPARED = 40;
/** Puntos clave del itinerario con los que se mide la ubicación. */
export const MAX_KEY_POINTS = 12;
/** Radio de búsqueda de la estación más cercana a cada alojamiento. */
export const STATION_RADIUS_METERS = 1500;
/** Estaciones (no paradas de autobús: hay cientos y no dicen tanto de la conexión). */
const STATION_CATEGORIES: PlaceCategory[] = [
  "metro_station",
  "train_station",
  "tram_stop",
  "bus_station",
];

export interface LodgingDeps {
  places: ProviderSelection<PlacesProvider>;
  routing: ProviderSelection<RoutingProvider>;
  prices: LodgingPriceProvider;
}

const defaultDeps = (): LodgingDeps => ({
  places: getPlacesProvider(),
  routing: getRoutingProvider(),
  prices: getLodgingPriceProvider(),
});

/** Sin alojamientos de OSM no hay comparador: el error recuerda dónde, para ofrecer el mapa. */
export class LodgingUnavailableError extends ProviderError {
  constructor(
    cause: ProviderError,
    readonly at: LatLng,
  ) {
    super(cause.message, cause.providerId);
    this.name = "LodgingUnavailableError";
  }
}

export function matchesFilters(place: Place, filters: LodgingFilters) {
  if (filters.types.length > 0) {
    const type = LODGING_TYPE_OF[place.category];
    if (!type || !filters.types.includes(type)) return false;
  }
  if (filters.minStars !== undefined && (place.stars ?? 0) < filters.minStars) return false;
  if (filters.accessibleOnly && place.wheelchair !== "yes") return false;
  return true;
}

/** Reparto uniforme: con muchas visitas se toman puntos de todos los días, no solo del primero. */
function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)]!);
}

/** Visitas del itinerario (sin repetir) o, si aún no hay plan, `undefined`. */
export function itineraryKeyPoints(trip: Trip): LodgingKeyPoint[] | undefined {
  const seen = new Set<string>();
  const points: LodgingKeyPoint[] = [];
  for (const day of trip.days) {
    for (const activity of day.activities) {
      const { place } = activity;
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      points.push({ id: place.id, name: place.name, location: place.location });
    }
  }
  return points.length > 0 ? spread(points, MAX_KEY_POINTS) : undefined;
}

const toPoint = (place: Place): LodgingKeyPoint => ({
  id: place.id,
  name: place.name,
  location: place.location,
});

const meanStraight = (from: LatLng, points: readonly LodgingKeyPoint[]) =>
  points.reduce((sum, point) => sum + straightLineMeters(from, point.location), 0) /
  Math.max(points.length, 1);

function cell(matrix: TravelMatrix, row: number, col: number): PointDistance | undefined {
  const seconds = matrix.durationsSeconds?.[row]?.[col];
  if (seconds === null || seconds === undefined) return undefined;
  const metersValue = matrix.distancesMeters?.[row]?.[col];
  return {
    straightLineMeters: matrix.straightLineMeters[row]?.[col] ?? 0,
    walkMinutes: Math.round(seconds / 6) / 10,
    walkMeters:
      metersValue === null || metersValue === undefined ? undefined : Math.round(metersValue),
  };
}

function travelInfo(matrices: TravelMatrix[]): LodgingTravelInfo {
  const routed = matrices.filter((m) => m.quality === "routed");
  const unavailable = matrices.find((m) => m.quality === "unavailable");
  if (routed.length === 0) {
    return {
      quality: "unavailable",
      message: unavailable?.message ?? "No hay tiempos a pie: se compara en línea recta.",
    };
  }
  const gaps =
    unavailable !== undefined ||
    routed.some((m) => m.durationsSeconds?.some((row) => row.some((value) => value === null)));
  return {
    quality: gaps ? "partial" : "routed",
    source: routed[0]?.source,
    isDemo: routed[0]?.isDemo,
    message: unavailable?.message,
  };
}

/**
 * Busca alojamientos reales de OSM en la zona del destino, los filtra y mide para cada uno la
 * distancia y el tiempo a pie a los puntos clave del viaje y a la estación más cercana.
 * Precio, valoración y disponibilidad solo vienen de un proveedor autorizado (hoy ninguno).
 */
export async function searchLodging(
  trip: Trip,
  filters: LodgingFilters,
  deps: LodgingDeps = defaultDeps(),
): Promise<LodgingSearch> {
  const center = trip.destination.location;
  const bbox = BBoxStringSchema.parse(areaAround(center));
  const warnings: string[] = [];
  const fromItinerary = itineraryKeyPoints(trip);

  let lodgingResponse: Awaited<ReturnType<PlacesProvider["searchByBBox"]>>;
  try {
    lodgingResponse = await deps.places.provider.searchByBBox({
      bbox,
      categories: categoriesForLayers(["lodging"]),
      limit: 500,
    });
  } catch (error) {
    if (error instanceof ProviderError) throw new LodgingUnavailableError(error, center);
    throw error;
  }
  warnings.push(...lodgingResponse.warnings);

  // Puntos clave y estaciones: si fallan se sigue sin ellos (se avisa), no se inventan.
  const [topPlaces, stationsResponse] = await Promise.all([
    fromItinerary
      ? Promise.resolve(undefined)
      : deps.places.provider
          .searchByBBox({ bbox, categories: [...VISIT_CATEGORIES], limit: MAX_KEY_POINTS })
          .catch((error: unknown) => {
            if (!(error instanceof ProviderError)) throw error;
            warnings.push("No se han podido cargar los lugares de referencia del destino.");
            return undefined;
          }),
    deps.places.provider
      .searchByBBox({ bbox, categories: STATION_CATEGORIES, limit: 300 })
      .catch((error: unknown) => {
        if (!(error instanceof ProviderError)) throw error;
        warnings.push("No se han podido cargar las estaciones: el acceso a transporte no cuenta.");
        return undefined;
      }),
  ]);
  const keyPoints =
    fromItinerary ?? (topPlaces?.places ?? []).slice(0, MAX_KEY_POINTS).map(toPoint);
  const stations = stationsResponse?.places ?? [];

  const current = trip.hotel?.place;
  const lodging = lodgingResponse.places.filter((place) => place.id !== current?.id);
  const matching = lodging.filter((place) => matchesFilters(place, filters));
  // Sin puntos clave se preseleccionan los más cercanos al centro del destino.
  const reference =
    keyPoints.length > 0
      ? keyPoints
      : [{ id: "center", name: trip.destination.name, location: center }];
  const compared = [...matching]
    .map((place) => ({ place, distance: meanStraight(place.location, reference) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, current ? MAX_COMPARED - 1 : MAX_COMPARED)
    .map((item) => item.place);
  const hotels = current ? [current, ...compared] : compared;

  // Estaciones candidatas por alojamiento (las dos más cercanas en línea recta dentro del radio).
  const nearStations = hotels.map((hotel) =>
    stations
      .map((station) => ({ station, meters: straightLineMeters(hotel.location, station.location) }))
      .filter((item) => item.meters <= STATION_RADIUS_METERS)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 2),
  );
  const stationIndex = new Map<string, Place>();
  const room = MAX_MATRIX_POINTS - hotels.length;
  for (const perHotel of [0, 1]) {
    for (const list of nearStations) {
      const item = list[perHotel];
      if (item && stationIndex.size < room) stationIndex.set(item.station.id, item.station);
    }
  }
  const stationList = [...stationIndex.values()];
  const hotelLocations = hotels.map((hotel) => hotel.location);

  const [toKeyPoints, toStations, prices] = await Promise.all([
    hotels.length > 0 && keyPoints.length > 0
      ? travelMatrix(
          {
            origins: hotelLocations,
            destinations: keyPoints.map((p) => p.location),
            mode: "walk",
          },
          deps.routing,
        )
      : undefined,
    hotels.length > 0 && stationList.length > 0
      ? travelMatrix(
          {
            origins: hotelLocations,
            destinations: stationList.map((s) => s.location),
            mode: "walk",
          },
          deps.routing,
        )
      : undefined,
    deps.prices.quote({
      places: hotels,
      checkIn: trip.startDate,
      checkOut: trip.endDate,
      adults: trip.travelers.adults,
      children: trip.travelers.children,
      rooms: trip.accommodationPreferences?.rooms ?? 1,
      currency: trip.budget.currency,
    }),
  ]);

  const candidates = hotels.map((hotel, row): LodgingCandidate => {
    const points = keyPoints.map((point, col) => {
      const timed = toKeyPoints ? cell(toKeyPoints, row, col) : undefined;
      return (
        timed ?? {
          straightLineMeters: Math.round(straightLineMeters(hotel.location, point.location)),
        }
      );
    });
    const options = (nearStations[row] ?? []).flatMap(({ station, meters }) => {
      const col = stationList.findIndex((s) => s.id === station.id);
      const timed = toStations && col >= 0 ? cell(toStations, row, col) : undefined;
      return [{ place: station, ...(timed ?? { straightLineMeters: Math.round(meters) }) }];
    });
    const station = [...options].sort(
      (a, b) =>
        (a.walkMinutes ?? Infinity) - (b.walkMinutes ?? Infinity) ||
        a.straightLineMeters - b.straightLineMeters,
    )[0];
    return {
      place: hotel,
      isCurrent: hotel.id === current?.id,
      centerMeters: Math.round(straightLineMeters(hotel.location, center)),
      keyPoints: points,
      station,
      pricing: prices.get(hotel.id) ?? { status: "not_configured", message: deps.prices.message },
    };
  });

  return {
    keyPoints: { basis: fromItinerary ? "itinerary" : "top_places", points: keyPoints },
    candidates,
    matching: matching.length,
    found: lodgingResponse.places.length,
    stationRadiusMeters: STATION_RADIUS_METERS,
    travel: travelInfo([toKeyPoints, toStations].filter((m): m is NonNullable<typeof m> => !!m)),
    pricing: {
      configured: deps.prices.configured,
      providerName: deps.prices.configured ? deps.prices.name : undefined,
      message: deps.prices.message,
    },
    warnings,
  };
}
