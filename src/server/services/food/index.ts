import type { BBox, LatLng } from "@/domain/geo";
import type {
  FoodDistance,
  FoodNear,
  FoodQuery,
  FoodReference,
  FoodResult,
  FoodSearch,
  FoodTravelInfo,
} from "@/domain/food";
import { categoriesForLayers, type Place } from "@/domain/place";
import { straightLineMeters, type TravelMatrix } from "@/domain/route";
import type { Trip } from "@/domain/trip";
import type { ProviderSelection } from "@/server/providers/core/registry";
import { ProviderError } from "@/server/providers/core/types";
import { getFoodRatingsProvider, type FoodRatingsProvider } from "@/server/providers/food";
import { getPlacesProvider, type PlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider, type RoutingProvider } from "@/server/providers/routing";
import { dayOpening, statusFor } from "../itinerary/opening";
import { minutesToTime } from "../itinerary/plan";
import { travelMatrix } from "../routes";
import { mealContext } from "./context";
import { cuisineFacets, isLocalCuisine, isQuick, matchesFoodFilters } from "./filters";
import { compareReferences, rankFood } from "./ranking";

/** Radio de búsqueda alrededor de cada referencia (~15 min a pie). */
export const SEARCH_RADIUS_METERS = 1000;
/** Sitios más cercanos (en línea recta) a cada referencia que se miden con la matriz a pie. */
export const MEASURED_PER_REFERENCE = 25;
/** Resultados que se devuelven. */
export const MAX_RESULTS = 30;

export interface FoodDeps {
  places: ProviderSelection<PlacesProvider>;
  routing: ProviderSelection<RoutingProvider>;
  ratings: FoodRatingsProvider;
}

const defaultDeps = (): FoodDeps => ({
  places: getPlacesProvider(),
  routing: getRoutingProvider(),
  ratings: getFoodRatingsProvider(),
});

/** Sin sitios de OSM no hay buscador: el error recuerda dónde, para ofrecer el mapa. */
export class FoodUnavailableError extends ProviderError {
  constructor(
    cause: ProviderError,
    readonly at: LatLng,
  ) {
    super(cause.message, cause.providerId);
    this.name = "FoodUnavailableError";
  }
}

export function bboxAround({ lat, lng }: LatLng, meters: number): BBox {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const round = (value: number) => Number(value.toFixed(5));
  return [round(lng - dLng), round(lat - dLat), round(lng + dLng), round(lat + dLat)];
}

