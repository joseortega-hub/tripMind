import { createNotConfiguredRatingsProvider } from "./not-configured";
import type { FoodRatingsProvider } from "./types";

export type { FoodRating, FoodRatingsProvider } from "./types";

/**
 * Proveedor de valoraciones y precios de restaurantes. Para activar uno real (Google Places,
 * Foursquare…) haría falta un adaptador que implemente `FoodRatingsProvider` con su clave solo en
 * el servidor, aceptar sus condiciones (atribución, caché permitida) y elegirlo aquí si la clave
 * está configurada (ver docs/PROVEEDORES.md, "Restaurantes"). Hasta entonces, "no configurado".
 */
export function getFoodRatingsProvider(): FoodRatingsProvider {
  return createNotConfiguredRatingsProvider();
}
