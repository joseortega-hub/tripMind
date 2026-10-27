import { FreeTimeRequestSchema } from "@/domain/discover";
import { invalidRequest, providerFailure } from "@/server/api/responses";
import { readJsonBody, type TripRouteContext, withTrip } from "@/server/api/trip-route";
import { getHolidaysProvider } from "@/server/providers/holidays";
import { externalPlacesUrl, getPlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider } from "@/server/providers/routing";
import { freeTime } from "@/server/services/discover/free-time";

export const runtime = "nodejs";

const outsideTrip = () =>
  Response.json(
    { error: { code: "invalid_request", message: "Ese día no forma parte del viaje." } },
    { status: 400 },
  );

/**
 * POST /api/trips/[id]/free-time `{ origin, originLabel, date, start, minutes }` — "tengo N horas
 * libres": lugares que caben con trayectos a pie reales, duración estimada y horario del día.
 */
export async function POST(request: Request, context: TripRouteContext) {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const parsed = FreeTimeRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  return withTrip(context, async (trip) => {
    if (parsed.data.date < trip.startDate || parsed.data.date > trip.endDate) return outsideTrip();
    try {
      const result = await freeTime(trip, parsed.data, {
        places: getPlacesProvider(),
        routing: getRoutingProvider(),
        holidays: getHolidaysProvider(),
      });
      return Response.json(result);
    } catch (error) {
      return providerFailure(error, externalPlacesUrl(parsed.data.origin));
    }
  });
}
