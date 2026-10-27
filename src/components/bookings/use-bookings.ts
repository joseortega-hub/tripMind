"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { BookingLink, BookingUpdate } from "@/domain/booking";
import type { Activity, Hotel, Trip } from "@/domain/trip";
import { ApiError, getJson, sendJson } from "@/lib/api-client";
import { type BudgetSummary, type OfferPrice, summarizeBudget } from "@/lib/booking/budget";
import type { ItineraryResponse } from "@/components/itinerary/use-itinerary";
import { itineraryKey } from "@/components/itinerary/use-itinerary";
import type { TicketMark } from "@/lib/map/layers";

/** Respuesta de `GET /api/trips/[id]/bookings` (proveedor de entradas y sus productos). */
export interface TicketsResponse {
  provider: { id: string; name: string; isDemo: boolean };
  status:
    | { status: "not_configured"; message: string }
    | { status: "available"; providerName: string; isDemo: boolean; isProposal: boolean };
  offers: Record<
    string,
    {
      placeId: string;
      link: BookingLink;
      priceFrom?: { amount: number; currency: string; retrievedAt: string };
      source: OfferPrice["source"];
      isDemo: boolean;
      isProposal?: boolean;
    }[]
  >;
}

export type BookingTarget = { target: "activity"; activityId: string } | { target: "hotel" };

export const ticketsKey = (tripId: string) => ["tickets", tripId] as const;

/** Actividades con lugar (visitas y comidas con restaurante): las que admiten reserva. */
export function bookableActivities(days: ItineraryResponse["days"]) {
  return days.flatMap((day) =>
    day.activities
      .filter((activity) => activity.place)
      .map((activity) => ({ activity, date: day.date })),
  );
}

/**
 * Reservas y presupuesto del viaje. Lo que anota el usuario va a Postgres (`PUT /bookings`); el
 * presupuesto se calcula con el itinerario en caché y el hotel del viaje.
 */
export function useBookings(trip: Trip, itinerary: ItineraryResponse) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string>();
  // Hotel tras guardar (el Server Component lo vuelve a pasar tras `router.refresh()`).
  const [hotel, setHotel] = useState<Hotel | undefined>();

  const tickets = useQuery({
    queryKey: ticketsKey(trip.id),
    queryFn: ({ signal }) => getJson<TicketsResponse>(`/api/trips/${trip.id}/bookings`, signal),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const save = useMutation({
    mutationFn: (change: BookingTarget & BookingUpdate) =>
      sendJson<{ itinerary?: ItineraryResponse; hotel?: Hotel }>(
        `/api/trips/${trip.id}/bookings`,
        "PUT",
        change,
      ),
    onMutate: () => setError(undefined),
    onSuccess: (data) => {
      if (data.itinerary) queryClient.setQueryData(itineraryKey(trip.id), data.itinerary);
      if (data.hotel) {
        setHotel(data.hotel);
        router.refresh();
      }
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError && failure.status !== 0
          ? `No se ha podido guardar la reserva: ${failure.message}`
          : failure.message,
      ),
  });

  const currentHotel =
    hotel && trip.hotel && hotel.id === trip.hotel.id && hotel.place?.id === trip.hotel.place?.id
      ? hotel
      : trip.hotel;

  const offerPrices = useMemo(() => {
    const prices = new Map<string, OfferPrice>();
    for (const [placeId, list] of Object.entries(tickets.data?.offers ?? {})) {
      const priced = list.find((offer) => offer.priceFrom);
      if (priced?.priceFrom) prices.set(placeId, { ...priced.priceFrom, source: priced.source });
    }
    return prices;
  }, [tickets.data]);

  const budget: BudgetSummary = useMemo(
    () => summarizeBudget({ ...trip, hotel: currentHotel, days: itinerary.days }, offerPrices),
    [trip, currentHotel, itinerary.days, offerPrices],
  );

  const marks = useMemo(() => {
    const map = new Map<string, TicketMark>();
    for (const { activity } of bookableActivities(itinerary.days)) {
      if (!map.has(activity.place!.id)) {
        map.set(activity.place!.id, {
          place: activity.place!,
          requirement: activity.bookingRequirement,
          status: activity.bookingStatus,
        });
      }
    }
    return map;
  }, [itinerary.days]);

  const providerLinks = (placeId: string): BookingLink[] =>
    (tickets.data?.offers[placeId] ?? []).map((offer) => offer.link);

  return {
    tickets,
    budget,
    marks,
    hotel: currentHotel,
    providerLinks,
    save: (target: BookingTarget, update: BookingUpdate, onDone?: () => void) =>
      save.mutate({ ...target, ...update }, { onSuccess: () => onDone?.() }),
    saving: save.isPending,
    savingTarget: save.isPending ? save.variables : undefined,
    error,
    findActivity: (placeId: string): { activity: Activity; date: string } | undefined =>
      bookableActivities(itinerary.days).find(({ activity }) => activity.place!.id === placeId),
  };
}

export type BookingsState = ReturnType<typeof useBookings>;
