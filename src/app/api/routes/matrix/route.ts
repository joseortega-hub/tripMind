import { z } from "zod";
import { LatLngSchema } from "@/domain/geo";
import { StreetModeSchema } from "@/domain/route";
import { invalidRequest, providerFailure, providerMeta } from "@/server/api/responses";
import { getRoutingProvider } from "@/server/providers/routing";
import { travelMatrix } from "@/server/services/routes";

export const runtime = "nodejs";

const BodySchema = z.object({
  origins: z.array(LatLngSchema).min(1).max(99),
  destinations: z.array(LatLngSchema).min(1).max(99),
  mode: StreetModeSchema.default("walk"),
});

/**
 * POST /api/routes/matrix { origins, destinations, mode } → tiempos y distancias por par (caché
 * de 7 días). Si el proveedor no responde: `quality: "unavailable"` y solo distancias en recta.
 */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return invalidRequest(parsed.error);
  const routing = getRoutingProvider();
  try {
    const matrix = await travelMatrix(parsed.data, routing);
    return Response.json({ ...matrix, provider: providerMeta(routing) });
  } catch (error) {
    return providerFailure(error, "https://www.openstreetmap.org/directions");
  }
}
