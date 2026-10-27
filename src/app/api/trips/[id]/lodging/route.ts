import { z } from "zod";
import { LodgingFiltersSchema, LodgingTypeSchema } from "@/domain";
import { isTripId } from "@/domain/trip";
import { invalidRequest, providerFailure, providerMeta } from "@/server/api/responses";
import type { ProviderSelection } from "@/server/providers/core/registry";
import type { ProviderInfo } from "@/server/providers/core/types";
import { getPlacesProvider, externalPlacesUrl } from "@/server/providers/pois";
import { getRoutingProvider } from "@/server/providers/routing";
import { getLodgingPriceProvider } from "@/server/providers/lodging";
import { LodgingUnavailableError, searchLodging } from "@/server/services/lodging";
import { getTrip } from "@/server/services/trips";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const notFound = () =>
  Response.json({ error: { code: "not_found", message: "El viaje no existe." } }, { status: 404 });

const QuerySchema = z.object({
  types: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").filter(Boolean) : []))
    .pipe(z.array(LodgingTypeSchema)),
  minStars: z.coerce.number().int().min(1).max(5).optional(),
  accessible: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

/**
 * GET /api/trips/[id]/lodging[?types=hotel,hostel&minStars=3&accessible=1] — alojamientos de OSM
 * de la zona con distancia y tiempo a pie a los puntos clave del viaje y a la estación más
 * cercana. Sin precios ni valoraciones (no hay proveedor autorizado).
 */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isTripId(id)) return notFound();
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return invalidRequest(parsed.error);
  const filters = LodgingFiltersSchema.parse({
    types: parsed.data.types,
    minStars: parsed.data.minStars,
    accessibleOnly: parsed.data.accessible,
  });

  let trip: Awaited<ReturnType<typeof getTrip>>;
  try {
    trip = await getTrip(id);
  } catch (error) {
    console.error("[api] viaje no disponible:", error);
    return Response.json(
      {
        error: {
          code: "storage_unavailable",
          message: "No se ha podido leer el viaje. Inténtalo de nuevo en unos segundos.",
        },
      },
      { status: 503 },
    );
  }
  if (!trip) return notFound();

  const places = getPlacesProvider();
  const routing = getRoutingProvider();
  try {
    const result = await searchLodging(trip, filters, {
      places,
      routing,
      prices: getLodgingPriceProvider(),
    });
    return Response.json({
      ...result,
      providers: {
        places: providerMeta(places as ProviderSelection<ProviderInfo>),
        routing: providerMeta(routing as ProviderSelection<ProviderInfo>),
      },
    });
  } catch (error) {
    if (error instanceof LodgingUnavailableError) {
      return providerFailure(error, externalPlacesUrl(error.at));
    }
    throw error;
  }
}
