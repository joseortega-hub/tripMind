import { createNotConfiguredTicketsProvider } from "./not-configured";
import type { TicketsProvider } from "./types";

export type { TicketOffer, TicketsProvider, TicketsQuery, TicketsStatus } from "./types";

/**
 * Proveedor de entradas de un vendedor autorizado. Hoy siempre "no configurado".
 *
 * Hueco para Ticketdoor (Fase 11, docs/TICKETDOOR.md): un adaptador `ticketdoor/` con `real.ts`
 * (API o feed del catálogo con su clave solo en el servidor, p. ej. `TICKETDOOR_API_KEY`) y
 * `demo.ts` (fixtures marcados `isDemo` e `isProposal` mientras no haya acuerdo) que implementen
 * `TicketsProvider`: casar productos por Wikidata u OSM, devolver `link.kind =
 * "authorized_reseller"` con `providerName: "Ticketdoor"`, precio "desde" con su fecha y
 * disponibilidad solo si su API la da en tiempo real. Se elegiría aquí según la configuración.
 * Hasta entonces no hay datos ni enlaces de Ticketdoor en TripMind.
 */
export function getTicketsProvider(): TicketsProvider {
  return createNotConfiguredTicketsProvider();
}
