import { z } from "zod";

/**
 * Buzón de ideas, mejoras y errores (Fase 8b). Las imágenes se comprimen en el navegador para que
 * quepan en el cuerpo JSON de `POST /api/feedback` (≈1 MB); servidor y cliente usan estos límites.
 */
export const FeedbackKindSchema = z.enum(["error", "idea", "mejora"]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;

export const FeedbackStatusSchema = z.enum(["new", "read", "done"]);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

export const FEEDBACK_MIN_MESSAGE = 3;
export const FEEDBACK_MAX_MESSAGE = 2000;
export const FEEDBACK_MAX_IMAGES = 3;
/** Caracteres base64 por imagen (~225 kB decodificada) y entre todas: por debajo de 1 MB. */
export const FEEDBACK_MAX_IMAGE_CHARS = 300_000;
export const FEEDBACK_MAX_TOTAL_IMAGE_CHARS = 800_000;
/** Límite del cuerpo de la petición en el servidor. */
export const FEEDBACK_MAX_BODY_BYTES = 1_000_000;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const FeedbackImageSchema = z.object({
  type: z.enum(["image/jpeg", "image/webp", "image/png"]),
  /** Base64 sin el prefijo `data:`. */
  data: z
    .string()
    .max(FEEDBACK_MAX_IMAGE_CHARS, "La imagen es demasiado grande")
    .refine((d) => d.length % 4 === 0 && BASE64.test(d), "La imagen no es base64 válido"),
});
export type FeedbackImage = z.infer<typeof FeedbackImageSchema>;

/** Contexto automático: pantalla, modo y navegador. Nunca datos personales. */
export const FeedbackContextSchema = z.object({
  viewport: z.string().max(20).optional(),
  dpr: z.number().min(0).max(10).optional(),
  mode: z.enum(["claro", "oscuro"]).optional(),
  browser: z.string().max(300).optional(),
});
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;

export const FeedbackInputSchema = z
  .object({
    kind: FeedbackKindSchema,
    message: z
      .string()
      .trim()
      .min(FEEDBACK_MIN_MESSAGE, "Cuéntanos un poco más")
      .max(FEEDBACK_MAX_MESSAGE, `Como mucho ${FEEDBACK_MAX_MESSAGE} caracteres`),
    path: z.string().trim().startsWith("/").max(300),
    tripId: z
      .string()
      .regex(/^[a-z0-9]{20,40}$/)
      .optional(),
    context: FeedbackContextSchema.default({}),
    images: z
      .array(FeedbackImageSchema)
      .max(FEEDBACK_MAX_IMAGES, `Como mucho ${FEEDBACK_MAX_IMAGES} imágenes`)
      .default([]),
  })
  .refine(
    (f) => f.images.reduce((n, i) => n + i.data.length, 0) <= FEEDBACK_MAX_TOTAL_IMAGE_CHARS,
    { message: "Las imágenes ocupan demasiado entre todas", path: ["images"] },
  );
export type FeedbackInput = z.input<typeof FeedbackInputSchema>;

export const FeedbackStatusUpdateSchema = z.object({ status: FeedbackStatusSchema });

/** Qué falta o sobra antes de enviar (null si está bien). Mismo criterio que el esquema. */
export function feedbackProblem(input: {
  message: string;
  images: FeedbackImage[];
}): string | null {
  const text = input.message.trim();
  if (text.length < FEEDBACK_MIN_MESSAGE) return "Escribe al menos unas palabras para enviarlo.";
  if (text.length > FEEDBACK_MAX_MESSAGE)
    return `El texto pasa de ${FEEDBACK_MAX_MESSAGE} caracteres. Acórtalo un poco.`;
  if (input.images.length > FEEDBACK_MAX_IMAGES)
    return `Puedes adjuntar como mucho ${FEEDBACK_MAX_IMAGES} imágenes.`;
  if (input.images.some((i) => i.data.length > FEEDBACK_MAX_IMAGE_CHARS))
    return "Una imagen es demasiado grande. Prueba con otra captura.";
  if (input.images.reduce((n, i) => n + i.data.length, 0) > FEEDBACK_MAX_TOTAL_IMAGE_CHARS)
    return "Las imágenes ocupan demasiado entre todas. Quita alguna.";
  return null;
}
