"use client";

import { useQuery } from "@tanstack/react-query";
import type { LatLng } from "@/domain/geo";
import type { Place } from "@/domain/place";
import type { RouteResult } from "@/domain/route";
import type { Source } from "@/domain/source";
import { getJson, postJson, type ProviderMeta } from "@/lib/api-client";

export interface RoutesResponse {
  results: RouteResult[];
  providers: { routing: ProviderMeta; transit: ProviderMeta };
  departure: string;
  timeZone: string;
}

export interface NearbyStop {
  place: Place;
  straightLineMeters: number;
  walk?: { durationMinutes: number; distanceMeters?: number };
}

export interface NearbyResponse {
  radiusMeters: number;
  stops: NearbyStop[];
  walkSource?: Source;
  walkIsDemo?: boolean;
  walkNotice?: string;
  warnings?: string[];
  providers: { places: ProviderMeta; routing: ProviderMeta };
}

export interface WalkableResponse {
  maxMinutes: number;
  quality: "routed" | "unavailable";
  message?: string;
  results: { id: string; durationMinutes: number; distanceMeters?: number }[];
  source?: Source;
  isDemo?: boolean;
  provider: ProviderMeta;
}

const coord = ({ lat, lng }: LatLng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

/** Comparador de modos (transporte público, a pie, coche) para un trayecto. */
export function useRouteComparison(
  input: { from: LatLng; to: LatLng; date: string; time: string } | undefined,
) {
  return useQuery({
    queryKey: [
      "routes",
      input && coord(input.from),
      input && coord(input.to),
      input?.date,
      input?.time,
    ],
    enabled: Boolean(input),
    queryFn: ({ signal }) =>
      getJson<RoutesResponse>(
        `/api/routes?${new URLSearchParams({
          from: coord(input!.from),
          to: coord(input!.to),
          modes: "transit,walk,car",
          date: input!.date,
          time: input!.time,
        })}`,
        signal,
      ),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
}

/** "¿Hay metro cerca?": estaciones y paradas a ~800 m con su tiempo a pie. */
export function useNearbyStops(at: LatLng | undefined) {
  return useQuery({
    queryKey: ["nearby", at && coord(at)],
    enabled: Boolean(at),
    queryFn: ({ signal }) =>
      getJson<NearbyResponse>(
        `/api/transit/nearby?${new URLSearchParams({ at: coord(at!) })}`,
        signal,
      ),
    retry: false,
    staleTime: 30 * 60 * 1000,
  });
}

/** "¿Qué puedo hacer a pie?": de `targets`, los que están a ≤ `maxMinutes` andando. */
export function useWalkable(
  origin: LatLng | undefined,
  maxMinutes: number,
  targets: { id: string; location: LatLng }[],
) {
  const ids = targets.map((target) => target.id).join("|");
  return useQuery({
    queryKey: ["walkable", origin && coord(origin), maxMinutes, ids],
    enabled: Boolean(origin) && targets.length > 0,
    queryFn: () =>
      postJson<WalkableResponse>("/api/routes/walkable", { origin, maxMinutes, targets }),
    retry: false,
    staleTime: 30 * 60 * 1000,
  });
}
