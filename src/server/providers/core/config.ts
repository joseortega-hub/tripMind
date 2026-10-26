import { env } from "@/lib/env";

export type ProvidersMode = "auto" | "demo";

export interface ProvidersConfig {
  mode: ProvidersMode;
  /** Contacto para el User-Agent. Nominatim, Overpass y Wikimedia lo exigen en su política de uso. */
  contactEmail?: string;
}

export function getProvidersConfig(): ProvidersConfig {
  return { mode: env.PROVIDERS_MODE, contactEmail: env.CONTACT_EMAIL?.trim() || undefined };
}
