import { z } from "zod";
import type { LatLng } from "@/domain/geo";
import type { LineGeometry, RoutedRoute, TransitStep, TransitVehicle } from "@/domain/route";
import type { Source } from "@/domain/source";
import { fetchJson, parseProviderResponse, type FetchLike } from "../core/http";
import { OSM_ATTRIBUTION } from "../core/osm";
import { RateLimiter } from "../core/rate-limit";
import { externalRouteLinks } from "../routing/links";
import { RouteNotFoundError, toMinutes } from "../routing/types";

export const TRANSITOUS_URL = "https://api.transitous.org/api/v1/plan";
export const TRANSITOUS_NAME = "Transitous (MOTIS)";

/** La política de Transitous exige enlazar sus fuentes en un lugar visible. */
export function transitousSource(retrievedAt: string): Source {
  return {
    name: TRANSITOUS_NAME,
    url: "https://transitous.org/sources/",
    retrievedAt,
    attribution: `Horarios: Transitous y sus fuentes GTFS · ${OSM_ATTRIBUTION}`,
  };
}

/** Uso ligero: una petición por segundo como máximo (y caché). */
const limiter = new RateLimiter(1_000);

export interface TransitQuery {
  from: LatLng;
  to: LatLng;
  /** Salida (ISO 8601 con zona). */
  departure: string;
}

export function transitousPlanUrl({ from, to, departure }: TransitQuery) {
  const params = new URLSearchParams({
    fromPlace: `${from.lat.toFixed(6)},${from.lng.toFixed(6)}`,
    toPlace: `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`,
    time: departure,
    // Por defecto MOTIS descarta el transporte público si andar es más rápido. El comparador ya
    // muestra la opción a pie, así que se aceptan trayectos hasta un 50 % más lentos que andar.
    fastestDirectFactor: "1.5",
  });
  return `${TRANSITOUS_URL}?${params}`;
}

const PlaceSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  tz: z.string().optional(),
  departure: z.string().optional(),
  arrival: z.string().optional(),
});

const LegSchema = z.object({
  mode: z.string(),
  from: PlaceSchema,
  to: PlaceSchema,
  duration: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  distance: z.number().optional(),
  routeShortName: z.string().optional(),
  routeLongName: z.string().optional(),
  displayName: z.string().optional(),
  routeColor: z.string().optional(),
  routeTextColor: z.string().optional(),
  headsign: z.string().optional(),
  agencyName: z.string().optional(),
  intermediateStops: z.array(z.unknown()).optional(),
  legGeometry: z.object({ points: z.string(), precision: z.number() }).optional(),
});

const ItinerarySchema = z.object({
  duration: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  transfers: z.number(),
  legs: z.array(LegSchema).min(1),
});

export const TransitousPlanSchema = z.object({
  itineraries: z.array(ItinerarySchema),
  /** Alternativa sin transporte público (andar) que MOTIS calcula aparte. */
  direct: z.array(z.object({ duration: z.number() })).optional(),
});
export type TransitousPlan = z.infer<typeof TransitousPlanSchema>;

/** Decodifica una polilínea codificada (algoritmo de Google) con la precisión indicada. */
export function decodePolyline(encoded: string, precision: number): LineGeometry {
  const factor = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lng / factor, lat / factor]);
  }
  return points;
}

const VEHICLES: Record<string, TransitVehicle> = {
  WALK: "walk",
  BUS: "bus",
  COACH: "bus",
  SUBWAY: "subway",
  METRO: "subway",
  TRAM: "tram",
  CABLE_CAR: "tram",
  RAIL: "rail",
  REGIONAL_RAIL: "rail",
  REGIONAL_FAST_RAIL: "rail",
  HIGHSPEED_RAIL: "rail",
  LONG_DISTANCE: "rail",
  NIGHT_RAIL: "rail",
  SUBURBAN: "rail",
  FERRY: "ferry",
};

const HEX = /^[0-9a-fA-F]{6}$/;
const color = (value?: string) => (value && HEX.test(value) ? value : undefined);

