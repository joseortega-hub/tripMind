import { z } from "zod";
import { LatLngSchema } from "@/domain/geo";

/** "lat,lng" en query strings (el orden habitual al leer coordenadas). */
export const LatLngStringSchema = z
  .string()
  .transform((value) => {
    const [lat, lng] = value.split(",").map((part) => Number(part.trim()));
    return { lat, lng };
  })
  .pipe(LatLngSchema);
