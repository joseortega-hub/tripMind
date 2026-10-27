import { z } from "zod";
import type { LatLng } from "./geo";
import type { Place, PlaceCategory } from "./place";
import { type LodgingType, LodgingTypeSchema } from "./preferences";
import type { Source } from "./source";

/** Categoría OSM de la capa `lodging` → tipo del asistente ("otro" = casa de huéspedes). */
export const LODGING_TYPE_OF: Partial<Record<PlaceCategory, LodgingType>> = {
  hotel: "hotel",
  hostel: "hostel",
  apartment: "apartment",
  guest_house: "other",
};

/** Filtros estrictos de la búsqueda (se aplican en el servidor antes de medir tiempos). */
export const LodgingFiltersSchema = z.object({
  types: z.array(LodgingTypeSchema).default([]),
  /** Solo alojamientos con `stars` en OSM iguales o superiores. */
  minStars: z.number().int().min(1).max(5).optional(),
  /** Solo `wheelchair=yes` en OSM. */
  accessibleOnly: z.boolean().default(false),
});
export type LodgingFilters = z.infer<typeof LodgingFiltersSchema>;

/** Pesos de la puntuación (0 = no cuenta, 5 = mucho). Los ajusta el usuario. */
export const LodgingWeightsSchema = z.object({
  budget: z.number().int().min(0).max(5),
  proximity: z.number().int().min(0).max(5),
  transport: z.number().int().min(0).max(5),
  preferences: z.number().int().min(0).max(5),
});
export type LodgingWeights = z.infer<typeof LodgingWeightsSchema>;
export type LodgingScoreKey = keyof LodgingWeights;

export const DEFAULT_LODGING_WEIGHTS: LodgingWeights = {
  budget: 3,
  proximity: 3,
  transport: 2,
  preferences: 2,
};

export const LodgingSortSchema = z.enum(["score", "location", "transport", "location_transport"]);
export type LodgingSort = z.infer<typeof LodgingSortSchema>;

/** Distancia de un alojamiento a un punto: tiempo a pie del proveedor de rutas o solo la recta. */
export interface PointDistance {
  straightLineMeters: number;
  walkMinutes?: number;
  walkMeters?: number;
}

/** Punto clave con el que se compara la ubicación (lugares del itinerario o los más relevantes). */
export interface LodgingKeyPoint {
  id: string;
  name: string;
  location: LatLng;
}

/**
 * Estado del proveedor de precios. Sin proveedor autorizado no hay precio, valoración ni
 * disponibilidad: nunca se simulan (REQUISITOS §3.3, §7).
 */
export type LodgingPricing =
  | { status: "not_configured"; message: string }
  | {
      status: "available";
      /** Precio por noche en la moneda del viaje, con la fuente del proveedor. */
      amountPerNight: number;
      currency: string;
      source: Source;
      isDemo: boolean;
    };

export interface LodgingCandidate {
  place: Place;
  /** Es el hotel actual del viaje. */
  isCurrent: boolean;
  /** Distancia en línea recta al centro del destino. */
  centerMeters: number;
  /** Mismo orden que `LodgingSearch.keyPoints.points`. */
  keyPoints: PointDistance[];
  /** Estación más cercana (metro, tren, tranvía o estación de autobuses de OSM). */
  station?: PointDistance & { place: Place };
  pricing: LodgingPricing;
}

export interface LodgingTravelInfo {
  quality: "routed" | "partial" | "unavailable";
  source?: Source;
  isDemo?: boolean;
  message?: string;
}

export interface LodgingSearch {
  keyPoints: {
    /** `itinerary`: visitas del plan; `top_places`: lugares más relevantes del destino. */
    basis: "itinerary" | "top_places";
    points: LodgingKeyPoint[];
  };
  candidates: LodgingCandidate[];
  /** Alojamientos que cumplen los filtros (antes de recortar a los que se comparan). */
  matching: number;
  /** Alojamientos de OSM encontrados en la zona (sin filtros). */
  found: number;
  /** Radio de búsqueda de estaciones alrededor de cada alojamiento. */
  stationRadiusMeters: number;
  travel: LodgingTravelInfo;
  pricing: { configured: boolean; providerName?: string; message: string };
  warnings: string[];
}
