"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ItineraryEdit, ItineraryMeta } from "@/domain/itinerary";
import type { ItineraryDay } from "@/domain/trip";
import { ApiError, getJson, sendJson } from "@/lib/api-client";

export interface ItineraryResponse {
  days: ItineraryDay[];
  meta?: ItineraryMeta;
}

export const itineraryKey = (tripId: string) => ["itinerary", tripId] as const;

/** Reordenación optimista: la lista cambia al instante y el servidor devuelve las horas nuevas. */
function applyLocally(data: ItineraryResponse, edit: ItineraryEdit): ItineraryResponse {
  if (edit.op !== "move" && edit.op !== "remove") return data;
  const days = data.days.map((day) => ({ ...day, activities: [...day.activities] }));
  const source = days.find((day) => day.activities.some((a) => a.id === edit.activityId));
  if (!source) return data;
  const index = source.activities.findIndex((a) => a.id === edit.activityId);
  const [activity] = source.activities.splice(index, 1);
  if (edit.op === "move" && activity) {
    days.find((day) => day.date === edit.date)?.activities.splice(edit.position, 0, activity);
  }
  return { ...data, days };
}

export function useItinerary(tripId: string, initial: ItineraryResponse) {
  const queryClient = useQueryClient();
  const key = itineraryKey(tripId);
  const [error, setError] = useState<string>();

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getJson<ItineraryResponse>(`/api/trips/${tripId}/itinerary`, signal),
    initialData: initial,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const generate = useMutation({
    mutationFn: () => sendJson<ItineraryResponse>(`/api/trips/${tripId}/itinerary`, "POST"),
    onMutate: () => setError(undefined),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onError: (failure) =>
      setError(
        failure instanceof ApiError && failure.status !== 0
          ? `No se ha podido generar el itinerario: ${failure.message}`
          : failure.message,
      ),
  });

  const edit = useMutation({
    mutationFn: (change: ItineraryEdit) =>
      sendJson<ItineraryResponse>(`/api/trips/${tripId}/itinerary`, "PATCH", change),
    onMutate: async (change) => {
      setError(undefined);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ItineraryResponse>(key);
      if (previous) queryClient.setQueryData(key, applyLocally(previous, change));
      return { previous };
    },
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onError: (failure, _change, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      setError(
        failure instanceof ApiError && failure.status !== 0
          ? `No se ha podido guardar el cambio: ${failure.message}`
          : failure.message,
      );
    },
  });

  return {
    data: query.data,
    generate: () => generate.mutate(),
    generating: generate.isPending,
    edit: (change: ItineraryEdit) => edit.mutate(change),
    editing: edit.isPending,
    externalUrl: generate.error instanceof ApiError ? generate.error.externalUrl : undefined,
    error,
  };
}
