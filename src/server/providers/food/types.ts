import type { FoodRatingsStatus } from "@/domain/food";
import type { Place, PriceCategory } from "@/domain/place";
import type { Source } from "@/domain/source";
import type { ProviderInfo } from "../core/types";

/** Valoración y precio de un sitio según un proveedor con clave (siempre con su fuente). */
export interface FoodRating {
  placeId: string;
  rating?: { value: number; scale: number; count?: number };
  price?: PriceCategory;
  source: Source;
  isDemo: boolean;
}

/**
 * Proveedor OPCIONAL de valoraciones y rangos de precio de restaurantes (p. ej. Google Places o
 * Foursquare con clave en el servidor). Debe casar sus sitios con los de OSM y devolver solo lo
 * que publica, con su atribución. Nunca simula valoraciones ni precios.
 */
export interface FoodRatingsProvider extends ProviderInfo {
  configured: boolean;
  status: FoodRatingsStatus;
  lookup(places: readonly Place[]): Promise<Map<string, FoodRating>>;
}
