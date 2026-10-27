import { env } from "@/lib/env";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig, type ProvidersConfig } from "../core/config";
import { userAgent } from "../core/http";
import { type ProviderSelection, selectProvider } from "../core/registry";
import { createDemoRoutingProvider } from "./demo";
import { createRealRoutingProvider } from "./real";
import type { RoutingProvider } from "./types";

export type { RoutingProvider } from "./types";

/**
 * Rutas a pie y en coche. Con `OPENROUTESERVICE_API_KEY` se usa ORS; si no, los servidores OSRM
 * de FOSSGIS, cuya política pide un User-Agent con contacto (CONTACT_EMAIL).
 */
export function getRoutingProvider(
  config: ProvidersConfig = getProvidersConfig(),
  orsApiKey: string | undefined = env.OPENROUTESERVICE_API_KEY?.trim() || undefined,
): ProviderSelection<RoutingProvider> {
  return selectProvider(config.mode, {
    missingConfig: orsApiKey || config.contactEmail ? [] : ["CONTACT_EMAIL"],
    real: () =>
      createRealRoutingProvider({
        userAgent: userAgent(config.contactEmail),
        cache: getCacheStore(),
        orsApiKey,
      }),
    demo: createDemoRoutingProvider,
  });
}
