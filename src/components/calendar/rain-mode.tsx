"use client";

import { useQuery } from "@tanstack/react-query";
import { CloudRain, RotateCw, Umbrella } from "lucide-react";
import { useId, useState } from "react";
import type { useItinerary } from "@/components/itinerary/use-itinerary";
import { DataSource } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import type { DayForecast, FeedStatus } from "@/domain/calendar";
import type { RainSwap } from "@/domain/discover";
import type { Place } from "@/domain/place";
import type { ItineraryDay } from "@/domain/trip";
import { getJson } from "@/lib/api-client";
import { isRainy, OUTDOOR_CATEGORIES } from "@/lib/calendar/notices";
import { OPENING_LABELS } from "@/lib/itinerary-labels";
import { CATEGORY_LABELS } from "@/lib/map/layers";
import { formatDistance } from "@/lib/route-labels";
import { formatDay } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";

interface RainResponse {
  date: string;
  forecast?: DayForecast;
  weatherStatus: FeedStatus;
  swaps: RainSwap[];
}

/**
 * Modo lluvia (REQUISITOS §14D) para el día elegido: solo se destaca con previsión real de
 * Open-Meteo dentro de su horizonte; las alternativas bajo techo se pueden consultar siempre y
 * sustituir es decisión del usuario.
 */
export function RainMode({
  tripId,
  day,
  forecast,
  itinerary,
  onSelectPlace,
  headingLevel = 3,
}: {
  tripId: string;
  day: ItineraryDay;
  /** Previsión del día, si está dentro del horizonte. */
  forecast?: DayForecast;
  itinerary: ReturnType<typeof useItinerary>;
  onSelectPlace: (place: Place) => void;
  headingLevel?: 2 | 3;
}) {
  const headingId = useId();
  const Heading = `h${headingLevel + 1}` as "h3" | "h4";
  const outdoor = day.activities.filter(
    (a) => a.kind === "visit" && a.place && OUTDOOR_CATEGORIES.includes(a.place.category),
  );
  const rainy = forecast ? isRainy(forecast) : false;
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["rain", tripId, day.date, outdoor.map((a) => a.id).join(",")],
    queryFn: ({ signal }) =>
      getJson<RainResponse>(`/api/trips/${tripId}/rain?date=${day.date}`, signal),
    enabled: open,
    retry: false,
  });
  if (outdoor.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="rain-mode"
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        rainy && "border-notice-weather/60 bg-notice-weather/5",
      )}
    >
      <div className="flex items-start gap-2">
        {rainy ? (
          <CloudRain className="text-notice-weather mt-0.5 size-5 shrink-0" aria-hidden />
        ) : (
          <Umbrella className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
        )}
        <div className="flex flex-col gap-0.5">
          <Heading id={headingId} className="text-sm font-semibold">
            {rainy ? `Lluvia prevista el ${formatDay(day.date)}` : "Modo lluvia"}
          </Heading>
          <p className="text-muted-foreground text-xs">
            {rainy && forecast
              ? `${forecast.precipitationProbability ?? "?"} % de probabilidad${
                  forecast.precipitationMm ? `, ${forecast.precipitationMm} mm` : ""
                }. Tienes ${outdoor.length === 1 ? "1 visita" : `${outdoor.length} visitas`} al aire libre.`
              : forecast
                ? `Sin lluvia prevista este día. Si cambia, aquí tienes alternativas bajo techo para tus ${outdoor.length === 1 ? "visita" : `${outdoor.length} visitas`} al aire libre.`
                : `Aún no hay previsión para este día. Puedes ver alternativas bajo techo para tus ${outdoor.length === 1 ? "visita" : `${outdoor.length} visitas`} al aire libre.`}
          </p>
          {forecast ? <DataSource source={forecast.source} isDemo={forecast.isDemo} /> : null}
        </div>
      </div>
      {!open ? (
        <Button
          variant={rainy ? "cta" : "outline"}
          size="sm"
          className="min-h-11 self-start"
          onClick={() => setOpen(true)}
        >
          <Umbrella aria-hidden />
          Ver alternativas bajo techo
        </Button>
      ) : query.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Buscando lugares bajo techo cerca…
        </p>
      ) : query.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-destructive">No se han podido buscar alternativas.</span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => query.refetch()}>
            <RotateCw aria-hidden />
            Reintentar
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {outdoor.map((activity) => {
            const swap = query.data?.swaps.find((s) => s.activityId === activity.id);
            return (
              <li key={activity.id} className="flex flex-col gap-1.5">
                <p className="text-sm">
                  En lugar de <span className="font-medium">{activity.title}</span>
                  {activity.startTime ? ` (${activity.startTime})` : ""}:
                </p>
                {swap && swap.alternatives.length > 0 ? (
                  <ul className="flex flex-col gap-1.5 pl-3">
                    {swap.alternatives.map((alt) => (
                      <li
                        key={alt.place.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          className="focus-visible:ring-ring/50 min-h-11 text-left text-sm outline-none focus-visible:ring-3"
                          onClick={() => onSelectPlace(alt.place)}
                        >
                          <span className="text-primary font-medium underline-offset-2 hover:underline">
                            {alt.place.name}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            {CATEGORY_LABELS[alt.place.category]}, a{" "}
                            {formatDistance(alt.straightLineMeters)} en línea recta.{" "}
                            {OPENING_LABELS[alt.openingStatus].text}
                          </span>
                        </button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          disabled={itinerary.editing}
                          onClick={() =>
                            itinerary.edit({
                              op: "replace",
                              activityId: activity.id,
                              place: alt.place,
                            })
                          }
                        >
                          Sustituir
                          <span className="sr-only">
                            {" "}
                            {activity.title} por {alt.place.name}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground pl-3 text-xs">
                    No hay lugares bajo techo a menos de 1,5 km que no estén cerrados a esa hora.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
