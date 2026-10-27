"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { TripCalendar } from "@/domain/calendar";
import type { ItineraryDay } from "@/domain/trip";
import { getJson } from "@/lib/api-client";
import {
  DEFAULT_NOTICE_FILTERS,
  filtersStorageKey,
  type NoticeFilters,
  readStoredFilters,
} from "@/lib/calendar/filters";
import { buildNotices } from "@/lib/calendar/notices";

export const calendarKey = (tripId: string) => ["calendar", tripId] as const;

/** Calendario del destino (festivos, cambio de hora, eventos, previsión) y avisos del viaje. */
export function useTripCalendar(tripId: string, days: readonly ItineraryDay[]) {
  const query = useQuery({
    queryKey: calendarKey(tripId),
    queryFn: ({ signal }) => getJson<TripCalendar>(`/api/trips/${tripId}/calendar`, signal),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const notices = useMemo(
    () => (query.data ? buildNotices(query.data, days) : []),
    [query.data, days],
  );
  return { query, calendar: query.data, notices };
}

/**
 * Filtros de avisos recordados por viaje (localStorage). Se leen tras montar para no romper la
 * hidratación; si el almacenamiento no está disponible, se usan sin guardar.
 */
export function useNoticeFilters(tripId: string) {
  const [filters, setFilters] = useState<NoticeFilters>(DEFAULT_NOTICE_FILTERS);
  const key = filtersStorageKey(tripId);
  useEffect(() => {
    try {
      setFilters(readStoredFilters(window.localStorage.getItem(key)));
    } catch {
      // Sin almacenamiento: filtros por defecto.
    }
  }, [key]);
  const update = useCallback(
    (change: Partial<NoticeFilters>) =>
      setFilters((current) => {
        const next = { ...current, ...change };
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Se aplican aunque no se puedan recordar.
        }
        return next;
      }),
    [key],
  );
  return { filters, update, reset: () => update(DEFAULT_NOTICE_FILTERS) };
}

const subscribeNothing = () => () => {};

/** Zona horaria del navegador (solo en el cliente; en el servidor, `undefined`). */
export function useUserTimeZone(): string | undefined {
  return useSyncExternalStore(
    subscribeNothing,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => undefined,
  );
}
