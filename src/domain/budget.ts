import { z } from "zod";
import { SourceSchema } from "./source";

export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "Código ISO 4217");

/**
 * Certeza de un precio (REQUISITOS §6.5): confirmado (pagado o de una fuente con precio exacto),
 * orientativo (rango o estimación con fuente) o sin precio.
 */
export const PriceCertaintySchema = z.enum(["confirmed", "estimated", "unknown"]);
export type PriceCertainty = z.infer<typeof PriceCertaintySchema>;

/**
 * Precio de un elemento del viaje. Si lo aporta un proveedor debe llevar `source`; si lo escribe
 * el usuario, `origin: "user"`. Sin importe solo cabe `certainty: "unknown"`.
 */
export const PriceSchema = z
  .object({
    certainty: PriceCertaintySchema,
    amount: z.number().nonnegative().optional(),
    currency: CurrencySchema.optional(),
    origin: z.enum(["user", "provider"]).optional(),
    source: SourceSchema.optional(),
  })
  .superRefine((price, ctx) => {
    if (price.certainty === "unknown") {
      if (price.amount !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Un precio desconocido no lleva importe",
          path: ["amount"],
        });
      }
      return;
    }
    if (price.amount === undefined || price.currency === undefined) {
      ctx.addIssue({ code: "custom", message: "Importe y moneda obligatorios", path: ["amount"] });
    }
    if (price.origin === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Indica si el precio es del usuario o de un proveedor",
        path: ["origin"],
      });
    }
    if (price.origin === "provider" && price.source === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Un precio de proveedor necesita fuente",
        path: ["source"],
      });
    }
  });
export type Price = z.infer<typeof PriceSchema>;

export const BudgetCategorySchema = z.enum(["accommodation", "food", "activities", "transport"]);
export type BudgetCategory = z.infer<typeof BudgetCategorySchema>;

/** Presupuesto que fija el usuario en el asistente (paso 5). Importes en `currency`. */
export const BudgetSchema = z.object({
  currency: CurrencySchema.default("EUR"),
  total: z.number().nonnegative().optional(),
  categories: z.partialRecord(BudgetCategorySchema, z.number().nonnegative()).default({}),
});
export type Budget = z.infer<typeof BudgetSchema>;
