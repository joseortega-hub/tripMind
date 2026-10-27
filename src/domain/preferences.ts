import { z } from "zod";

/** Intereses del paso 3 del asistente (REQUISITOS §6.3). */
export const InterestSchema = z.enum([
  "monuments_history",
  "museums",
  "nature",
  "beaches",
  "gastronomy",
  "shopping",
  "nightlife",
  "concerts_events",
  "sports",
  "theme_parks",
  "original_experiences",
  "hidden_gems",
  "photography",
  "architecture",
  "family",
  "free",
]);
export type Interest = z.infer<typeof InterestSchema>;

/** Peso 1 (algo) a 3 (mucho). Un interés ausente no interesa. */
export const InterestWeightSchema = z.number().int().min(1).max(3);

export const PreferencesSchema = z.object({
  interests: z.partialRecord(InterestSchema, InterestWeightSchema).default({}),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** Hora local "HH:MM". */
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM");
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

export const toMinutes = (time: TimeOfDay): number => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Fecha de calendario "YYYY-MM-DD". */
export const IsoDateSchema = z.iso.date();

/** Ritmo del paso 4 (REQUISITOS §6.4). */
export const PaceSchema = z
  .object({
    level: z.enum(["relaxed", "balanced", "intensive"]).default("balanced"),
    dayStart: TimeOfDaySchema.default("09:30"),
    dayEnd: TimeOfDaySchema.default("20:00"),
    lunchMinutes: z.number().int().min(0).max(240).default(90),
    freeTimeMinutes: z.number().int().min(0).max(480).default(60),
    reducedMobility: z.boolean().default(false),
    /** Días sin actividades programadas. */
    restDays: z.array(IsoDateSchema).default([]),
  })
  .refine((pace) => toMinutes(pace.dayStart) < toMinutes(pace.dayEnd), {
    message: "La hora de inicio debe ser anterior a la de fin",
    path: ["dayEnd"],
  });
export type Pace = z.infer<typeof PaceSchema>;

/** Tipos de alojamiento del paso 2 del asistente. */
export const LodgingTypeSchema = z.enum(["hotel", "apartment", "hostel", "other"]);
export type LodgingType = z.infer<typeof LodgingTypeSchema>;

/** Preferencias de alojamiento del paso 2 cuando aún no hay hotel. */
export const AccommodationPreferencesSchema = z.object({
  budgetPerNight: z.number().nonnegative().optional(),
  minStars: z.number().int().min(1).max(5).optional(),
  rooms: z.number().int().min(1).max(10).default(1),
  types: z.array(LodgingTypeSchema).default([]),
  zone: z.enum(["central", "well_connected", "any"]).default("any"),
  accessible: z.boolean().default(false),
});
export type AccommodationPreferences = z.infer<typeof AccommodationPreferencesSchema>;