function travelInfo(matrices: TravelMatrix[]): FoodTravelInfo {
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

function cell(matrix: TravelMatrix | undefined, row: number, col: number) {
  const seconds = matrix?.durationsSeconds?.[row]?.[col];
  if (seconds === null || seconds === undefined) return {};
  const meters = matrix?.distancesMeters?.[row]?.[col];
  return {
    minutes: Math.max(1, Math.round(seconds / 60)),
    meters: meters === null || meters === undefined ? undefined : Math.round(meters),
  };
}

/**
 * Busca sitios reales de OSM (capa de gastronomía) para una comida del viaje: cerca de la
 * actividad anterior o siguiente y del hotel, abiertos a esa hora según `opening_hours` (sin
 * horario quedan "pendiente de confirmar") y con el tiempo a pie de la matriz de rutas.
 * Valoraciones y precios solo de un proveedor configurado (hoy ninguno) o del rango de OSM.
 */
export async function searchFood(
  trip: Trip,
  query: FoodQuery,
  deps: FoodDeps = defaultDeps(),
): Promise<FoodSearch> {
  const context = mealContext(trip, query.date, query.moment);
  const { references } = context;
  const near: FoodNear = references.some((r) => r.key === query.near)
    ? query.near!
    : references[0]!.key;
  const warnings: string[] = [];

  // Una consulta por referencia (bbox pequeño y en rejilla: se reutiliza la caché).
  let responses: Awaited<ReturnType<PlacesProvider["searchByBBox"]>>[];
  try {
    responses = await Promise.all(
      references.map((ref) =>
        deps.places.provider.searchByBBox({
          bbox: bboxAround(ref.location, SEARCH_RADIUS_METERS),
          categories: categoriesForLayers(["food"]),
          limit: 2000,
        }),
      ),
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new FoodUnavailableError(error, references[0]!.location);
    }
    throw error;
  }
  for (const response of responses) {
    for (const warning of response.warnings)
      if (!warnings.includes(warning)) warnings.push(warning);
  }
  const byId = new Map<string, Place>();
  for (const place of responses.flatMap((r) => r.places)) {
    const close = references.some(
      (ref) => straightLineMeters(ref.location, place.location) <= SEARCH_RADIUS_METERS,
    );
    if (close && !byId.has(place.id)) byId.set(place.id, place);
  }
  const zone = [...byId.values()];

  // Horario de OSM durante la comida: los cerrados confirmados se descartan.
  const end = context.start + context.duration;
  const openingContext = {
    countryCode: trip.destination.countryCode,
    location: trip.destination.location,
  };
  const open: { place: Place; opening: FoodResult["opening"] }[] = [];
  let closed = 0;
  for (const place of zone) {
    const day = dayOpening(place.openingHours, query.date, openingContext);
    const status = statusFor(day, context.start, end);
    if (status === "closed") {
      closed++;
      continue;
    }
    const window =
      day.kind === "hours"
        ? day.windows.find((w) => w.start <= context.start && w.end >= end)
        : undefined;
    open.push({
      place,
      opening: {
        status,
        window: window
          ? {
              start: minutesToTime(window.start),
              // Abierto hasta el final del día (o más allá): "24:00", no "23:59".
              end: window.end >= 24 * 60 ? "24:00" : minutesToTime(window.end),
            }
          : undefined,
      },
    });
  }

  const countryCode = trip.destination.countryCode;
  const cuisines = cuisineFacets(
    open
      .filter(({ place }) =>
        matchesFoodFilters(place, { ...query, cuisine: undefined }, countryCode),
      )
      .map(({ place }) => place),
  );
  const matching = open.filter(({ place }) => matchesFoodFilters(place, query, countryCode));

  // Se miden los más cercanos a cada referencia (sin repetir) con la matriz a pie.
  const measured = new Map<string, (typeof matching)[number]>();
  for (const ref of references) {
    const nearest = [...matching]
      .sort(
        (a, b) =>
          straightLineMeters(ref.location, a.place.location) -
          straightLineMeters(ref.location, b.place.location),
      )
      .slice(0, MEASURED_PER_REFERENCE);
    for (const item of nearest) measured.set(item.place.id, item);
  }
  const candidates = [...measured.values()];
  const locations = candidates.map(({ place }) => place.location);
  // Desde la anterior y el hotel hacia el sitio; del sitio a la siguiente actividad.
  const from = references.filter((ref) => ref.key !== "next");
  const to = references.filter((ref) => ref.key === "next");
  const [fromMatrix, toMatrix] =
    candidates.length === 0
      ? [undefined, undefined]
      : await Promise.all([
          from.length > 0
            ? travelMatrix(
                { origins: from.map((r) => r.location), destinations: locations, mode: "walk" },
                deps.routing,
              )
            : undefined,
          to.length > 0
            ? travelMatrix(
                { origins: locations, destinations: to.map((r) => r.location), mode: "walk" },
                deps.routing,
              )
            : undefined,
        ]);

  const distanceTo = (ref: FoodReference, index: number, place: Place): FoodDistance => {
    const straightMeters = Math.round(straightLineMeters(ref.location, place.location));
    const measuredCell =
      ref.key === "next"
        ? cell(toMatrix, index, to.indexOf(ref))
        : cell(fromMatrix, from.indexOf(ref), index);
    return { straightMeters, ...measuredCell };
  };
  const results: FoodResult[] = candidates.map(({ place, opening }, index) => ({
    place,
    opening,
    distances: Object.fromEntries(
      references.map((ref) => [ref.key, distanceTo(ref, index, place)]),
    ),
    local: isLocalCuisine(place, countryCode),
    quick: isQuick(place),
  }));

  const matrices = [fromMatrix, toMatrix].filter((m): m is NonNullable<typeof m> => !!m);
  const meal = context.meal;
  return {
    context: {
      date: query.date,
      moment: query.moment,
      time: minutesToTime(context.start),
      durationMinutes: context.duration,
      meal: meal ? { activityId: meal.id, title: meal.title, placeId: meal.place?.id } : undefined,
      references,
      near,
    },
    results: rankFood(results, near, query.maxMinutes).slice(0, MAX_RESULTS),
    comparison: compareReferences(results, references, undefined, MEASURED_PER_REFERENCE),
    cuisines,
    totals: { zone: zone.length, closed, matching: matching.length },
    travel:
      matrices.length > 0
        ? travelInfo(matrices)
        : { quality: "unavailable", message: "Sin sitios que medir." },
    ratings: deps.ratings.status,
    warnings,
  };
}
