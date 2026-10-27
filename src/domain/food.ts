import { z } from "zod";
import type { LatLng } from "./geo";
import type { OpeningStatus } from "./itinerary";
import type { Place } from "./place";
import { IsoDateSchema } from "./preferences";
import type { Source } from "./source";

/** Momento del día del buscador (REQUISITOS §10). La merienda no tiene franja en el itinerario. */
export const FoodMomentSchema = z.enum(["breakfast", "lunch", "snack", "dinner"]);
export type FoodMoment = z.infer<typeof FoodMomentSchema>;

/** Punto de referencia: actividad anterior, siguiente, hotel o (sin nada de eso) el destino. */
export const FoodNearSchema = z.enum(["next", "previous", "hotel", "center"]);
export type FoodNear = z.infer<typeof FoodNearSchema>;

/** `local`: cocina del país o regional según `cuisine`; `quick`: comida rápida o para llevar. */
export const FoodStyleSchema = z.enum(["any", "local", "quick"]);
export type FoodStyle = z.infer<typeof FoodStyleSchema>;

export const FoodDietSchema = z.enum(["vegetarian", "vegan"]);
export type FoodDiet = z.infer<typeof FoodDietSchema>;

export const FoodQuerySchema = z.object({
  date: IsoDateSchema,
  moment: FoodMomentSchema,
  /** Referencia con la que se ordena; por defecto la siguiente actividad, si la hay. */
  near: FoodNearSchema.optional(),
  /** Valor de la etiqueta OSM `cuisine` (p. ej. "spanish", "tapas"). */
  cuisine: z
    .string()
    .trim()
    .regex(/^[a-z0-9_:-]{1,40}$/)
    .optional(),
  diet: FoodDietSchema.optional(),
  terrace: z.boolean().default(false),
  maxMinutes: z.number().int().min(5).max(30).optional(),
  style: FoodStyleSchema.default("any"),
});
export type FoodQuery = z.infer<typeof FoodQuerySchema>;
export type FoodQueryInput = z.input<typeof FoodQuerySchema>;

export interface FoodReference {
  key: FoodNear;
  name: string;
  location: LatLng;
  /** Actividad del itinerario (anterior o siguiente) y su hora. */
  activityId?: string;
  time?: string;
}

/**
 * Distancia de un sitio a una referencia. `minutes`/`meters` solo con la matriz a pie del
 * proveedor de rutas; sin ella solo hay línea recta y la UI lo dice.
 */
export interface FoodDistance {
  straightMeters: number;
  minutes?: number;
  meters?: number;
}

export interface FoodResult {
  place: Place;
  /** Estado del horario de OSM durante la comida; "closed" nunca se devuelve. */
  opening: { status: Exclude<OpeningStatus, "closed">; window?: { start: string; end: string } };
  distances: Partial<Record<FoodNear, FoodDistance>>;
  /** Cocina del país o regional según la etiqueta `cuisine`. */
  local: boolean;
  quick: boolean;
}

/** Lo mejor de cada referencia para comparar "cerca de la siguiente" con "cerca del hotel". */
export interface FoodComparison {
  key: FoodNear;
  /** Sitios abiertos (o pendientes) a ≤ `withinMinutes` a pie de esta referencia. */
  count: number;
  /** Solo se miden los más cercanos: `count` es "al menos" (la UI dice "N o más"). */
  capped: boolean;
  withinMinutes: number;
  closest?: { placeId: string; name: string; minutes?: number; straightMeters: number };
}

export interface FoodTravelInfo {
  quality: "routed" | "partial" | "unavailable";
  source?: Source;
  isDemo?: boolean;
  message?: string;
}

/** Proveedor opcional de valoraciones y precios (Google Places, Foursquare…): hoy ninguno. */
export type FoodRatingsStatus =
  { status: "not_configured"; message: string } | { status: "available"; source: Source };

export interface FoodSearch {
  context: {
    date: string;
    moment: FoodMoment;
    /** Hora y duración de la comida (HH:MM). */
    time: string;
    durationMinutes: number;
    /** Franja de comida del itinerario a la que se puede añadir el sitio. */
    meal?: { activityId: string; title: string; placeId?: string };
    references: FoodReference[];
    near: FoodNear;
  };
  results: FoodResult[];
  comparison: FoodComparison[];
  /** Cocinas (etiqueta OSM) de los sitios que cumplen el resto de filtros. */
  cuisines: { value: string; count: number }[];
  totals: { zone: number; closed: number; matching: number };
  travel: FoodTravelInfo;
  ratings: FoodRatingsStatus;
  warnings: string[];
}
