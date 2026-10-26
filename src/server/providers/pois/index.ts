import type { LatLng } from "@/domain/geo";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig, type ProvidersConfig } from "../core/config";
import { userAgent } from "../core/http";
import { type ProviderSelection, selectProvider } from "../core/registry";
import { createDemoPlacesProvider } from "./demo";
import { createRealPlacesProvider } from "./real";
import type { PlacesProvider } from "./types";

export type { PlacesProvider } from "./types";

/** Overpass y Wikimedia piden un User-Agent con contacto: sin CONTACT_EMAIL se usa demo. */
export function getPlacesProvider(
  config: ProvidersConfig = getProvidersConfig(),
): ProviderSelection<PlacesProvider> {
  return selectProvider(config.mode, {
    missingConfig: config.contactEmail ? [] : ["CONTACT_EMAIL"],
    real: () =>
      createRealPlacesProvider({
        userAgent: userAgent(config.contactEmail),
        cache: getCacheStore(),
      }),
    demo: createDemoPlacesProvider,
  });
}

/** Mapa de OpenStreetMap centrado en la zona, como alternativa si el proveedor falla. */
export const externalPlacesUrl = ({ lat, lng }: LatLng) =>
  `https://www.openstreetmap.org/#map=17/${lat.toFixed(5)}/${lng.toFixed(5)}`;
