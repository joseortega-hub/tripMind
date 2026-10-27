import type { FoodMoment, FoodReference } from "@/domain/food";
import type { DaySlot } from "@/domain/itinerary";
import { type Pace, toMinutes } from "@/domain/preferences";
import type { Activity, Trip } from "@/domain/trip";

/**
 * Hora y duración por defecto de cada momento cuando el día no tiene esa franja (la merienda
 * nunca la tiene). Son las horas típicas de las franjas del itinerario, no datos de una fuente.
 */
export const MOMENT_DEFAULTS: Record<
  FoodMoment,
  { time: string; duration: (pace: Pace) => number; slot?: DaySlot }
> = {
  breakfast: { time: "09:00", duration: () => 30, slot: "breakfast" },
  lunch: { time: "14:00", duration: (pace) => pace.lunchMinutes, slot: "lunch" },
  snack: { time: "17:30", duration: () => 45 },
  dinner: { time: "21:00", duration: () => 90, slot: "dinner" },
};

export interface MealContext {
  /** Minutos desde las 00:00 locales. */
  start: number;
  duration: number;
  meal?: Activity;
  references: FoodReference[];
}

const located = (activity: Activity) => activity.place !== undefined;

const reference = (key: "previous" | "next", activity: Activity): FoodReference => ({
  key,
  name: activity.place!.name,
  location: activity.place!.location,
  activityId: activity.id,
  time: activity.startTime,
});

/**
 * Dónde y cuándo se come: la franja de comida del día (si existe) con la actividad con lugar
 * anterior y la siguiente, más el hotel. Sin franja se usa la hora típica del momento y las
 * actividades de antes y después de esa hora. Sin nada de eso, el centro del destino.
 */
export function mealContext(trip: Trip, date: string, moment: FoodMoment): MealContext {
  const defaults = MOMENT_DEFAULTS[moment];
  const activities = trip.days.find((day) => day.date === date)?.activities ?? [];
  const meal = defaults.slot
    ? activities.find(
        (activity) => activity.kind === "meal" && activity.planning?.slot === defaults.slot,
      )
    : undefined;
  const start = toMinutes(meal?.startTime ?? defaults.time);
  const duration = meal?.durationMinutes ?? defaults.duration(trip.pace);

  let before: Activity[];
  let after: Activity[];
  if (meal) {
    const index = activities.indexOf(meal);
    before = activities.slice(0, index);
    after = activities.slice(index + 1);
  } else {
    const startOf = (activity: Activity) =>
      activity.startTime ? toMinutes(activity.startTime) : Number.POSITIVE_INFINITY;
    before = activities.filter((activity) => startOf(activity) < start);
    after = activities.filter((activity) => startOf(activity) >= start);
  }
  const previous = before.filter(located).at(-1);
  const next = after.find(located);

  const references: FoodReference[] = [];
  if (next) references.push(reference("next", next));
  if (previous) references.push(reference("previous", previous));
  if (trip.hotel) {
    references.push({ key: "hotel", name: trip.hotel.name, location: trip.hotel.location });
  }
  if (references.length === 0) {
    references.push({
      key: "center",
      name: trip.destination.name,
      location: trip.destination.location,
    });
  }
  return { start, duration, meal, references };
}
