import { z } from "zod";
import { invalidRequest, providerFailure } from "@/server/api/responses";
import { LatLngStringSchema } from "@/server/api/route-params";
import { externalPlacesUrl } from "@/server/providers/pois";
import { nearbyStops } from "@/server/services/nearby";

export const runtime = "nodejs";

const QuerySchema = z.object({ at: LatLngStringSchema });

/** GET /api/transit/nearby?at=lat,lng → estaciones y paradas cercanas con su tiempo a pie. */
export async function GET(request: Request) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalidRequest(parsed.error);
  try {
    return Response.json(await nearbyStops(parsed.data.at));
  } catch (error) {
    return providerFailure(error, externalPlacesUrl(parsed.data.at));
  }
}
