import { z } from "zod";
import { PlaceSchema } from "./place";
import { IsoDateSchema, TimeOfDaySchema } from "./preferences";
import { SourceSchema } from "./source";

/**
 * Estado del horario de una actividad en su franja (librería `opening_hours` sobre la etiqueta
 * OSM). Solo `open` es confirmado; sin horario o con uno que no se puede interpretar queda
 * "pendiente de confirmar". Nunca se programa una visita en un horario confirmado cerrado.
 */
export const OpeningStatusSchema = z.enum([
  /** El horario de la fuente dice que está abierto toda la franja. */
  "open",
  /** El horario dice que está cerrado (solo puede aparecer tras una edición manual). */
  "closed",
  /** El horario existe pero su estado es incierto ("unknown", comentarios, festivos). */
  "uncertain",
  /** La fuente no publica horario. */
  "no_hours",
  /** El horario no sigue la sintaxis de OSM y no se puede evaluar. */
  "unparsable",
]);
export type OpeningStatus = z.infer<typeof OpeningStatusSchema>;

/** Franjas del día (REQUISITOS §9): solo estructura. */
export const DaySlotSchema = z.enum([
  "breakfast",
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "night",
]);
export type DaySlot = z.infer<typeof DaySlotSchema>;

/** Avisos de una actividad tras programarla (las ediciones manuales pueden dejarla en conflicto). */
export const ActivityWarningSchema = z.enum([
  "closed_at_time",
  "late_arrival",
  "ends_after_day",
  "meal_out_of_window",
]);
export type ActivityWarning = z.infer<typeof ActivityWarningSchema>;

/** Datos del optimizador sobre una actividad: lo que es estimación y lo que viene de una fuente. */
export const ActivityPlanningSchema = z.object({
  slot: DaySlotSchema,
  /** La duración es una estimación por categoría (no viene de la fuente). */
  durationEstimated: z.boolean().default(true),
  openingStatus: OpeningStatusSchema.optional(),
  warnings: z.array(ActivityWarningSchema).default([]),
  /** Lugar cercano abierto (confirmado) a esa hora por si este está cerrado. */
  alternative: PlaceSchema.optional(),
});
export type ActivityPlanning = z.infer<typeof ActivityPlanningSchema>;

/** Lugar que el optimizador no pudo programar y por qué. */
export const UnscheduledReasonSchema = z.enum(["closed", "no_time", "no_room"]);
export const UnscheduledPlaceSchema = z.object({
  place: PlaceSchema,
  reason: UnscheduledReasonSchema,
});
export type UnscheduledPlace = z.infer<typeof UnscheduledPlaceSchema>;

/** Metadatos del último cálculo: qué tiempos se usaron y de dónde salen. */
export const ItineraryMetaSchema = z.object({
  generatedAt: z.iso.datetime(),
  /** Calidad de las matrices de tiempos usadas (a pie / coche). */
  travel: z.object({
    quality: z.enum(["routed", "partial", "unavailable"]),
    source: SourceSchema.optional(),
    isDemo: z.boolean().optional(),
    message: z.string().optional(),
  }),
  places: z.object({ isDemo: z.boolean(), sourceName: z.string() }),
  unscheduled: z.array(UnscheduledPlaceSchema).default([]),
  notices: z.array(z.string()).default([]),
});
export type ItineraryMeta = z.infer<typeof ItineraryMetaSchema>;

/** Operaciones de edición manual del itinerario (REQUISITOS §9). */
export const ItineraryEditSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    date: IsoDateSchema,
    place: PlaceSchema,
    /** Posición dentro del día; al final si falta. */
    position: z.number().int().min(0).optional(),
  }),
  z.object({ op: z.literal("remove"), activityId: z.string().min(1) }),
  z.object({
    op: z.literal("move"),
    activityId: z.string().min(1),
    date: IsoDateSchema,
    position: z.number().int().min(0),
  }),
  /** Fijar la hora bloquea la actividad (el resto se programa alrededor). */
  z.object({ op: z.literal("set_time"), activityId: z.string().min(1), time: TimeOfDaySchema }),
  z.object({ op: z.literal("lock"), activityId: z.string().min(1), locked: z.boolean() }),
  /** Elige (o quita, con `null`) el sitio de una comida: la franja se mantiene y se recalculan tramos. */
  z.object({
    op: z.literal("set_meal_place"),
    activityId: z.string().min(1),
    place: PlaceSchema.refine((place) => place.layer === "food", {
      message: "El sitio de una comida debe ser de gastronomía",
    }).nullable(),
  }),
  /** Sustituye el lugar de una visita conservando su posición (modo lluvia, §14D). */
  z.object({ op: z.literal("replace"), activityId: z.string().min(1), place: PlaceSchema }),
  /** Reoptimiza las actividades no bloqueadas que van después de `afterActivityId` (o todo el día). */
  z.object({
    op: z.literal("reorganize"),
    date: IsoDateSchema,
    afterActivityId: z.string().min(1).optional(),
  }),
]);
export type ItineraryEdit = z.infer<typeof ItineraryEditSchema>;
