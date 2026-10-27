import { z } from "zod";
import {
  FoodDietSchema,
  FoodMomentSchema,
  FoodNearSchema,
  FoodQuerySchema,
  FoodStyleSchema,
} from "@/domain";
import { isTripId } from "@/domain/trip";
import { invalidRequest, providerFailure, providerMeta } from "@/server/api/responses";
import type { ProviderSelection } from "@/server/providers/core/registry";
import type { ProviderInfo } from "@/server/providers/core/types";
import { getFoodRatingsProvider } from "@/server/providers/food";
import { externalPlacesUrl, getPlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider } from "@/server/providers/routing";
import { FoodUnavailableError, searchFood } from "@/server/services/food";
import { tripDates } from "@/server/services/itinerary/plan";
import { getTrip } from "@/server/services/trips";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const notFound = () =>
  Response.json({ error: { code: "not_found", message: "El viaje no existe." } }, { status: 404 });

const flag = z
  .enum(["0", "1", "true", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");

const QuerySchema = z.object({
  date: z.string(),
  moment: FoodMomentSchema,
  near: FoodNearSchema.optional(),
  cuisine: z.string().optional(),
  diet: FoodDietSchema.optional(),
  terrace: flag,
  maxMinutes: z.coerce.number().optional(),
  style: FoodStyleSchema.optional(),
});

/**
 * GET /api/trips/[id]/food?date=YYYY-MM-DD&moment=breakfast|lunch|snack|dinner[&near=next|previous|hotel]
 * [&cuisine=spanish&diet=vegetarian|vegan&terrace=1&maxMinutes=5-30&style=local|quick] — sitios de
 * OSM para una comida del viaje, abiertos a esa hora según OSM, con tiempo a pie a la actividad
 * anterior/siguiente y al hotel. Sin precios, valoraciones ni menús inventados.
 */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isTripId(id)) return notFound();
  const url = new URL(request.url);
  const raw = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!raw.success) return invalidRequest(raw.error);
  const parsed = FoodQuerySchema.safeParse(raw.data);
  if (!parsed.success) return invalidRequest(parsed.error);

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
  if (!tripDates(trip.startDate, trip.endDate).includes(parsed.data.date)) {
    return Response.json(
      { error: { code: "invalid_request", message: "Ese día no forma parte del viaje." } },
      { status: 400 },
    );
  }

  const places = getPlacesProvider();
  const routing = getRoutingProvider();
  try {
    const result = await searchFood(trip, parsed.data, {
      places,
      routing,
      ratings: getFoodRatingsProvider(),
    });
    return Response.json({
      ...result,
      providers: {
        places: providerMeta(places as ProviderSelection<ProviderInfo>),
        routing: providerMeta(routing as ProviderSelection<ProviderInfo>),
      },
    });
  } catch (error) {
    if (error instanceof FoodUnavailableError) {
      return providerFailure(error, externalPlacesUrl(error.at));
    }
    throw error;
  }
}
