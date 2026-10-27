import type { BookingLink } from "@/domain/booking";
import type { Place } from "@/domain/place";
import type { Source } from "@/domain/source";
import type { ProviderInfo } from "../core/types";

/**
 * Producto de un proveedor de entradas **autorizado** casado con un lugar del viaje. Solo lleva lo
 * que publica el proveedor: precio "desde" con su fecha, condiciones y disponibilidad únicamente si
 * su API la da en tiempo real. Nunca se rellena nada.
 */
export interface TicketOffer {
  placeId: string;
  /** Enlace de compra del proveedor (`kind: "authorized_reseller"`). */
  link: BookingLink;
  /** Precio por persona publicado por el proveedor; cuenta como orientativo con fecha. */
  priceFrom?: { amount: number; currency: string; retrievedAt: string };
  /** Condiciones (cancelación, idioma…) tal como las da el proveedor. */
  conditions?: string;
  /** Solo si la API da disponibilidad en tiempo real para la fecha pedida. */
  availability?: "available" | "sold_out";
  source: Source;
  isDemo: boolean;
  /** true mientras la integración sea una propuesta sin acuerdo (Ticketdoor, Fase 11). */
  isProposal?: boolean;
}

export type TicketsStatus =
  | { status: "not_configured"; message: string }
  | { status: "available"; providerName: string; isDemo: boolean; isProposal: boolean };

export interface TicketsQuery {
  places: readonly Place[];
  /** Fecha de la visita (YYYY-MM-DD) para la disponibilidad, si el proveedor la da. */
  date?: string;
  adults: number;
  children: number;
  currency: string;
}

/**
 * Proveedor de entradas autorizado (REQUISITOS §12, §16). Debe casar sus productos con los lugares
 * de OSM por Wikidata, id de OSM o coordenadas y nombre, y devolver solo los que encuentre.
 */
export interface TicketsProvider extends ProviderInfo {
  configured: boolean;
  status: TicketsStatus;
  offers(query: TicketsQuery): Promise<Map<string, TicketOffer[]>>;
}
