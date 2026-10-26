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
  source: SourceSchema,
});
export type BookingLink = z.infer<typeof BookingLinkSchema>;
