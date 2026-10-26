import { z } from "zod";

/**
 * Procedencia de un dato externo. Obligatoria en todo lo que venga de un proveedor
 * (REQUISITOS §3.2): permite mostrar la fuente y la atribución/licencia en la UI.
 */
export const SourceSchema = z.object({
  /** Nombre legible del proveedor, p. ej. "OpenStreetMap (Overpass API)". */
  name: z.string().min(1),
  /** URL verificable del dato (ficha OSM, entidad Wikidata, archivo de Commons…). */
  url: z.url().optional(),
  /** Momento en que se obtuvo el dato (ISO 8601). En demo, la fecha de grabación del fixture. */
  retrievedAt: z.iso.datetime(),
  /** Licencia del dato, p. ej. "ODbL 1.0" o "CC BY-SA 4.0". */
  license: z.string().optional(),
  /** Texto de atribución a mostrar, p. ej. "© colaboradores de OpenStreetMap". */
  attribution: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/** Campos comunes a todo dato externo: fuente + marca de demostración. */
export const ExternalDataSchema = z.object({
  source: SourceSchema,
  /** true si procede de fixtures grabados (modo demo) y no de una consulta en vivo. */
  isDemo: z.boolean(),
});
export type ExternalData = z.infer<typeof ExternalDataSchema>;
