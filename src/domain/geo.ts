import { z } from "zod";

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

/** Rectángulo geográfico [oeste, sur, este, norte]. */
export const BBoxSchema = z
  .tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ])
  .refine(([w, s, e, n]) => w < e && s < n, {
    message: "bbox inválido: se espera oeste<este y sur<norte",
  });
export type BBox = z.infer<typeof BBoxSchema>;

/** Parsea "oeste,sur,este,norte" (formato habitual en query strings). */
export const BBoxStringSchema = z
  .string()
  .transform((value) => value.split(",").map((part) => Number(part.trim())))
  .pipe(BBoxSchema);

export function bboxContains([w, s, e, n]: BBox, { lat, lng }: LatLng): boolean {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** Área aproximada en grados² (para limitar consultas demasiado grandes). */
export function bboxArea([w, s, e, n]: BBox): number {
  return (e - w) * (n - s);
}
