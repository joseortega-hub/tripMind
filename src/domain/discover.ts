import { z } from "zod";
import { LatLngSchema } from "./geo";
import { OpeningStatusSchema } from "./itinerary";
import { PlaceSchema } from "./place";
import { IsoDateSchema, TimeOfDaySchema } from "./preferences";
import { ExternalDataSchema, SourceSchema } from "./source";

/**
 * "Popular ahora" (REQUISITOS §18): visitas al artículo de Wikipedia del lugar frente a su media.
 * Siempre se presenta como "según visitas en Wikipedia", nunca como tendencia en redes.
 */
export const PlacePopularitySchema = ExternalDataSchema.extend({
  placeId: z.string().min(1),
  article: z.string().min(1),
  /** Media diaria de los últimos 7 días. */
  recentDaily: z.number().nonnegative(),
  /** Media diaria de las semanas anteriores. */
  baselineDaily: z.number().nonnegative(),
  /** recent / baseline (sin base, null). */
  ratio: z.number().nonnegative().nullable(),
  isTrending: z.boolean(),
  /** Periodo medido (fechas incluidas). */
  from: IsoDateSchema,
  to: IsoDateSchema,
});
export type PlacePopularity = z.infer<typeof PlacePopularitySchema>;

export const SocialPlatformSchema = z.enum(["tiktok", "instagram"]);
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>;

/**
 * Vídeo que el usuario enlaza desde TikTok/Instagram. Los metadatos salen del oEmbed público de
 * la plataforma (si está disponible); `videoId` sale de la propia URL o del oEmbed. Nunca se
 * descarga el vídeo: se embebe con el reproductor oficial.
 */
export const SavedMediaSchema = z.object({
  platform: SocialPlatformSchema,
  url: z.url(),
  videoId: z
    .string()
    .regex(/^\d{5,30}$/)
    .optional(),
  title: z.string().max(2200).optional(),
  authorName: z.string().max(200).optional(),
  authorUrl: z.url().optional(),
  /** Fuente de los metadatos; sin ella, solo el enlace aportado por el usuario. */
  source: SourceSchema.optional(),
  isDemo: z.boolean().default(false),
  savedAt: z.iso.datetime(),
});
export type SavedMedia = z.infer<typeof SavedMediaSchema>;

/** Sugerencia del modo "tengo N horas libres" (REQUISITOS §14C), con tiempos reales. */
export const FreeTimeSuggestionSchema = z.object({
  place: PlaceSchema,
  walkToMinutes: z.number().nonnegative(),
  walkBackMinutes: z.number().nonnegative(),
  /** Duración estimada por categoría (estimación de TripMind). */
  visitMinutes: z.number().int().positive(),
  arrival: TimeOfDaySchema,
  openingStatus: OpeningStatusSchema,
  score: z.number(),
});
export type FreeTimeSuggestion = z.infer<typeof FreeTimeSuggestionSchema>;

export const FreeTimeRequestSchema = z.object({
  origin: LatLngSchema,
  originLabel: z.string().min(1).max(200),
  date: IsoDateSchema,
  start: TimeOfDaySchema,
  minutes: z
    .number()
    .int()
    .min(30)
    .max(8 * 60),
});
export type FreeTimeRequest = z.infer<typeof FreeTimeRequestSchema>;

/** Lugar de interior que puede sustituir a una visita al aire libre (modo lluvia, §14D). */
export const RainAlternativeSchema = z.object({
  place: PlaceSchema,
  straightLineMeters: z.number().nonnegative(),
  openingStatus: OpeningStatusSchema,
});
export type RainAlternative = z.infer<typeof RainAlternativeSchema>;

export const RainSwapSchema = z.object({
  activityId: z.string().min(1),
  alternatives: z.array(RainAlternativeSchema),
});
export type RainSwap = z.infer<typeof RainSwapSchema>;
