"use client";

import { Utensils } from "lucide-react";
import { useId, useState } from "react";
import type { useItinerary } from "@/components/itinerary/use-itinerary";
import { Button } from "@/components/ui/button";
import type { Place } from "@/domain/place";
import { formatDay } from "@/lib/trip-labels";

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner"]);

/**
 * Desde la ficha de un sitio de la capa de gastronomía: lo pone en una franja de comida del
 * itinerario (día y comida) y se recalculan los tramos de ese día.
 */
export function UseForMeal({
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
  const days = itinerary.data.days;
  const meals = days.flatMap((day, index) =>
    day.activities
      .filter((a) => a.kind === "meal" && MEAL_SLOTS.has(a.planning?.slot ?? ""))
      .map((activity) => ({ day, index, activity })),
  );
  const chosen = meals.find((meal) => meal.activity.place?.id === place.id);
  // Por defecto, la primera comida sin sitio del día mostrado (comida y cena antes que desayuno).
  const order = ["lunch", "dinner", "breakfast"];
  const candidates = meals
    .filter((meal) => meal.day.date === preferredDate)
    .sort(
      (a, b) =>
        order.indexOf(a.activity.planning?.slot ?? "") -
        order.indexOf(b.activity.planning?.slot ?? ""),
    );
  const initial = candidates.find((meal) => !meal.activity.place) ?? candidates[0] ?? meals[0];
  const [activityId, setActivityId] = useState(initial?.activity.id ?? "");
  const [submitted, setSubmitted] = useState(false);
  const selectId = useId();
  const Heading = `h${headingLevel}` as const;
  if (meals.length === 0) return null;

  return (
    <section aria-labelledby={`${selectId}-title`} className="flex flex-col gap-2 border-t pt-4">
      <Heading id={`${selectId}-title`} className="text-sm font-semibold">
        Comer aquí
      </Heading>
      {chosen ? (
        <p className="text-sm" role="status">
          Elegido para la {chosen.activity.title.toLowerCase()} del día {chosen.index + 1} (
          {formatDay(chosen.day.date)}, {chosen.activity.startTime}).
          {submitted ? " Las horas y los trayectos del día se han recalculado." : ""}
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            itinerary.edit({ op: "set_meal_place", activityId, place });
          }}
        >
          <label htmlFor={selectId} className="flex flex-col gap-1 text-xs font-medium">
            Comida del itinerario
            <select
              id={selectId}
              value={activityId}
              onChange={(event) => setActivityId(event.target.value)}
              className="border-input bg-background focus-visible:ring-ring/50 min-h-11 rounded-md border px-2 text-sm outline-none focus-visible:ring-3"
            >
              {meals.map(({ index, activity }) => (
                <option key={activity.id} value={activity.id}>
                  Día {index + 1} · {activity.title} {activity.startTime}
                  {activity.place ? ` (ahora: ${activity.place.name})` : ""}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" className="min-h-11" disabled={itinerary.editing}>
            <Utensils aria-hidden />
            Elegir para esta comida
          </Button>
        </form>
      )}
      <p className="text-muted-foreground text-xs">
        El horario de OSM puede no estar al día: confírmalo antes de ir. Añadirlo no reserva mesa.
      </p>
    </section>
  );
}
