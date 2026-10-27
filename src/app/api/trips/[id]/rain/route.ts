import { z } from "zod";
import { IsoDateSchema } from "@/domain/preferences";
import { invalidRequest, providerFailure } from "@/server/api/responses";
import { type TripRouteContext, withTrip } from "@/server/api/trip-route";
import { getHolidaysProvider } from "@/server/providers/holidays";
import { externalPlacesUrl, getPlacesProvider } from "@/server/providers/pois";
import { getWeatherProvider } from "@/server/providers/weather";
import { rainAlternatives } from "@/server/services/discover/rain";

export const runtime = "nodejs";

const QuerySchema = z.object({ date: IsoDateSchema });

/**
 * GET /api/trips/[id]/rain?date=YYYY-MM-DD — modo lluvia: previsión del día (Open-Meteo, solo en
 * su horizonte) y lugares bajo techo cercanos para cada visita al aire libre de ese día.
 */
export async function GET(request: Request, context: TripRouteContext) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalidRequest(parsed.error);
  return withTrip(context, async (trip) => {
    if (parsed.data.date < trip.startDate || parsed.data.date > trip.endDate) {
      return Response.json(
        { error: { code: "invalid_request", message: "Ese día no forma parte del viaje." } },
        { status: 400 },
      );
    }
    try {
      return Response.json(
        await rainAlternatives(trip, parsed.data.date, {
          places: getPlacesProvider(),
          weather: getWeatherProvider(),
          holidays: getHolidaysProvider(),
        }),
      );
    } catch (error) {
      return providerFailure(error, externalPlacesUrl(trip.destination.location));
    }
  });
}
