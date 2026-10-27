import { z } from "zod";
import { LatLngSchema } from "./geo";
import { IsoDateSchema, TimeOfDaySchema } from "./preferences";
import { ExternalDataSchema, SourceSchema } from "./source";

/**
 * Tipos de aviso del calendario del viaje (REQUISITOS §17). Cada uno tiene letra y color propios
 * (insignia con letra + color + nombre accesible, nunca solo color).
 */
export const NoticeKindSchema = z.enum([
  "holiday",
  "event",
  "dst",
  "closure",
  "transport",
  "weather",
  "booking",
]);
export type NoticeKind = z.infer<typeof NoticeKindSchema>;
export const NOTICE_KINDS = NoticeKindSchema.options;

export const NOTICE_LETTERS: Record<NoticeKind, string> = {
  holiday: "F",
  event: "E",
  dst: "H",
  closure: "C",
  transport: "T",
  weather: "M",
  booking: "R",
};

/** Oportunidad (algo que ver) o algo que afecta al plan (cierres, cortes, lluvia…). */
export const NoticeImpactSchema = z.enum(["opportunity", "affects_plan"]);
export type NoticeImpact = z.infer<typeof NoticeImpactSchema>;

/** Aviso de un día del viaje, con su fuente (externa o derivada del propio itinerario). */
export const TripNoticeSchema = z.object({
  id: z.string().min(1),
  kind: NoticeKindSchema,
  date: IsoDateSchema,
  title: z.string().min(1),
  detail: z.string().optional(),
  impact: NoticeImpactSchema,
  /** Toca algo del itinerario (un día con visitas, una actividad concreta…). */
  affectsItinerary: z.boolean(),
  location: LatLngSchema.optional(),
  placeId: z.string().optional(),
  activityId: z.string().optional(),
  /** Enlace de la fuente (p. ej. la ficha del evento en Ticketmaster). */
  url: z.url().optional(),
  source: SourceSchema,
  isDemo: z.boolean(),
});
export type TripNotice = z.infer<typeof TripNoticeSchema>;

/** Festivo de Nager.Date. `regions` son códigos ISO 3166-2 ("ES-MD"); vacío = nacional. */
export const HolidaySchema = ExternalDataSchema.extend({
  date: IsoDateSchema,
  name: z.string().min(1),
  localName: z.string().min(1),
  regions: z.array(z.string()).default([]),
  /** yes = nacional o de la región del destino; maybe = de otras regiones o región desconocida. */
  appliesToDestination: z.enum(["yes", "maybe", "no"]),
  types: z.array(z.string()).default([]),
});
export type Holiday = z.infer<typeof HolidaySchema>;

/** Cambio de hora (base de datos IANA) en un día del viaje, en hora local del destino. */
export const DstChangeSchema = z.object({
  date: IsoDateSchema,
  timeZone: z.string().min(1),
  /** Hora local que marcan los relojes justo antes del cambio ("03:00"). */
  from: TimeOfDaySchema,
  /** Hora a la que pasan ("02:00"). */
  to: TimeOfDaySchema,
  direction: z.enum(["back", "forward"]),
  offsetBefore: z.string(),
  offsetAfter: z.string(),
});
export type DstChange = z.infer<typeof DstChangeSchema>;

/** Previsión diaria de Open-Meteo (solo dentro de su horizonte de ~16 días). */
export const DayForecastSchema = ExternalDataSchema.extend({
  date: IsoDateSchema,
  /** Código WMO del tiempo. */
  weatherCode: z.number().int().optional(),
  precipitationProbability: z.number().min(0).max(100).optional(),
  precipitationMm: z.number().min(0).optional(),
  temperatureMax: z.number().optional(),
  temperatureMin: z.number().optional(),
});
export type DayForecast = z.infer<typeof DayForecastSchema>;

/** Evento con fecha de un proveedor (Ticketmaster Discovery). Nunca se inventan. */
export const TripEventSchema = ExternalDataSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  date: IsoDateSchema,
  time: TimeOfDaySchema.optional(),
  url: z.url(),
  category: z.string().optional(),
  genre: z.string().optional(),
  /** Estado de la fuente: onsale, offsale, cancelled, postponed, rescheduled… */
  status: z.string().optional(),
  venue: z
    .object({
      name: z.string().min(1),
      city: z.string().optional(),
      location: LatLngSchema.optional(),
    })
    .optional(),
  imageUrl: z.url().optional(),
});
export type TripEvent = z.infer<typeof TripEventSchema>;

/** Estado de una fuente del calendario para la UI. */
export const FeedStatusSchema = z.object({
  status: z.enum(["ok", "not_configured", "unavailable", "unsupported", "out_of_range"]),
  message: z.string().optional(),
  providerName: z.string(),
  isDemo: z.boolean(),
  /** Enlace externo para investigar por cuenta propia (fallo o sin configurar). */
  externalUrl: z.url().optional(),
});
export type FeedStatus = z.infer<typeof FeedStatusSchema>;

export const TripCalendarSchema = z.object({
  /** Momento del cálculo (fuente de lo derivado localmente, como el cambio de hora). */
  retrievedAt: z.iso.datetime(),
  timeZone: z.string(),
  holidays: z.array(HolidaySchema),
  holidaysStatus: FeedStatusSchema,
  dst: z.array(DstChangeSchema),
  events: z.array(TripEventSchema),
  eventsStatus: FeedStatusSchema,
  forecast: z.array(DayForecastSchema),
  weatherStatus: FeedStatusSchema,
  /** Último día que cubre la previsión (horizonte del proveedor). */
  forecastHorizon: IsoDateSchema.optional(),
});
export type TripCalendar = z.infer<typeof TripCalendarSchema>;
