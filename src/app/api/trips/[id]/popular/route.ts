import { BBoxStringSchema } from "@/domain/geo";
import { categoriesForLayers } from "@/domain/place";
import { areaAround } from "@/lib/map/layers";
import { providerFailure, providerMeta } from "@/server/api/responses";
import { type TripRouteContext, withTrip } from "@/server/api/trip-route";
import type { ProviderSelection } from "@/server/providers/core/registry";
import type { ProviderInfo } from "@/server/providers/core/types";
import { getPageviewsProvider } from "@/server/providers/pageviews";
import { externalPlacesUrl, getPlacesProvider } from "@/server/providers/pois";
import { popularPlaces } from "@/server/services/discover/popular";

export const runtime = "nodejs";

/**
 * GET /api/trips/[id]/popular — "Popular ahora" según visitas en Wikipedia (Wikimedia Pageviews)
 * de los lugares turísticos del destino con artículo; nunca "tendencia en redes".
 */
export async function GET(_request: Request, context: TripRouteContext) {
  return withTrip(context, async (trip) => {
    const places = getPlacesProvider();
    const pageviews = getPageviewsProvider();
    let found: Awaited<ReturnType<typeof places.provider.searchByBBox>>;
    try {
      found = await places.provider.searchByBBox({
        bbox: BBoxStringSchema.parse(areaAround(trip.destination.location)),
        categories: categoriesForLayers(["tourism"]),
        limit: 500,
      });
    } catch (error) {
      return providerFailure(error, externalPlacesUrl(trip.destination.location));
    }
    const result = await popularPlaces(found.places, pageviews);
    return Response.json({
      ...result,
      places: found.places.filter((place) =>
        result.results.some((entry) => entry.placeId === place.id),
      ),
      provider: providerMeta(pageviews as ProviderSelection<ProviderInfo>),
    });
  });
}
