import { z } from "zod";
import { invalidRequest, providerFailure, providerMeta } from "@/server/api/responses";
import { externalGeocodeUrl, getGeocodingProvider } from "@/server/providers/geocoding";

export const runtime = "nodejs";

const QuerySchema = z
  .object({
    q: z.string().trim().min(2, "Escribe al menos 2 caracteres").max(200),
    /** autocomplete = mientras se escribe (Photon); search = al enviar (con respaldo Nominatim). */
    mode: z.enum(["autocomplete", "search"]).default("autocomplete"),
    limit: z.coerce.number().int().min(1).max(10).default(5),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((query) => (query.lat === undefined) === (query.lng === undefined), {
    message: "lat y lng van juntos",
    path: ["lat"],
  });

/** GET /api/geocode?q=prado&mode=autocomplete&limit=5[&lat=..&lng=..] */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) return invalidRequest(parsed.error);

  const { q, mode, limit, lat, lng } = parsed.data;
  const near = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
  const selection = getGeocodingProvider();
  try {
    const query = { q, limit, near };
    const response =
      mode === "search"
        ? await selection.provider.search(query)
        : await selection.provider.autocomplete(query);
    return Response.json({
      results: response.results,
      provider: providerMeta(selection, response.providerId),
      fromCache: response.fromCache,
    });
  } catch (error) {
    return providerFailure(error, externalGeocodeUrl(q));
  }
}
