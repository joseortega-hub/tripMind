"use client";

import { CalendarPlus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Place } from "@/domain/place";
import type { ItineraryDay } from "@/domain/trip";
import { formatDay } from "@/lib/trip-labels";
import type { useItinerary } from "./use-itinerary";

/** "Añadir al itinerario" desde la ficha de un lugar: elige el día y se recalcula ese día. */
export function AddToItinerary({
  place,
  itinerary,
  preferredDate,
  headingLevel = 3,
}: {
  place: Place;
  itinerary: ReturnType<typeof useItinerary>;
  preferredDate?: string;
  headingLevel?: 3 | 4;
}) {
  const days: ItineraryDay[] = itinerary.data.days;
  const planned = days.find((day) => day.activities.some((a) => a.place?.id === place.id));
  const fallback = days.find((day) => !day.isRestDay)?.date ?? days[0]?.date;
  const [date, setDate] = useState(preferredDate ?? fallback ?? "");
  const selectId = useId();
  const Heading = `h${headingLevel}` as const;
  if (days.length === 0) return null;

  const dayNumber = (value: string) => days.findIndex((day) => day.date === value) + 1;

  return (
    <section aria-labelledby={`${selectId}-title`} className="flex flex-col gap-2 border-t pt-4">
      <Heading id={`${selectId}-title`} className="text-sm font-semibold">
        Itinerario
      </Heading>
      {planned ? (
        <p className="text-sm" role="status">
          Está en el plan del día {dayNumber(planned.date)} ({formatDay(planned.date)}).
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            itinerary.edit({ op: "add", date, place });
          }}
        >
          <label htmlFor={selectId} className="flex flex-col gap-1 text-xs font-medium">
            Día
            <select
              id={selectId}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="border-input bg-background focus-visible:ring-ring/50 min-h-11 rounded-md border px-2 text-sm outline-none focus-visible:ring-3"
            >
              {days.map((day, index) => (
                <option key={day.date} value={day.date}>
                  Día {index + 1} · {formatDay(day.date)}
                  {day.isRestDay ? " (libre)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" className="min-h-11" disabled={itinerary.editing}>
            <CalendarPlus aria-hidden />
            Añadir al itinerario
          </Button>
        </form>
      )}
    </section>
  );
}
