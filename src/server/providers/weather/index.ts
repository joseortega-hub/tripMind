import { z } from "zod";
import { type DayForecast, DayForecastSchema } from "@/domain/calendar";
import type { LatLng } from "@/domain/geo";
import { straightLineMeters } from "@/domain/route";
import type { Source } from "@/domain/source";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig, type ProvidersConfig } from "../core/config";
import { type FetchLike, fetchJson, parseProviderResponse, userAgent } from "../core/http";
import { type ProviderSelection, selectProvider } from "../core/registry";
import { ProviderError, type ProviderInfo } from "../core/types";
import fixture from "./fixtures/open-meteo.json";

/** Días de previsión que da Open-Meteo (horizonte máximo). */
export const FORECAST_DAYS = 16;
export const OPEN_METEO_NAME = "Open-Meteo";

const DAILY = [
  "weather_code",
  "precipitation_probability_max",
  "precipitation_sum",
  "temperature_2m_max",
  "temperature_2m_min",
] as const;

const nums = z.array(z.number().nullable());
export const OpenMeteoResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
  daily: z.object({
    time: z.array(z.iso.date()),
    weather_code: nums.optional(),
    precipitation_probability_max: nums.optional(),
    precipitation_sum: nums.optional(),
    temperature_2m_max: nums.optional(),
    temperature_2m_min: nums.optional(),
  }),
});
export type OpenMeteoResponse = z.infer<typeof OpenMeteoResponseSchema>;

/** Coordenadas a 2 decimales (~1 km): consultas vecinas comparten caché. */
const round = (value: number) => Math.round(value * 100) / 100;

export function openMeteoUrl({ lat, lng }: LatLng) {
  const params = new URLSearchParams({
    latitude: String(round(lat)),
    longitude: String(round(lng)),
    daily: DAILY.join(","),
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/** Respuesta de Open-Meteo → previsión por día (los valores nulos se omiten, no se rellenan). */
export function mapOpenMeteo(
  response: OpenMeteoResponse,
  meta: { retrievedAt: string; isDemo: boolean },
): DayForecast[] {
  const source: Source = {
    name: OPEN_METEO_NAME,
    url: "https://open-meteo.com/",
    retrievedAt: meta.retrievedAt,
    license: "CC BY 4.0",
    attribution: "Datos meteorológicos de Open-Meteo.com",
  };
  const at = (values: (number | null)[] | undefined, index: number) => {
    const value = values?.[index];
    return value === null || value === undefined ? undefined : value;
  };
  return response.daily.time.map((date, index) => ({
    date,
    weatherCode: at(response.daily.weather_code, index),
    precipitationProbability: at(response.daily.precipitation_probability_max, index),
    precipitationMm: at(response.daily.precipitation_sum, index),
    temperatureMax: at(response.daily.temperature_2m_max, index),
    temperatureMin: at(response.daily.temperature_2m_min, index),
    source,
    isDemo: meta.isDemo,
  }));
}

export interface WeatherProvider extends ProviderInfo {
  /** Previsión de los próximos días en el punto (todo el horizonte del proveedor). */
  forecast(at: LatLng): Promise<DayForecast[]>;
}

const HOUR = 60 * 60 * 1000;

export function createRealWeatherProvider(deps: {
  userAgent: string;
  cache: CacheStore;
  fetch?: FetchLike;
}): WeatherProvider {
  return {
    id: "open-meteo",
    name: OPEN_METEO_NAME,
    isDemo: false,
    async forecast(at) {
      const url = openMeteoUrl(at);
      const { value } = await cached(
        deps.cache,
        {
          key: cacheKey("open-meteo", url),
          provider: "open-meteo",
          // La previsión se actualiza varias veces al día: 3 horas.
          ttlMs: 3 * HOUR,
          schema: z.array(DayForecastSchema),
        },
        async () => {
          const raw = await fetchJson(url, {
            providerId: "open-meteo",
            userAgent: deps.userAgent,
            fetch: deps.fetch,
          });
          return mapOpenMeteo(parseProviderResponse(OpenMeteoResponseSchema, raw, "open-meteo"), {
            retrievedAt: new Date().toISOString(),
            isDemo: false,
          });
        },
      );
      return value;
    },
  };
}

const recorded = fixture as unknown as { recordedAt: string; at: LatLng; response: unknown };

export const DEMO_WEATHER_COVERAGE =
  "La previsión de demostración solo cubre Madrid centro y los días en que se grabó.";

/** Demo: previsión real grabada para Madrid centro (sus fechas son las de la grabación). */
export function createDemoWeatherProvider(): WeatherProvider {
  return {
    id: "demo-weather",
    name: "Demostración (previsión grabada de Open-Meteo)",
    isDemo: true,
    async forecast(at) {
      if (straightLineMeters(at, recorded.at) > 15_000) {
        throw new ProviderError(DEMO_WEATHER_COVERAGE, "demo-weather", { status: 404 });
      }
      return mapOpenMeteo(OpenMeteoResponseSchema.parse(recorded.response), {
        retrievedAt: recorded.recordedAt,
        isDemo: true,
      });
    },
  };
}

/** Open-Meteo no pide clave (uso no comercial, atribución CC BY 4.0). */
export function getWeatherProvider(
  config: ProvidersConfig = getProvidersConfig(),
): ProviderSelection<WeatherProvider> {
  return selectProvider(config.mode, {
    missingConfig: [],
    real: () =>
      createRealWeatherProvider({
        userAgent: userAgent(config.contactEmail),
        cache: getCacheStore(),
      }),
    demo: createDemoWeatherProvider,
  });
}
