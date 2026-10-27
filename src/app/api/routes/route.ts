import { z } from "zod";
import { IsoDateSchema, TimeOfDaySchema } from "@/domain/preferences";
import { RouteModeSchema } from "@/domain/route";
import { invalidRequest } from "@/server/api/responses";
import { LatLngStringSchema } from "@/server/api/route-params";
import { compareRoutes } from "@/server/services/routes";
import { localDateTimeToIso, timeZoneAt } from "@/server/services/time-zone";

export const runtime = "nodejs";

const QuerySchema = z.object({
  from: LatLngStringSchema,
  to: LatLngStringSchema,
  modes: z
    .string()
    .default("transit,walk,car")
    .transform((value) => [...new Set(value.split(",").map((mode) => mode.trim()))])
    .pipe(z.array(RouteModeSchema).min(1)),
  /** Día y hora locales del destino para el transporte público (por defecto, hoy a las 10:00). */
  date: IsoDateSchema.optional(),
  time: TimeOfDaySchema.default("10:00"),
});

/**
 * GET /api/routes?from=lat,lng&to=lat,lng[&modes=transit,walk,car][&date=YYYY-MM-DD&time=HH:MM]
 *
 * Responde siempre 200 con un resultado por modo: `routed` (ruta real con fuente) o `approximate`
 * (línea recta + enlaces externos, con el motivo). Nunca inventa tiempos, líneas ni horarios.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) return invalidRequest(parsed.error);

  const { from, to, modes, time } = parsed.data;
  const timeZone = timeZoneAt(from);
  const date =
    parsed.data.date ?? new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  const departure = localDateTimeToIso(date, time, timeZone);
  const comparison = await compareRoutes({ from, to, modes, departure });
  return Response.json({ ...comparison, departure, timeZone });
}
