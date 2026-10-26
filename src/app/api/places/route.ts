import { z } from "zod";
import { BBoxStringSchema } from "@/domain/geo";
import { categoriesForLayers, MapLayerSchema, PlaceCategorySchema } from "@/domain/place";
import { invalidRequest, providerFailure, providerMeta } from "@/server/api/responses";
import { externalPlacesUrl, getPlacesProvider } from "@/server/providers/pois";

export const runtime = "nodejs";

/** Lista separada por comas validada contra un enum. */
const csv = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).min(1));

const QuerySchema = z.object({
  bbox: BBoxStringSchema,
  /** Capas del mapa (tourism, food, lodging, transport). */
  layers: csv(MapLayerSchema).optional(),
  /** Categorías concretas; se suman a las de `layers`. */
  categories: csv(PlaceCategorySchema).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** GET /api/places?bbox=oeste,sur,este,norte&layers=tourism,food[&categories=museum][&limit=200] */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) return invalidRequest(parsed.error);

  const { bbox, layers, limit } = parsed.data;
  const categories = [
    ...new Set([
      ...(layers || parsed.data.categories ? [] : PlaceCategorySchema.options),
      ...categoriesForLayers(layers ?? []),
      ...(parsed.data.categories ?? []),
    ]),
  ];
  const selection = getPlacesProvider();
  try {
    const response = await selection.provider.searchByBBox({ bbox, categories, limit });
    return Response.json({
      results: response.places,
      provider: providerMeta(selection),
      fromCache: response.fromCache,
      warnings: response.warnings,
    });
  } catch (error) {
    const [w, s, e, n] = bbox;
    return providerFailure(error, externalPlacesUrl({ lat: (s + n) / 2, lng: (w + e) / 2 }));
  }
}
