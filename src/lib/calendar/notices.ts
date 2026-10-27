import {
  type DayForecast,
  type NoticeImpact,
  type NoticeKind,
  type TripCalendar,
  type TripNotice,
} from "@/domain/calendar";
import type { LatLng } from "@/domain/geo";
import type { PlaceCategory } from "@/domain/place";
import { straightLineMeters } from "@/domain/route";
import type { Source } from "@/domain/source";
import type { ItineraryDay } from "@/domain/trip";

/** Visitas al aire libre (la lluvia o el calor las afectan; el modo lluvia propone cambiarlas). */
export const OUTDOOR_CATEGORIES: readonly PlaceCategory[] = ["park", "viewpoint", "monument"];
/** Lugares bajo techo que pueden sustituirlas. */
export const INDOOR_CATEGORIES: readonly PlaceCategory[] = [
  "museum",
  "gallery",
  "place_of_worship",
];

export const NOTICE_NAMES: Record<NoticeKind, string> = {
  holiday: "Festivo",
  event: "Evento",
  dst: "Cambio de hora",
  closure: "Cierre o cambio de horario",
  transport: "Transporte",
  weather: "Meteorología",
  booking: "Reserva o entrada",
};

export const IMPACT_NAMES: Record<NoticeImpact, string> = {
  opportunity: "Oportunidad",
  affects_plan: "Afecta al plan",
};

/** Lluvia probable: probabilidad ≥ 50 % o ≥ 1 mm previstos. */
export const isRainy = (day: DayForecast) =>
  (day.precipitationProbability ?? 0) >= 50 || (day.precipitationMm ?? 0) >= 1;
const isStormy = (day: DayForecast) => (day.weatherCode ?? 0) >= 95;
const isHot = (day: DayForecast) => (day.temperatureMax ?? 0) >= 35;

/** Distancia máxima para que un evento cuente como "junto a tu plan" ese día. */
const EVENT_NEAR_METERS = 1000;

const visitsOf = (day?: ItineraryDay) => (day?.activities ?? []).filter((a) => a.place);
const outdoorVisits = (day?: ItineraryDay) =>
  visitsOf(day).filter((a) => a.kind === "visit" && OUTDOOR_CATEGORIES.includes(a.place!.category));

const formatMm = (mm: number) => `${mm.toLocaleString("es-ES", { maximumFractionDigits: 1 })} mm`;

/**
 * Avisos del viaje (REQUISITOS §17) a partir del calendario del destino (festivos, cambio de
 * hora, eventos, previsión) y del itinerario (cierres y reservas). Cada aviso lleva su fuente y
 * si afecta al itinerario; no hay fuente de incidencias de transporte (T), así que no se generan.
 */
