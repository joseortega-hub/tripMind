import type { DayForecast, FeedStatus, TripCalendar, TripEvent } from "@/domain/calendar";
import type { Trip } from "@/domain/trip";
import { dstChanges } from "@/lib/calendar/time";
import type { ProviderSelection } from "@/server/providers/core/registry";
import { ProviderError } from "@/server/providers/core/types";
import { type EventsProvider, getEventsProvider } from "@/server/providers/events";
import { getHolidaysProvider, type HolidaysProvider } from "@/server/providers/holidays";
import { getWeatherProvider, type WeatherProvider } from "@/server/providers/weather";
import { timeZoneAt } from "../time-zone";
import { holidaysForTrip } from "./holidays";

export interface CalendarDeps {
  holidays: ProviderSelection<HolidaysProvider>;
  weather: ProviderSelection<WeatherProvider>;
  events: EventsProvider;
}

export const defaultCalendarDeps = (): CalendarDeps => ({
  holidays: getHolidaysProvider(),
  weather: getWeatherProvider(),
  events: getEventsProvider(),
});

/** Radio de búsqueda de eventos alrededor del destino. */
export const EVENTS_RADIUS_KM = 10;

/** Búsqueda web para investigar por cuenta propia (enlace de búsqueda, no un dato). */
const ticketmasterSearch = (city: string) =>
  `https://www.google.com/search?${new URLSearchParams({ q: `eventos ${city}` })}`;

export async function tripEvents(
  trip: Pick<Trip, "destination" | "startDate" | "endDate">,
  provider: EventsProvider,
): Promise<{ events: TripEvent[]; status: FeedStatus }> {
  const base = { providerName: provider.name, isDemo: provider.isDemo };
  if (!provider.configured) {
    return {
      events: [],
      status: { ...base, status: "not_configured", message: provider.message },
    };
  }
  try {
    const events = await provider.search({
      at: trip.destination.location,
      radiusKm: EVENTS_RADIUS_KM,
      startDate: trip.startDate,
      endDate: trip.endDate,
    });
    return { events, status: { ...base, status: "ok" } };
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    console.warn("[calendar] eventos:", error.message);
    return {
      events: [],
      status: {
        ...base,
        status: "unavailable",
        message: "Ticketmaster no responde ahora mismo.",
        externalUrl: ticketmasterSearch(trip.destination.name),
      },
    };
  }
}

/** Previsión de los días del viaje que caen dentro del horizonte del proveedor. */
export async function tripForecast(
  trip: Pick<Trip, "destination" | "startDate" | "endDate">,
  selection: ProviderSelection<WeatherProvider>,
): Promise<{ forecast: DayForecast[]; status: FeedStatus; horizon?: string }> {
  const base = { providerName: selection.provider.name, isDemo: selection.isDemo };
  let all: DayForecast[];
  try {
    all = await selection.provider.forecast(trip.destination.location);
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    console.warn("[calendar] tiempo:", error.message);
    return {
      forecast: [],
      status: {
        ...base,
        status: "unavailable",
        message:
          error.options.status === 404 ? error.message : "Open-Meteo no responde ahora mismo.",
        externalUrl: "https://open-meteo.com/",
      },
    };
  }
  const horizon = all.at(-1)?.date;
  const forecast = all.filter((day) => day.date >= trip.startDate && day.date <= trip.endDate);
  if (forecast.length === 0) {
    const past = horizon !== undefined && trip.endDate < (all[0]?.date ?? "");
    return {
      forecast,
      horizon,
      status: {
        ...base,
        status: "out_of_range",
        message: past
          ? "El viaje ya ha pasado: no hay previsión."
          : `La previsión solo llega ${horizon ? `hasta el ${shortDate(horizon)}` : "a unos 16 días vista"}: vuelve más cerca del viaje.`,
      },
    };
  }
  const first = forecast[0]!.date;
  const last = forecast.at(-1)!.date;
  const missing = [
    first > trip.startDate ? "los días ya pasados no tienen previsión" : undefined,
    last < trip.endDate ? `la previsión llega hasta el ${shortDate(last)}` : undefined,
  ].filter(Boolean);
  return {
    forecast,
    horizon,
    status: {
      ...base,
      status: "ok",
      message: missing.length
        ? `Del ${shortDate(first)} al ${shortDate(last)}; ${missing.join(" y ")}.`
        : undefined,
    },
  };
}

/** "2026-11-11" → "11/11" para los mensajes. */
const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Calendario del viaje: festivos, cambios de hora, eventos y previsión (fuentes externas). */
export async function buildCalendar(
  trip: Pick<Trip, "destination" | "startDate" | "endDate">,
  deps: CalendarDeps = defaultCalendarDeps(),
): Promise<TripCalendar> {
  const timeZone = timeZoneAt(trip.destination.location);
  const [holidays, events, weather] = await Promise.all([
    holidaysForTrip(trip, deps.holidays),
    tripEvents(trip, deps.events),
    tripForecast(trip, deps.weather),
  ]);
  return {
    retrievedAt: new Date().toISOString(),
    timeZone,
    holidays: holidays.holidays,
    holidaysStatus: holidays.status,
    dst: dstChanges(timeZone, trip.startDate, trip.endDate),
    events: events.events,
    eventsStatus: events.status,
    forecast: weather.forecast,
    weatherStatus: weather.status,
    forecastHorizon: weather.horizon,
  };
}
