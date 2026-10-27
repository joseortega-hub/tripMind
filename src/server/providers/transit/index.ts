import type { LatLng } from "@/domain/geo";
import { type RoutedRoute, RoutedRouteSchema } from "@/domain/route";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig, type ProvidersConfig } from "../core/config";
import { type FetchLike, userAgent } from "../core/http";
import { type ProviderSelection, selectProvider } from "../core/registry";
import type { ProviderInfo } from "../core/types";
import { pointKey, RouteNotFoundError } from "../routing/types";
import fixture from "./fixtures/transitous.json";
import {
  mapTransitousPlan,
  type TransitQuery,
  TransitousPlanSchema,
  TRANSITOUS_NAME,
  transitousPlan,
} from "./transitous";

export type { TransitQuery } from "./transitous";

export interface TransitProvider extends ProviderInfo {
  plan(query: TransitQuery): Promise<{ route: RoutedRoute; fromCache: boolean }>;
}

const HOUR = 60 * 60 * 1000;

/** Redondea la salida a 5 minutos para que consultas casi iguales compartan caché. */
export function roundDeparture(departure: string) {
  const step = 5 * 60 * 1000;
  return new Date(Math.round(Date.parse(departure) / step) * step).toISOString();
}

export function createRealTransitProvider(deps: {
  userAgent: string;
  cache: CacheStore;
  fetch?: FetchLike;
}): TransitProvider {
  return {
    id: "transitous",
    name: TRANSITOUS_NAME,
    isDemo: false,
    async plan(query) {
      const departure = roundDeparture(query.departure);
      // Los horarios cambian (y Transitous pide uso ligero): caché de 6 horas.
      const { value, fromCache } = await cached(
        deps.cache,
        {
          key: cacheKey("transitous", pointKey(query.from), pointKey(query.to), departure),
          provider: "transitous",
          ttlMs: 6 * HOUR,
          schema: RoutedRouteSchema,
        },
        () => transitousPlan({ ...query, departure }, deps),
      );
      return { route: value, fromCache };
    },
  };
}

interface RecordedPlan {
  from: LatLng;
  to: LatLng;
  departure: string;
  response: unknown;
}

const recorded = fixture as unknown as { recordedAt: string; plans: RecordedPlan[] };

export const DEMO_TRANSIT_COVERAGE =
  "Los datos de demostración de transporte público solo incluyen trayectos grabados desde el hotel de demostración en Madrid centro.";

/**
 * Demo: devuelve el plan grabado para ese origen y destino con sus horas reales de grabación
 * (la UI muestra la fecha de los datos), no unas horas ajustadas a la fecha pedida.
 */
export function createDemoTransitProvider(): TransitProvider {
  return {
    id: "demo-transit",
    name: "Demostración (respuestas grabadas de Transitous)",
    isDemo: true,
    async plan(query) {
      const hit = recorded.plans.find(
        (plan) =>
          pointKey(plan.from) === pointKey(query.from) && pointKey(plan.to) === pointKey(query.to),
      );
      if (!hit) throw new RouteNotFoundError(DEMO_TRANSIT_COVERAGE, "demo-transit", "no_coverage");
      const route = mapTransitousPlan(
        TransitousPlanSchema.parse(hit.response),
        { ...query, departure: hit.departure },
        { retrievedAt: recorded.recordedAt, isDemo: true },
      );
      return { route, fromCache: false };
    },
  };
}

/** Transitous pide un User-Agent con contacto (CONTACT_EMAIL) y uso no comercial. */
export function getTransitProvider(
  config: ProvidersConfig = getProvidersConfig(),
): ProviderSelection<TransitProvider> {
  return selectProvider(config.mode, {
    missingConfig: config.contactEmail ? [] : ["CONTACT_EMAIL"],
    real: () =>
      createRealTransitProvider({
        userAgent: userAgent(config.contactEmail),
        cache: getCacheStore(),
      }),
    demo: createDemoTransitProvider,
  });
}
