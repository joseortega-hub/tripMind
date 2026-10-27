"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BBoxStringSchema } from "@/domain/geo";
import type { Place } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import { ApiError, getJson, postJson, type ProviderMeta } from "@/lib/api-client";
import { areaAround, PLACE_LAYERS } from "@/lib/map/layers";

export interface PlacesResponse {
  results: Place[];
  provider: ProviderMeta;
  warnings?: string[];
}

async function deleteFavorite(tripId: string, placeId: string) {
  let response: Response;
  try {
    response = await fetch(`/api/trips/${tripId}/favorites?${new URLSearchParams({ placeId })}`, {
      method: "DELETE",
    });
  } catch {
    throw new ApiError("Sin conexión con el servidor. Revisa tu conexión.", 0, "network");
  }
  if (!response.ok) throw new ApiError("No se ha podido quitar de guardados.", response.status);
}

/** Máximo de lugares que se piden a `/api/places` (el límite del endpoint). */
export const PLACES_LIMIT = 500;

/** Lugares del destino (capas 1–3), estaciones y paradas (capa 4) y guardados (capa 7). */
export function useTripPlaces(trip: Trip, { transport }: { transport: boolean }) {
  const area = areaAround(trip.destination.location);
  const queryClient = useQueryClient();
  const favoritesKey = ["favorites", trip.id] as const;
  const [favoriteError, setFavoriteError] = useState<string>();

  const places = useQuery({
    queryKey: ["places", area],
    queryFn: ({ signal }) =>
      getJson<PlacesResponse>(
        `/api/places?${new URLSearchParams({ bbox: area, layers: PLACE_LAYERS.join(","), limit: String(PLACES_LIMIT) })}`,
        signal,
      ),
    retry: false,
  });

  // Hay muchas paradas: se piden solo al activar la capa de transporte.
  const stops = useQuery({
    queryKey: ["places", area, "transport"],
    enabled: transport,
    queryFn: ({ signal }) =>
      getJson<PlacesResponse>(
        `/api/places?${new URLSearchParams({ bbox: area, layers: "transport", limit: String(PLACES_LIMIT) })}`,
        signal,
      ),
    retry: false,
  });

  const favorites = useQuery({
    queryKey: favoritesKey,
    queryFn: ({ signal }) =>
      getJson<{ results: Place[] }>(`/api/trips/${trip.id}/favorites`, signal).then(
        (body) => body.results,
      ),
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: ({ place, save }: { place: Place; save: boolean }) =>
      save
        ? postJson(`/api/trips/${trip.id}/favorites`, { place })
        : deleteFavorite(trip.id, place.id),
    // Actualización optimista: el corazón cambia al instante y se revierte si falla.
    onMutate: async ({ place, save }) => {
      setFavoriteError(undefined);
      await queryClient.cancelQueries({ queryKey: favoritesKey });
      const previous = queryClient.getQueryData<Place[]>(favoritesKey);
      queryClient.setQueryData<Place[]>(favoritesKey, (current = []) =>
        save
          ? [place, ...current.filter((item) => item.id !== place.id)]
          : current.filter((item) => item.id !== place.id),
      );
      return { previous };
    },
    onError: (error, { save }, context) => {
      queryClient.setQueryData(favoritesKey, context?.previous);
      setFavoriteError(
        error instanceof ApiError && error.status !== 0
          ? save
            ? "No se ha podido guardar el lugar. Inténtalo de nuevo."
            : "No se ha podido quitar de guardados. Inténtalo de nuevo."
          : error.message,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: favoritesKey }),
  });

  return {
    area: BBoxStringSchema.parse(area),
    places,
    stops,
    favorites,
    toggleFavorite: (place: Place, save: boolean) => toggle.mutate({ place, save }),
    favoritePending: toggle.isPending,
    favoriteError,
  };
}
