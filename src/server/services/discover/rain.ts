import type { DayForecast, FeedStatus } from "@/domain/calendar";
import type { RainAlternative, RainSwap } from "@/domain/discover";
import { BBoxStringSchema } from "@/domain/geo";
import { toMinutes } from "@/domain/preferences";
import { straightLineMeters } from "@/domain/route";
import type { Trip } from "@/domain/trip";
import { INDOOR_CATEGORIES, OUTDOOR_CATEGORIES } from "@/lib/calendar/notices";
import { areaAround } from "@/lib/map/layers";
import type { ProviderSelection } from "@/server/providers/core/registry";
import type { HolidaysProvider } from "@/server/providers/holidays";
import type { PlacesProvider } from "@/server/providers/pois";
import type { WeatherProvider } from "@/server/providers/weather";
import { tripForecast } from "../calendar";
import { holidayMap, holidaysForTrip } from "../calendar/holidays";
import { dayOpening, statusFor } from "../itinerary/opening";

/** Distancia máxima en línea recta de la alternativa a la visita que sustituye. */
const MAX_METERS = 1500;
const PER_ACTIVITY = 3;

export interface RainDeps {
  places: ProviderSelection<PlacesProvider>;
  weather: ProviderSelection<WeatherProvider>;
  holidays: ProviderSelection<HolidaysProvider>;
}

export interface RainResult {
  date: string;
  forecast?: DayForecast;
  weatherStatus: FeedStatus;
  swaps: RainSwap[];
}

/**
 * Modo lluvia (REQUISITOS §14D): previsión real del día (solo dentro del horizonte de Open-Meteo)
 * y, para cada visita al aire libre, lugares bajo techo cercanos que no estén confirmados como
 * cerrados a esa hora. Sustituir es decisión del usuario.
 */
export async function rainAlternatives(
  trip: Trip,
  date: string,
  deps: RainDeps,
): Promise<RainResult> {
  const weather = await tripForecast({ ...trip, startDate: date, endDate: date }, deps.weather);
  const day = trip.days.find((d) => d.date === date);
  const outdoor = (day?.activities ?? []).filter(
    (a) => a.kind === "visit" && a.place && OUTDOOR_CATEGORIES.includes(a.place.category),
  );
  const base = { date, forecast: weather.forecast[0], weatherStatus: weather.status };
  if (outdoor.length === 0) return { ...base, swaps: [] };

  const search = await deps.places.provider.searchByBBox({
    bbox: BBoxStringSchema.parse(areaAround(trip.hotel?.location ?? trip.destination.location)),
    categories: [...INDOOR_CATEGORIES],
    limit: 500,
  });
  const planned = new Set(
    trip.days.flatMap((d) => d.activities.flatMap((a) => (a.place ? [a.place.id] : []))),
  );
  const holidays = holidayMap((await holidaysForTrip(trip, deps.holidays)).holidays);
  const context = {
    countryCode: trip.destination.countryCode,
    location: trip.destination.location,
    holidays,
  };
  const rank = { open: 0, uncertain: 1, no_hours: 2, unparsable: 3, closed: 4 } as const;

  const swaps = outdoor.map((activity) => {
    const place = activity.place!;
    const start = activity.startTime ? toMinutes(activity.startTime) : undefined;
    const alternatives: RainAlternative[] = search.places
      .filter((candidate) => !planned.has(candidate.id))
      .map((candidate) => ({
        place: candidate,
        straightLineMeters: Math.round(straightLineMeters(place.location, candidate.location)),
        openingStatus:
          start === undefined
            ? ("uncertain" as const)
            : statusFor(
                dayOpening(candidate.openingHours, date, context),
                start,
                start + activity.durationMinutes,
              ),
      }))
      .filter((alt) => alt.straightLineMeters <= MAX_METERS && alt.openingStatus !== "closed")
      .sort(
        (a, b) =>
          rank[a.openingStatus] - rank[b.openingStatus] ||
          a.straightLineMeters - b.straightLineMeters,
      )
      .slice(0, PER_ACTIVITY);
    return { activityId: activity.id, alternatives };
  });
  return { ...base, swaps };
}
