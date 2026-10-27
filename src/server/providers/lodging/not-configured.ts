import type { LodgingPricing } from "@/domain/lodging";
import type { LodgingPriceProvider } from "./types";

export const NOT_CONFIGURED_MESSAGE =
  "Sin precio disponible: TripMind no tiene acceso a un proveedor autorizado de precios y " +
  "disponibilidad. Consulta precios en los enlaces de búsqueda.";

/** Único adaptador por ahora: responde "no configurado" para todos los alojamientos. */
export function createNotConfiguredPriceProvider(): LodgingPriceProvider {
  const pricing: LodgingPricing = { status: "not_configured", message: NOT_CONFIGURED_MESSAGE };
  return {
    id: "lodging-prices-not-configured",
    name: "Sin proveedor de precios",
    isDemo: false,
    configured: false,
    message: NOT_CONFIGURED_MESSAGE,
    async quote(query) {
      return new Map(query.places.map((place) => [place.id, pricing]));
    },
  };
}
