import { z } from "zod";

// Variables de servidor. Ninguna clave usa el prefijo NEXT_PUBLIC_.
const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  PROVIDERS_MODE: z.enum(["auto", "demo"]).default("auto"),
  OPENROUTESERVICE_API_KEY: z.string().optional(),
  GEOAPIFY_API_KEY: z.string().optional(),
  TICKETMASTER_API_KEY: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  MAP_STYLE_URL: z.string().url().default("https://tiles.openfreemap.org/styles/liberty"),
  CONTACT_EMAIL: z.string().optional(),
});

export const env = schema.parse(process.env);
