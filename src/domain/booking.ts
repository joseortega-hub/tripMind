import { z } from "zod";
import { SourceSchema } from "./source";

/**
 * Estado informativo de reserva de una actividad (REQUISITOS §12). Sale de una fuente o queda
 * en "unverified": nunca se presupone que algo es gratis o no necesita reserva.
 */
export const BookingRequirementSchema = z.enum([
  "ticket_required",
  "booking_recommended",
  "free",
  "no_booking",
  "unverified",
]);
export type BookingRequirement = z.infer<typeof BookingRequirementSchema>;

/** Estado que marca el usuario a mano. Abrir un enlace no cambia este estado. */
export const BookingStatusSchema = z.enum(["pending", "booked", "ticket_purchased", "cancelled"]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

/** Prioridad de enlace (REQUISITOS §12): oficial > taquilla oficial > proveedor autorizado > alternativa. */
export const BookingLinkKindSchema = z.enum([
  "official",
  "official_box_office",
  "authorized_reseller",
  "alternative",
]);
export type BookingLinkKind = z.infer<typeof BookingLinkKindSchema>;

export const BookingLinkSchema = z.object({
  url: z.url(),
  kind: BookingLinkKindSchema,
  /** true si el enlace lleva a la web general y no a la página de entradas. */
  isGeneralWebsite: z.boolean(),
  /** Nombre del proveedor autorizado (solo `authorized_reseller`). */
  providerName: z.string().min(1).optional(),
  source: SourceSchema,
  /** true si el enlace sale de datos de demostración. */
  isDemo: z.boolean().optional(),
});
export type BookingLink = z.infer<typeof BookingLinkSchema>;

/** Importe que introduce el usuario como pagado (total para todos los viajeros). */
export const PaidPriceSchema = z.object({
  amount: z.number().nonnegative().max(1_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/, "Código ISO 4217"),
});
export type PaidPrice = z.infer<typeof PaidPriceSchema>;

/**
 * Lo que el usuario anota de una reserva (REQUISITOS §12). Nunca se rellena solo: abrir un
 * enlace de compra no cambia nada.
 */
export const BookingUpdateSchema = z.object({
  status: BookingStatusSchema,
  note: z.string().trim().max(500).nullable().optional(),
  paid: PaidPriceSchema.nullable().optional(),
});
export type BookingUpdate = z.infer<typeof BookingUpdateSchema>;
