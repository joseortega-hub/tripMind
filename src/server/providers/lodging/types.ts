import type { LodgingPricing } from "@/domain/lodging";
import type { Place } from "@/domain/place";
import type { ProviderInfo } from "../core/types";

export interface LodgingPriceQuery {
  places: Place[];
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  currency: string;
}

/**
 * Precios y disponibilidad de alojamiento de un proveedor **autorizado** (API con acuerdo
 * comercial). Devuelve por id de lugar su precio con fuente o "no configurado"; nunca simula.
 */
export interface LodgingPriceProvider extends ProviderInfo {
  configured: boolean;
  /** Texto para la UI cuando no hay precios. */
  message: string;
  quote(query: LodgingPriceQuery): Promise<Map<string, LodgingPricing>>;
}
