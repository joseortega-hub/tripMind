import { createNotConfiguredPriceProvider } from "./not-configured";
import type { LodgingPriceProvider } from "./types";

export type { LodgingPriceProvider, LodgingPriceQuery } from "./types";

/**
 * Proveedor de precios de alojamiento. Para activar uno real hace falta un acuerdo con un
 * proveedor autorizado (ver docs/PROVEEDORES.md, "Hoteles: precios"): un adaptador que
 * implemente `LodgingPriceProvider` con su clave en el servidor y se elija aquí si está
 * configurada. Hasta entonces, siempre "no configurado".
 */
export function getLodgingPriceProvider(): LodgingPriceProvider {
  return createNotConfiguredPriceProvider();
}
