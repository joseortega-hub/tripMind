"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { itineraryKey, type ItineraryResponse } from "@/components/itinerary/use-itinerary";
import type { LodgingFilters, LodgingSearch } from "@/domain/lodging";
import type { Place } from "@/domain/place";
import type { Hotel } from "@/domain/trip";
import { ApiError, getJson, type ProviderMeta, sendJson } from "@/lib/api-client";

export type LodgingResponse = LodgingSearch & {
  providers: { places: ProviderMeta; routing: ProviderMeta };
};

export const lodgingKey = (tripId: string) => ["lodging", tripId] as const;

export function lodgingQueryString(filters: LodgingFilters) {
  const params = new URLSearchParams();
  if (filters.types.length > 0) params.set("types", [...filters.types].sort().join(","));
  if (filters.minStars !== undefined) params.set("minStars", String(filters.minStars));
  if (filters.accessibleOnly) params.set("accessible", "1");
  return params.toString();
}

/** Alojamientos comparados para los filtros dados (los pesos se aplican en el cliente). */
export function useLodging(tripId: string, filters: LodgingFilters) {
  const query = lodgingQueryString(filters);
  return useQuery({
    queryKey: [...lodgingKey(tripId), query],
    queryFn: ({ signal }) =>
      getJson<LodgingResponse>(`/api/trips/${tripId}/lodging${query ? `?${query}` : ""}`, signal),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

interface ChooseHotelResponse {
  hotel?: Hotel;
  itinerary: ItineraryResponse | null;
  regenerated: boolean;
  itineraryError?: string;
}

/**
 * Elige o cambia el hotel (§14A). Al terminar se actualiza el itinerario recalculado, se vuelven
 * a medir los alojamientos y se refresca el viaje (preguntas "desde tu hotel", rutas, mapa).
 */
export function useChooseHotel(tripId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string }>();

  const mutation = useMutation({
    mutationFn: (place: Place) =>
      sendJson<ChooseHotelResponse>(`/api/trips/${tripId}/hotel`, "PUT", { place }),
    onMutate: () => setMessage(undefined),
    onSuccess: (data, place) => {
      if (data.itinerary) queryClient.setQueryData(itineraryKey(tripId), data.itinerary);
      void queryClient.invalidateQueries({ queryKey: lodgingKey(tripId) });
      router.refresh();
      setMessage(
        data.itineraryError
          ? { tone: "error", text: data.itineraryError }
          : {
              tone: "success",
              text: data.regenerated
                ? `${place.name} es ahora tu hotel. El itinerario se ha recalculado desde aquí; lo bloqueado sigue en su día y hora.`
                : `${place.name} es ahora tu hotel: los trayectos y el plan saldrán desde aquí.`,
            },
      );
    },
    onError: (error) =>
      setMessage({
        tone: "error",
        text:
          error instanceof ApiError && error.status !== 0
            ? `No se ha podido cambiar el hotel: ${error.message}`
            : error.message,
      }),
  });

  return {
    choose: (place: Place) => mutation.mutate(place),
    pendingId: mutation.isPending ? mutation.variables?.id : undefined,
    message,
  };
}
