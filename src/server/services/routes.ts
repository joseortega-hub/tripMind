import type { LatLng } from "@/domain/geo";
import {
  type ApproximateRoute,
  type RouteMode,
  type RouteResult,
  type RouteUnavailableReason,
  straightLineMeters,
  type StreetMode,
  type TravelMatrix,
} from "@/domain/route";
import { providerMeta } from "@/server/api/responses";
import type { ProviderSelection } from "@/server/providers/core/registry";
import { ProviderError, type ProviderInfo } from "@/server/providers/core/types";
import { getRoutingProvider, type RoutingProvider } from "@/server/providers/routing";
import { externalRouteLinks } from "@/server/providers/routing/links";
import { RouteNotFoundError } from "@/server/providers/routing/types";
import { getTransitProvider, type TransitProvider } from "@/server/providers/transit";

const MODE_NAMES: Record<RouteMode, string> = {
  walk: "a pie",
  car: "en coche",
  transit: "en transporte público",
};

const FAILURE_MESSAGES: Record<RouteMode, string> = {
  walk: "El servicio de rutas a pie no responde ahora mismo.",
  car: "El servicio de rutas en coche no responde ahora mismo.",
  transit: "El planificador de transporte público no responde ahora mismo.",
};

/**
 * Tramo "aproximado": línea recta (que el mapa dibuja discontinua) y enlaces externos con origen
 * y destino. Sin duración: no se estima un tiempo que ningún proveedor ha calculado.
 */
export function approximateRoute(
  mode: RouteMode,
  from: LatLng,
  to: LatLng,
  reason: RouteUnavailableReason,
  message: string,
): ApproximateRoute {
  return {
    quality: "approximate",
    mode,
    from,
    to,
    straightLineMeters: Math.round(straightLineMeters(from, to)),
    geometry: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    reason,
    message,
    externalLinks: externalRouteLinks(from, to, mode),
  };
}

/** Convierte un fallo de proveedor en tramo aproximado; los errores de programación se propagan. */
function fallback(error: unknown, mode: RouteMode, from: LatLng, to: LatLng): RouteResult {
  if (error instanceof RouteNotFoundError) {
    return approximateRoute(mode, from, to, error.reason, error.message);
  }
  if (error instanceof ProviderError) {
    console.warn(`[routes] ${error.providerId} (${MODE_NAMES[mode]}):`, error.message);
    return approximateRoute(mode, from, to, "provider_failed", FAILURE_MESSAGES[mode]);
  }
  throw error;
}

export interface CompareRoutesInput {
  from: LatLng;
  to: LatLng;
  modes: RouteMode[];
  /** Salida para el transporte público (ISO 8601 con zona). */
  departure: string;
}

export interface RouteServices {
  routing: ProviderSelection<RoutingProvider>;
  transit: ProviderSelection<TransitProvider>;
}

const defaultServices = (): RouteServices => ({
  routing: getRoutingProvider(),
  transit: getTransitProvider(),
});

/**
 * Compara modos para un trayecto. Cada modo es independiente: si uno falla, ese modo vuelve como
 * tramo aproximado con enlace externo y el resto se muestra igual.
 */
export async function compareRoutes(
  input: CompareRoutesInput,
  services: RouteServices = defaultServices(),
) {
  const { from, to } = input;
  const results = await Promise.all(
    input.modes.map(async (mode): Promise<RouteResult> => {
      try {
        if (mode === "transit") {
          return (await services.transit.provider.plan({ from, to, departure: input.departure }))
            .route;
        }
        return (await services.routing.provider.route({ from, to, mode })).route;
      } catch (error) {
        return fallback(error, mode, from, to);
      }
    }),
  );
  return {
    results,
    providers: {
      routing: providerMeta(services.routing as ProviderSelection<ProviderInfo>),
      transit: providerMeta(services.transit as ProviderSelection<ProviderInfo>),
    },
  };
}

/** Matriz de distancias en línea recta (siempre disponible; no es un tiempo de viaje). */
export function straightLineMatrix(origins: LatLng[], destinations: LatLng[]) {
  return origins.map((origin) =>
    destinations.map((destination) => Math.round(straightLineMeters(origin, destination))),
  );
}

/**
 * Matriz de tiempos (con caché en el proveedor) para el optimizador. Si el proveedor no puede
 * calcularla se devuelve `unavailable` con solo las distancias en línea recta.
 */
export async function travelMatrix(
  input: { origins: LatLng[]; destinations: LatLng[]; mode: StreetMode },
  routing: ProviderSelection<RoutingProvider> = getRoutingProvider(),
): Promise<TravelMatrix & { fromCache: boolean }> {
  const straight = straightLineMatrix(input.origins, input.destinations);
  try {
    const matrix = await routing.provider.matrix(input);
    return {
      mode: input.mode,
      quality: "routed",
      durationsSeconds: matrix.durationsSeconds,
      distancesMeters: matrix.distancesMeters,
      straightLineMeters: straight,
      source: matrix.source,
      isDemo: matrix.isDemo,
      fromCache: matrix.fromCache,
    };
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    if (!(error instanceof RouteNotFoundError)) {
      console.warn(`[matrix] ${error.providerId}:`, error.message);
    }
    return {
      mode: input.mode,
      quality: "unavailable",
      straightLineMeters: straight,
      message:
        error instanceof RouteNotFoundError
          ? error.message
          : "El servicio de rutas no responde ahora mismo: no hay tiempos de trayecto.",
      fromCache: false,
    };
  }
}
