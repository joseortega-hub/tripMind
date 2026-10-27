import { z } from "zod";
import { LatLngSchema } from "./geo";
import { SourceSchema } from "./source";

/** Modos que compara la ficha de lugar (REQUISITOS §11). "car" cubre también el taxi. */
export const RouteModeSchema = z.enum(["walk", "car", "transit"]);
export type RouteMode = z.infer<typeof RouteModeSchema>;

/** Modos con ruta por calles (OSRM / OpenRouteService). */
export const StreetModeSchema = z.enum(["walk", "car"]);
export type StreetMode = z.infer<typeof StreetModeSchema>;

/** Geometría [lng, lat][] (orden GeoJSON, como `Leg.geometry`). */
export const LineGeometrySchema = z.array(z.tuple([z.number(), z.number()])).min(2);
export type LineGeometry = z.infer<typeof LineGeometrySchema>;

export const ExternalRouteLinkSchema = z.object({
  /** Texto del enlace, p. ej. "Google Maps". */
  label: z.string().min(1),
  url: z.url(),
});
export type ExternalRouteLink = z.infer<typeof ExternalRouteLinkSchema>;

/** Línea de transporte tal y como la publica el feed GTFS (nunca se completa a mano). */
export const TransitLineSchema = z.object({
  /** Nombre corto (L1, C7, 27…). */
  name: z.string().min(1),
  longName: z.string().optional(),
  /** Colores del feed en hexadecimal sin "#". */
  color: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/)
    .optional(),
  textColor: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/)
    .optional(),
  headsign: z.string().optional(),
  agency: z.string().optional(),
});
export type TransitLine = z.infer<typeof TransitLineSchema>;

export const TransitStopPointSchema = z.object({
  name: z.string().min(1),
  location: LatLngSchema,
  /** Hora programada (ISO 8601 con zona) si la fuente la da. */
  time: z.iso.datetime({ offset: true }).optional(),
});

/** Vehículos de un tramo de transporte público (modos de MOTIS simplificados). */
export const TransitVehicleSchema = z.enum([
  "walk",
  "bus",
  "subway",
  "tram",
  "rail",
  "ferry",
  "other",
]);
export type TransitVehicle = z.infer<typeof TransitVehicleSchema>;

export const TransitStepSchema = z.object({
  vehicle: TransitVehicleSchema,
  line: TransitLineSchema.optional(),
  from: TransitStopPointSchema,
  to: TransitStopPointSchema,
  durationMinutes: z.number().nonnegative(),
  distanceMeters: z.number().nonnegative().optional(),
  /** Paradas intermedias (sin contar origen y destino). */
  intermediateStops: z.number().int().nonnegative().optional(),
});
export type TransitStep = z.infer<typeof TransitStepSchema>;

/** Ruta calculada por un proveedor real (o grabada de uno, en demo). */
export const RoutedRouteSchema = z.object({
  quality: z.literal("routed"),
  mode: RouteModeSchema,
  from: LatLngSchema,
  to: LatLngSchema,
  durationMinutes: z.number().nonnegative(),
  distanceMeters: z.number().nonnegative().optional(),
  geometry: LineGeometrySchema,
  /** Solo transporte público: horas programadas, transbordos y tramos. */
  departure: z.iso.datetime({ offset: true }).optional(),
  arrival: z.iso.datetime({ offset: true }).optional(),
  transfers: z.number().int().nonnegative().optional(),
  steps: z.array(TransitStepSchema).optional(),
  /** Zona horaria IANA del destino, para mostrar las horas en local. */
  timeZone: z.string().optional(),
  externalLinks: z.array(ExternalRouteLinkSchema),
  source: SourceSchema,
  isDemo: z.boolean(),
});
export type RoutedRoute = z.infer<typeof RoutedRouteSchema>;

/** Por qué no hay ruta calculada. La UI lo explica; nunca se rellena con datos inventados. */
export const RouteUnavailableReasonSchema = z.enum([
  /** El proveedor falló (red, cuota, error). */
  "provider_failed",
  /** El proveedor respondió pero no hay ruta (sin feed GTFS, sin horarios ese día…). */
  "no_route",
  /** Los datos de demostración no incluyen este trayecto. */
  "no_coverage",
]);
export type RouteUnavailableReason = z.infer<typeof RouteUnavailableReasonSchema>;

/**
 * Sin ruta real: línea recta (marcada como aproximada en el mapa) y enlaces externos con
 * origen y destino ya puestos. No lleva duración: un tiempo estimado sería un dato inventado.
 */
export const ApproximateRouteSchema = z.object({
  quality: z.literal("approximate"),
  mode: RouteModeSchema,
  from: LatLngSchema,
  to: LatLngSchema,
  /** Distancia en línea recta, calculada localmente (no es la distancia del trayecto). */
  straightLineMeters: z.number().nonnegative(),
  geometry: LineGeometrySchema,
  reason: RouteUnavailableReasonSchema,
  message: z.string().min(1),
  externalLinks: z.array(ExternalRouteLinkSchema).min(1),
});
export type ApproximateRoute = z.infer<typeof ApproximateRouteSchema>;

export const RouteResultSchema = z.discriminatedUnion("quality", [
  RoutedRouteSchema,
  ApproximateRouteSchema,
]);
export type RouteResult = z.infer<typeof RouteResultSchema>;

/**
 * Matriz de tiempos entre puntos (la usa el optimizador). `null` = sin ruta entre ese par.
 * Si el proveedor no responde, `quality` es "unavailable" y solo hay distancias en línea recta.
 */
export const TravelMatrixSchema = z.object({
  mode: StreetModeSchema,
  quality: z.enum(["routed", "unavailable"]),
  durationsSeconds: z.array(z.array(z.number().nonnegative().nullable())).optional(),
  distancesMeters: z.array(z.array(z.number().nonnegative().nullable())).optional(),
  straightLineMeters: z.array(z.array(z.number().nonnegative())),
  source: SourceSchema.optional(),
  isDemo: z.boolean().optional(),
  message: z.string().optional(),
});
export type TravelMatrix = z.infer<typeof TravelMatrixSchema>;

const EARTH_RADIUS_METERS = 6_371_008.8;

/** Distancia en línea recta (haversine). Es geometría local, no un dato de un proveedor. */
export function straightLineMeters(
  a: z.infer<typeof LatLngSchema>,
  b: z.infer<typeof LatLngSchema>,
) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}
