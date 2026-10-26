import { z } from "zod";
import { type Budget, BudgetSchema } from "./budget";
import { type GeocodeResult, GeocodeResultSchema } from "./geocoding";
import { type Place, PlaceSchema } from "./place";
import {
  type AccommodationPreferences,
  AccommodationPreferencesSchema,
  IsoDateSchema,
  type Interest,
  type Pace,
  PaceSchema,
  PreferencesSchema,
} from "./preferences";
import { type TripInput, TripInputSchema, TravelersSchema } from "./trip";

/** Pasos del asistente (REQUISITOS §6). */
export const WIZARD_STEPS = [
  "destination",
  "accommodation",
  "interests",
  "pace",
  "budget",
  "summary",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Duración máxima de un viaje en el asistente (de escapada a varias semanas). */
export const MAX_TRIP_DAYS = 60;

/**
 * Borrador del asistente tal y como se guarda en el cliente. Todo es opcional o tiene un valor
 * inicial: se valida paso a paso con los esquemas de abajo y al final con `TripInputSchema`.
 */
export interface WizardDraft {
  destination?: GeocodeResult;
  startDate: string;
  endDate: string;
  travelers: { adults: number; children: number };
  /** undefined = aún no ha contestado si ya tiene alojamiento. */
  hasHotel?: boolean;
  /** Alojamiento real elegido de un proveedor (capa lodging). */
  hotelPlace?: Place;
  accommodation: AccommodationPreferences;
  interests: Partial<Record<Interest, number>>;
  pace: Pace;
  budget: Budget;
  title: string;
}

export function createEmptyDraft(): WizardDraft {
  return {
    startDate: "",
    endDate: "",
    travelers: { adults: 2, children: 0 },
    accommodation: AccommodationPreferencesSchema.parse({}),
    interests: {},
    pace: PaceSchema.parse({}),
    budget: BudgetSchema.parse({}),
    title: "",
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Días naturales entre llegada y salida, ambos incluidos. */
export function tripDates(startDate: string, endDate: string): string[] {
  const start = toUtc(startDate);
  const end = toUtc(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const days = Math.min(Math.round((end - start) / MS_PER_DAY) + 1, MAX_TRIP_DAYS + 1);
  return Array.from({ length: days }, (_, i) =>
    new Date(start + i * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

export function nightsBetween(startDate: string, endDate: string): number {
  return Math.max(tripDates(startDate, endDate).length - 1, 0);
}

export const DestinationStepSchema = z
  .object({
    destination: GeocodeResultSchema,
    startDate: IsoDateSchema,
    endDate: IsoDateSchema,
    travelers: TravelersSchema,
  })
  .refine((step) => step.startDate <= step.endDate, {
    message: "La fecha de salida no puede ser anterior a la de llegada",
    path: ["endDate"],
  })
  .refine((step) => tripDates(step.startDate, step.endDate).length <= MAX_TRIP_DAYS, {
    message: `El viaje puede durar como máximo ${MAX_TRIP_DAYS} días`,
    path: ["endDate"],
  });

export const AccommodationStepSchema = z.discriminatedUnion("hasHotel", [
  z.object({
    hasHotel: z.literal(true),
    hotelPlace: PlaceSchema.refine((place) => place.layer === "lodging", {
      message: "Elige un alojamiento",
    }),
  }),
  z.object({ hasHotel: z.literal(false), accommodation: AccommodationPreferencesSchema }),
]);

export const InterestsStepSchema = z.object({
  interests: PreferencesSchema.shape.interests.refine(
    (interests) => Object.keys(interests).length > 0,
    { message: "Elige al menos un interés" },
  ),
});

/** El ritmo depende de las fechas: los días libres deben caer dentro del viaje. */
export function paceStepSchema(startDate: string, endDate: string) {
  const dates = tripDates(startDate, endDate);
  return z.object({
    pace: PaceSchema.superRefine((pace, ctx) => {
      if (pace.restDays.some((day) => !dates.includes(day))) {
        ctx.addIssue({
          code: "custom",
          message: "Los días libres deben estar dentro del viaje",
          path: ["restDays"],
        });
      }
      if (dates.length > 0 && pace.restDays.length >= dates.length) {
        ctx.addIssue({
          code: "custom",
          message: "Deja al menos un día con actividades",
          path: ["restDays"],
        });
      }
    }),
  });
}

export const BudgetStepSchema = z.object({
  budget: BudgetSchema.refine(
    (budget) =>
      budget.total === undefined ||
      Object.values(budget.categories).reduce((sum, value) => sum + (value ?? 0), 0) <=
        budget.total,
    { message: "Las partidas suman más que el presupuesto total", path: ["categories"] },
  ),
});

/** Mensajes para campos obligatorios vacíos (en lugar del genérico de Zod). */
const REQUIRED_MESSAGES: Record<string, string> = {
  destination: "Elige un destino de la lista de sugerencias",
  startDate: "Indica la fecha de llegada",
  endDate: "Indica la fecha de salida",
  hasHotel: "Indica si ya tienes alojamiento",
  hotelPlace: "Busca y elige tu alojamiento",
};

export type FieldErrors = Record<string, string>;

export type StepValidation = { success: true } | { success: false; errors: FieldErrors };

function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    errors[key] ??= issue.message;
  }
  return errors;
}

function parseWithErrors(schema: z.ZodType, data: unknown): StepValidation {
  const result = schema.safeParse(data, {
    error: (issue) => {
      if (issue.input !== undefined) return undefined;
      const key = issue.path?.join(".") ?? "";
      return REQUIRED_MESSAGES[key] ?? "Campo obligatorio";
    },
  });
  return result.success
    ? { success: true }
    : { success: false, errors: toFieldErrors(result.error) };
}

const emptyToUndefined = (value: string) => (value === "" ? undefined : value);

/** Datos de cada paso extraídos del borrador, listos para validar. */
function stepInput(step: WizardStep, draft: WizardDraft): unknown {
  switch (step) {
    case "destination":
      return {
        destination: draft.destination,
        startDate: emptyToUndefined(draft.startDate),
        endDate: emptyToUndefined(draft.endDate),
        travelers: draft.travelers,
      };
    case "accommodation":
      if (draft.hasHotel === undefined) return { hasHotel: undefined };
      return draft.hasHotel
        ? { hasHotel: true, hotelPlace: draft.hotelPlace }
        : { hasHotel: false, accommodation: draft.accommodation };
    case "interests":
      return { interests: draft.interests };
    case "pace":
      return { pace: draft.pace };
    case "budget":
      return { budget: draft.budget };
    case "summary":
      return draft;
  }
}

export function validateStep(step: WizardStep, draft: WizardDraft): StepValidation {
  const input = stepInput(step, draft);
  switch (step) {
    case "destination":
      return parseWithErrors(DestinationStepSchema, input);
    case "accommodation":
      if (draft.hasHotel === undefined) {
        return { success: false, errors: { hasHotel: REQUIRED_MESSAGES.hasHotel! } };
      }
      return parseWithErrors(AccommodationStepSchema, input);
    case "interests":
      return parseWithErrors(InterestsStepSchema, input);
    case "pace":
      return parseWithErrors(paceStepSchema(draft.startDate, draft.endDate), input);
    case "budget":
      return parseWithErrors(BudgetStepSchema, input);
    case "summary": {
      const result = buildTripInput(draft);
      return result.success ? { success: true } : { success: false, errors: result.errors };
    }
  }
}

/** Primer paso con errores (para no dejar crear un viaje con pasos saltados). */
export function firstInvalidStep(draft: WizardDraft): WizardStep | undefined {
  return WIZARD_STEPS.filter((step) => step !== "summary").find(
    (step) => !validateStep(step, draft).success,
  );
}

/** Convierte el borrador en los datos de creación de un viaje (`TripInput`). */
export function buildTripInput(
  draft: WizardDraft,
): { success: true; data: TripInput } | { success: false; errors: FieldErrors } {
  const pending = firstInvalidStep(draft);
  if (pending) {
    return { success: false, errors: { _form: "Hay pasos sin completar", step: pending } };
  }
  const hotel =
    draft.hasHotel && draft.hotelPlace
      ? {
          id: draft.hotelPlace.id,
          place: draft.hotelPlace,
          name: draft.hotelPlace.name,
          location: draft.hotelPlace.location,
          address: draft.hotelPlace.address,
          checkIn: draft.startDate,
          checkOut: draft.endDate,
        }
      : undefined;
  const result = TripInputSchema.safeParse({
    title: draft.title.trim() || undefined,
    destination: draft.destination,
    startDate: draft.startDate,
    endDate: draft.endDate,
    travelers: draft.travelers,
    hotel,
    accommodationPreferences: draft.hasHotel ? undefined : draft.accommodation,
    preferences: { interests: draft.interests },
    pace: draft.pace,
    budget: draft.budget,
  });
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: toFieldErrors(result.error) };
}
