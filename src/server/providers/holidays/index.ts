import { z } from "zod";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig, type ProvidersConfig } from "../core/config";
import { type FetchLike, fetchJson, parseProviderResponse, userAgent } from "../core/http";
import { type ProviderSelection, selectProvider } from "../core/registry";
import { ProviderError, type ProviderInfo } from "../core/types";
import fixture from "./fixtures/nager.json";

/** Festivo tal como lo publica Nager.Date (`/api/v3/PublicHolidays/{año}/{país}`). */
export const NagerHolidaySchema = z.object({
  date: z.iso.date(),
  localName: z.string(),
  name: z.string(),
  countryCode: z.string(),
  global: z.boolean(),
  counties: z.array(z.string()).nullable().optional(),
  types: z.array(z.string()).default([]),
});
export type NagerHoliday = z.infer<typeof NagerHolidaySchema>;
const NagerResponseSchema = z.array(NagerHolidaySchema);

export const NAGER_NAME = "Nager.Date";
export const NAGER_URL = "https://date.nager.at";

/** El país no está en Nager.Date (o la demo no lo tiene grabado). */
export class HolidaysUnsupportedError extends ProviderError {
  constructor(providerId: string, message: string) {
    super(message, providerId);
    this.name = "HolidaysUnsupportedError";
  }
}

export interface HolidaysProvider extends ProviderInfo {
  publicHolidays(
    year: number,
    countryCode: string,
  ): Promise<{ holidays: NagerHoliday[]; retrievedAt: string }>;
}

export const nagerUrl = (year: number, countryCode: string) =>
  `${NAGER_URL}/api/v3/PublicHolidays/${year}/${countryCode.toUpperCase()}`;

const DAY = 24 * 60 * 60 * 1000;
const CachedSchema = z.object({ holidays: NagerResponseSchema, retrievedAt: z.iso.datetime() });

export function createRealHolidaysProvider(deps: {
  userAgent: string;
  cache: CacheStore;
  fetch?: FetchLike;
}): HolidaysProvider {
  return {
    id: "nager-date",
    name: NAGER_NAME,
    isDemo: false,
    async publicHolidays(year, countryCode) {
      const { value } = await cached(
        deps.cache,
        {
          key: cacheKey("nager", year, countryCode.toUpperCase()),
          provider: "nager-date",
          // El calendario oficial de un año cambia poco: 30 días.
          ttlMs: 30 * DAY,
          schema: CachedSchema,
        },
        async () => {
          let raw: unknown;
          try {
            raw = await fetchJson(nagerUrl(year, countryCode), {
              providerId: "nager-date",
              userAgent: deps.userAgent,
              fetch: deps.fetch,
            });
          } catch (error) {
            // 404: país sin datos en Nager.Date; 204 (sin cuerpo) llega como respuesta no válida.
            if (error instanceof ProviderError && error.options.status === 404) {
              throw new HolidaysUnsupportedError(
                "nager-date",
                `Nager.Date no tiene festivos de ${countryCode.toUpperCase()}.`,
              );
            }
            throw error;
          }
          return {
            holidays: parseProviderResponse(NagerResponseSchema, raw, "nager-date"),
            retrievedAt: new Date().toISOString(),
          };
        },
      );
      return value;
    },
  };
}

const recorded = fixture as unknown as {
  recordedAt: string;
  responses: Record<string, unknown>;
};

/** Demo: respuestas reales grabadas de Nager.Date (España, 2026 y 2027). */
export function createDemoHolidaysProvider(): HolidaysProvider {
  return {
    id: "demo-holidays",
    name: "Demostración (respuestas grabadas de Nager.Date)",
    isDemo: true,
    async publicHolidays(year, countryCode) {
      const hit = recorded.responses[`${countryCode.toUpperCase()}-${year}`];
      if (!hit) {
        throw new HolidaysUnsupportedError(
          "demo-holidays",
          `La demostración solo tiene festivos grabados de España (2026 y 2027).`,
        );
      }
      return {
        holidays: NagerResponseSchema.parse(hit),
        retrievedAt: recorded.recordedAt,
      };
    },
  };
}

/** Nager.Date no pide clave; con `PROVIDERS_MODE=demo` se usan los festivos grabados. */
export function getHolidaysProvider(
  config: ProvidersConfig = getProvidersConfig(),
): ProviderSelection<HolidaysProvider> {
  return selectProvider(config.mode, {
    missingConfig: [],
    real: () =>
      createRealHolidaysProvider({
        userAgent: userAgent(config.contactEmail),
        cache: getCacheStore(),
      }),
    demo: createDemoHolidaysProvider,
  });
}
