import { z } from "zod";
import { BBoxSchema, LatLngSchema } from "./geo";
import { ExternalDataSchema } from "./source";

export const GeocodeKindSchema = z.enum([
  "country",
  "region",
  "city",
  "district",
  "street",
  "address",
  "poi",
  "other",
]);
export type GeocodeKind = z.infer<typeof GeocodeKindSchema>;

/** Resultado de geocodificación / autocompletado. */
export const GeocodeResultSchema = ExternalDataSchema.extend({
  /** Id estable con prefijo de proveedor de datos, p. ej. "osm:relation/5326784". */
  id: z.string().min(1),
  name: z.string().min(1),
  /** Texto completo para mostrar: "Madrid, Comunidad de Madrid, España". */
  label: z.string().min(1),
  kind: GeocodeKindSchema,
  location: LatLngSchema,
  bbox: BBoxSchema.optional(),
  countryCode: z.string().length(2).optional(),
});
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;
