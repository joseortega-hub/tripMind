import { env } from "@/lib/env";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig, type ProvidersConfig } from "../core/config";
import { userAgent } from "../core/http";
import { type ProviderSelection, selectProvider } from "../core/registry";
import { createDemoGeocodingProvider } from "./demo";
import { createRealGeocodingProvider } from "./real";
import type { GeocodingProvider } from "./types";

export type { GeocodingProvider } from "./types";

/**
 * Photon no exige contacto, pero el respaldo (Nominatim) sí: sin CONTACT_EMAIL se usa demo
 * para no incumplir su política de uso.
 */
export function getGeocodingProvider(
  config: ProvidersConfig = getProvidersConfig(),
): ProviderSelection<GeocodingProvider> {
  return selectProvider(config.mode, {
    missingConfig: config.contactEmail ? [] : ["CONTACT_EMAIL"],
    real: () =>
      createRealGeocodingProvider({
        userAgent: userAgent(config.contactEmail),
        cache: getCacheStore(),
        geoapifyApiKey: env.GEOAPIFY_API_KEY?.trim() || undefined,
      }),
    demo: createDemoGeocodingProvider,
  });
}

/** URL externa para buscar a mano si el proveedor falla. */
export const externalGeocodeUrl = (q: string) =>
  `https://www.openstreetmap.org/search?${new URLSearchParams({ query: q })}`;
