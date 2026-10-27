import { z } from "zod";
import { LatLngSchema } from "@/domain/geo";
import { invalidRequest } from "@/server/api/responses";
import { walkableFrom } from "@/server/services/nearby";

export const runtime = "nodejs";

const BodySchema = z.object({
  origin: LatLngSchema,
  maxMinutes: z.number().int().min(5).max(45),
  targets: z
    .array(z.object({ id: z.string().min(1), location: LatLngSchema }))
    .min(1)
    .max(500),
});

/** POST /api/routes/walkable { origin, maxMinutes, targets } → destinos a ≤ N minutos a pie. */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return invalidRequest(parsed.error);
  return Response.json(await walkableFrom(parsed.data));
}