export function buildNotices(calendar: TripCalendar, days: readonly ItineraryDay[]): TripNotice[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const notices: TripNotice[] = [];
  const holidayDates = new Set<string>();

  for (const holiday of calendar.holidays) {
    holidayDates.add(holiday.date);
    const regional = holiday.regions.length > 0;
    notices.push({
      id: `holiday:${holiday.date}:${holiday.name}`,
      kind: "holiday",
      date: holiday.date,
      title: `Festivo: ${holiday.localName}`,
      detail:
        "Muchos comercios y museos pueden cerrar o cambiar horario." +
        (holiday.appliesToDestination === "maybe"
          ? ` Es festivo solo en algunas regiones (${holiday.regions.join(", ")}): comprueba si afecta a tu destino.`
          : regional
            ? " Festivo regional."
            : ""),
      impact: "affects_plan",
      affectsItinerary: visitsOf(byDate.get(holiday.date)).length > 0,
      source: holiday.source,
      isDemo: holiday.isDemo,
    });
  }

  const ianaSource: Source = {
    name: `Base de datos de zonas horarias IANA (${calendar.timeZone})`,
    url: "https://www.iana.org/time-zones",
    retrievedAt: calendar.retrievedAt,
  };
  for (const change of calendar.dst) {
    const verb = change.direction === "back" ? "se atrasan" : "se adelantan";
    notices.push({
      id: `dst:${change.date}`,
      kind: "dst",
      date: change.date,
      title: `Cambio de hora: a las ${change.from} ${verb} a las ${change.to}`,
      detail:
        `La madrugada de este día, a las ${change.from}, los relojes ${verb} a las ${change.to} ` +
        `(${change.offsetBefore} → ${change.offsetAfter}). Las horas del itinerario están en hora ` +
        "local y ya tienen en cuenta el cambio; revisa alarmas y horarios de transporte.",
      impact: "affects_plan",
      affectsItinerary: (byDate.get(change.date)?.activities.length ?? 0) > 0,
      source: ianaSource,
      isDemo: false,
    });
  }

  for (const event of calendar.events) {
    const stops = visitsOf(byDate.get(event.date));
    const venue = event.venue?.location;
    const near =
      venue !== undefined &&
      stops.some((a) => straightLineMeters(a.place!.location, venue) <= EVENT_NEAR_METERS);
    const cancelled = event.status === "cancelled" || event.status === "postponed";
    notices.push({
      id: `event:${event.id}`,
      kind: "event",
      date: event.date,
      title: `${cancelled ? "Cancelado o aplazado: " : ""}${event.name}`,
      detail: [
        event.time ? `${event.time} h` : undefined,
        event.venue ? [event.venue.name, event.venue.city].filter(Boolean).join(", ") : undefined,
        [event.category, event.genre].filter(Boolean).join(" · ") || undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      impact: "opportunity",
      affectsItinerary: near,
      location: venue,
      url: event.url,
      source: event.source,
      isDemo: event.isDemo,
    });
  }

  for (const day of calendar.forecast) {
    const parts: string[] = [];
    if (isStormy(day)) parts.push("Tormentas");
    else if (isRainy(day)) parts.push("Lluvia probable");
    if (isHot(day)) parts.push("Calor extremo");
    if (parts.length === 0) continue;
    const outdoor = outdoorVisits(byDate.get(day.date));
    const figures = [
      day.precipitationProbability !== undefined
        ? `${day.precipitationProbability} % de probabilidad`
        : undefined,
      day.precipitationMm ? formatMm(day.precipitationMm) : undefined,
      day.temperatureMax !== undefined ? `máx. ${Math.round(day.temperatureMax)} °C` : undefined,
    ].filter(Boolean);
    notices.push({
      id: `weather:${day.date}`,
      kind: "weather",
      date: day.date,
      title: `${parts.join(" y ")}${figures.length ? ` (${figures.join(", ")})` : ""}`,
      detail: outdoor.length
        ? `Tienes ${outdoor.length === 1 ? "1 visita" : `${outdoor.length} visitas`} al aire libre: el modo lluvia propone alternativas bajo techo.`
        : "Previsión: puede cambiar en los próximos días.",
      impact: "affects_plan",
      affectsItinerary: outdoor.length > 0,
      source: day.source,
      isDemo: day.isDemo,
    });
  }

  for (const day of days) {
    for (const activity of day.activities) {
      const place = activity.place;
      if (!place) continue;
      const planning = activity.planning;
      const itinerarySource: Source = {
        name: "Tu itinerario (horario según OpenStreetMap)",
        url: place.source.url,
        retrievedAt: place.source.retrievedAt,
      };
      if (planning?.openingStatus === "closed" || planning?.warnings.includes("closed_at_time")) {
        notices.push({
          id: `closure:${activity.id}`,
          kind: "closure",
          date: day.date,
          title: `Cerrado a esa hora: ${place.name}`,
          detail: activity.startTime
            ? `Programado a las ${activity.startTime}, fuera de su horario publicado.`
            : undefined,
          impact: "affects_plan",
          affectsItinerary: true,
          location: place.location,
          placeId: place.id,
          activityId: activity.id,
          source: itinerarySource,
          isDemo: place.isDemo,
        });
      } else if (
        holidayDates.has(day.date) &&
        activity.kind === "visit" &&
        planning?.openingStatus !== "open"
      ) {
        notices.push({
          id: `closure:${activity.id}`,
          kind: "closure",
          date: day.date,
          title: `Horario de festivo sin confirmar: ${place.name}`,
          detail: "La fuente no confirma cómo abre en festivo: compruébalo antes de ir.",
          impact: "affects_plan",
          affectsItinerary: true,
          location: place.location,
          placeId: place.id,
          activityId: activity.id,
          source: itinerarySource,
          isDemo: place.isDemo,
        });
      }

      const status = activity.bookingStatus;
      const userSource: Source = {
        name: "Tus anotaciones de reserva",
        retrievedAt: place.source.retrievedAt,
      };
      const at = activity.startTime ? ` a las ${activity.startTime}` : "";
      const booking =
        status === "booked" || status === "ticket_purchased"
          ? {
              title: `${status === "booked" ? "Reserva" : "Entrada"} anotada: ${place.name}${at}`,
              source: userSource,
            }
          : status === "cancelled"
            ? { title: `Reserva cancelada: ${place.name}`, source: userSource }
            : activity.bookingRequirement === "ticket_required"
              ? {
                  title: `Entrada necesaria, sin anotar: ${place.name}`,
                  source: {
                    name: "Etiquetas de OpenStreetMap del lugar",
                    url: place.source.url,
                    retrievedAt: place.source.retrievedAt,
                  },
                }
              : undefined;
      if (booking) {
        notices.push({
          id: `booking:${activity.id}`,
          kind: "booking",
          date: day.date,
          title: booking.title,
          detail: activity.bookingNote,
          impact: "affects_plan",
          affectsItinerary: true,
          location: place.location,
          placeId: place.id,
          activityId: activity.id,
          source: booking.source,
          isDemo: place.isDemo,
        });
      }
    }
  }
  return notices.sort((a, b) => a.date.localeCompare(b.date));
}

/** Avisos con ubicación (eventos, cierres, reservas): los que se dibujan en el mapa. */
export const locatedNotices = (notices: readonly TripNotice[]) =>
  notices.filter((notice): notice is TripNotice & { location: LatLng } => !!notice.location);
