import type { LatLng } from "@/domain/geo";
import type { ActivityWarning, DaySlot, OpeningStatus, UnscheduledPlace } from "@/domain/itinerary";
import { toMinutes } from "@/domain/preferences";
import type { Activity, ItineraryDay, Leg } from "@/domain/trip";

export const SLOT_LABELS: Record<DaySlot, string> = {
  breakfast: "Desayuno",
  morning: "Mañana",
  lunch: "Comida",
  afternoon: "Tarde",
  dinner: "Cena",
  night: "Noche",
};

/** Etiqueta de fiabilidad del horario (siempre visible, docs/DISENO.md). */
export const OPENING_LABELS: Record<
  OpeningStatus,
  { text: string; tone: "ok" | "pending" | "bad" }
> = {
  open: { text: "Abierto a esa hora según OSM", tone: "ok" },
  closed: { text: "Cerrado a esa hora", tone: "bad" },
  uncertain: { text: "Horario pendiente de confirmar", tone: "pending" },
  no_hours: { text: "Sin horario publicado: pendiente de confirmar", tone: "pending" },
  unparsable: { text: "Horario sin verificar: pendiente de confirmar", tone: "pending" },
};

export const WARNING_LABELS: Record<ActivityWarning, string> = {
  closed_at_time: "El horario publicado dice que está cerrado a esta hora.",
  late_arrival: "Con el trayecto anterior no llegas a la hora fijada.",
  ends_after_day: "El día termina después de tu hora de fin.",
  meal_out_of_window: "La comida queda fuera de su franja habitual.",
};

export const UNSCHEDULED_LABELS: Record<UnscheduledPlace["reason"], string> = {
  closed: "cerrado todos los días del viaje",
  no_time: "no cabía en el horario",
  no_room: "ya había bastantes visitas",
};

export const addMinutes = (time: string, minutes: number) => {
  const total = Math.min(toMinutes(time) + minutes, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Tramo que llega a una actividad (o el de vuelta al hotel si `activityId` es undefined). */
export const legTo = (day: ItineraryDay, activityId: string | undefined) =>
  day.legs.find((leg) => leg.toActivityId === activityId);

/** Minutos que ocupa un tramo en el plan (duración del proveedor + margen reservado). */
export const legPlannedMinutes = (leg: Leg) =>
  (leg.durationMinutes ?? 0) + (leg.reservedMinutes ?? 0);

/** Visitas con lugar en orden: los números de la lista coinciden con los del mapa. */
export function numberedStops(day: ItineraryDay | undefined) {
  const stops: { id: string; number: number; name: string; location: LatLng; placeId: string }[] =
    [];
  for (const activity of day?.activities ?? []) {
    if (!activity.place) continue;
    stops.push({
      id: activity.id,
      number: stops.length + 1,
      name: activity.place.name,
      location: activity.place.location,
      placeId: activity.place.id,
    });
  }
  return stops;
}

export function dayTravelMinutes(day: ItineraryDay) {
  return day.legs.reduce((sum, leg) => sum + legPlannedMinutes(leg), 0);
}

export const isVisit = (activity: Activity) => activity.place !== undefined;
