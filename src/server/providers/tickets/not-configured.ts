import type { TicketsProvider } from "./types";

export const TICKETS_NOT_CONFIGURED_MESSAGE =
  "No hay un proveedor de entradas configurado: los enlaces son los que publica la fuente " +
  "(web oficial y venta del propio lugar) y no hay precios ni disponibilidad de un vendedor.";

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
