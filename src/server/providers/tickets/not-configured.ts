import type { TicketsProvider } from "./types";

export const TICKETS_NOT_CONFIGURED_MESSAGE =
  "Sin proveedor de entradas conectado: no hay precios ni disponibilidad de vendedores. " +
  "Los enlaces son los que publica el propio lugar.";

/** Único adaptador por ahora: sin productos, precios ni disponibilidad de un vendedor externo. */
export function createNotConfiguredTicketsProvider(): TicketsProvider {
  return {
    id: "tickets-not-configured",
    name: "Sin proveedor de entradas",
    isDemo: false,
    configured: false,
    status: { status: "not_configured", message: TICKETS_NOT_CONFIGURED_MESSAGE },
    async offers() {
      return new Map();
    },
  };
}
