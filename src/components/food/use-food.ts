"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { FoodQueryInput, FoodSearch } from "@/domain/food";
import { getJson, type ProviderMeta } from "@/lib/api-client";
import { foodQueryString } from "@/lib/food/labels";

export type FoodResponse = FoodSearch & {
  providers: { places: ProviderMeta; routing: ProviderMeta };
};

export const foodKey = (tripId: string) => ["food", tripId] as const;

/**
 * Sitios para comer en un momento del viaje. La clave incluye la hora y el sitio elegido de la
 * franja para volver a medir cuando el itinerario cambia.
 */
export function useFood(tripId: string, query: FoodQueryInput, version: string) {
  const search = foodQueryString(query);
  return useQuery({
    queryKey: [...foodKey(tripId), search, version],
    queryFn: ({ signal }) => getJson<FoodResponse>(`/api/trips/${tripId}/food?${search}`, signal),
    retry: false,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
