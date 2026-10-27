import type { FoodRatingsProvider } from "./types";

export const RATINGS_NOT_CONFIGURED_MESSAGE =
  "Sin valoraciones: no hay un proveedor de valoraciones configurado. El precio solo aparece " +
  "si OpenStreetMap publica el rango del local.";

/** Único adaptador por ahora: no hay valoraciones ni precios de un proveedor externo. */
export function createNotConfiguredRatingsProvider(): FoodRatingsProvider {
  return {
    id: "food-ratings-not-configured",
    name: "Sin proveedor de valoraciones",
    isDemo: false,
    configured: false,
    status: { status: "not_configured", message: RATINGS_NOT_CONFIGURED_MESSAGE },
    async lookup() {
      return new Map();
    },
  };
}