/** MOTIS llama "START" y "END" al origen y al destino de la consulta. */
const stopName = (name: string) =>
  name === "START" ? "Origen" : name === "END" ? "Destino" : name;

function mapLeg(leg: z.infer<typeof LegSchema>): TransitStep {
  const vehicle = VEHICLES[leg.mode] ?? "other";
  const name = leg.routeShortName || leg.displayName || leg.routeLongName;
  return {
    vehicle,
    line:
      vehicle !== "walk" && name
        ? {
            name,
            longName: leg.routeLongName?.trim() || undefined,
            color: color(leg.routeColor),
            textColor: color(leg.routeTextColor),
            headsign: leg.headsign || undefined,
            agency: leg.agencyName || undefined,
          }
        : undefined,
    from: {
      name: stopName(leg.from.name),
      location: { lat: leg.from.lat, lng: leg.from.lon },
      time: leg.startTime,
    },
    to: {
      name: stopName(leg.to.name),
      location: { lat: leg.to.lat, lng: leg.to.lon },
      time: leg.endTime,
    },
    durationMinutes: toMinutes(leg.duration),
    distanceMeters: leg.distance !== undefined ? Math.round(leg.distance) : undefined,
    intermediateStops: leg.intermediateStops?.length,
  };
}

/**
 * Elige el itinerario que llega antes y lo convierte en ruta. Sin itinerarios, o si ninguno usa
 * transporte público, no hay ruta: nunca se inventan líneas ni horarios.
 */
export function mapTransitousPlan(
  plan: TransitousPlan,
  query: TransitQuery,
  meta: { retrievedAt: string; isDemo: boolean },
): RoutedRoute {
  const withTransit = plan.itineraries.filter((itinerary) =>
    itinerary.legs.some((leg) => leg.mode !== "WALK"),
  );
  if (withTransit.length === 0) {
    throw new RouteNotFoundError(
      (plan.direct?.length ?? 0) > 0
        ? "Transitous no propone transporte público para este trayecto: andando se llega antes o casi igual. Puede faltar alguna red local en sus datos."
        : "Transitous no encontró trayecto en transporte público para esa hora (puede que no haya horarios publicados para esta zona o fecha).",
      "transitous",
      "no_route",
    );
  }
  const best = withTransit.reduce((a, b) =>
    Date.parse(b.endTime) < Date.parse(a.endTime) ? b : a,
  );
  const geometry = best.legs.flatMap((leg) =>
    leg.legGeometry
      ? decodePolyline(leg.legGeometry.points, leg.legGeometry.precision)
      : ([
          [leg.from.lon, leg.from.lat],
          [leg.to.lon, leg.to.lat],
        ] as [number, number][]),
  );
  const distances = best.legs.map((leg) => leg.distance);
  return {
    quality: "routed",
    mode: "transit",
    from: query.from,
    to: query.to,
    durationMinutes: toMinutes(best.duration),
    // Solo se suma si todos los tramos traen distancia (los de vehículo no siempre la traen).
    distanceMeters: distances.every((d) => d !== undefined)
      ? Math.round(distances.reduce<number>((sum, d) => sum + (d ?? 0), 0))
      : undefined,
    geometry:
      geometry.length >= 2
        ? geometry
        : [
            [query.from.lng, query.from.lat],
            [query.to.lng, query.to.lat],
          ],
    departure: best.startTime,
    arrival: best.endTime,
    transfers: best.transfers,
    steps: best.legs.map(mapLeg),
    timeZone: best.legs[0]?.from.tz,
    externalLinks: externalRouteLinks(query.from, query.to, "transit"),
    source: transitousSource(meta.retrievedAt),
    isDemo: meta.isDemo,
  };
}

export async function transitousPlan(
  query: TransitQuery,
  deps: { userAgent: string; fetch?: FetchLike },
) {
  const raw = await limiter.schedule(() =>
    fetchJson(transitousPlanUrl(query), { providerId: "transitous", timeoutMs: 20_000, ...deps }),
  );
  return mapTransitousPlan(parseProviderResponse(TransitousPlanSchema, raw, "transitous"), query, {
    retrievedAt: new Date().toISOString(),
    isDemo: false,
  });
}
