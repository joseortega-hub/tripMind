import { TripInputSchema } from "@/domain/trip";
import { invalidRequest } from "@/server/api/responses";
import { createTrip } from "@/server/services/trips";

export const runtime = "nodejs";

/** POST /api/trips — crea un viaje con los datos del asistente. Responde `{ id }`. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_request", message: "El cuerpo debe ser JSON" } },
      { status: 400 },
    );
  }
  const parsed = TripInputSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);

  try {
    const trip = await createTrip(parsed.data);
    return Response.json({ id: trip.id }, { status: 201 });
  } catch (error) {
    console.error("[api] no se pudo guardar el viaje:", error);
    return Response.json(
      {
        error: {
          code: "storage_unavailable",
          message: "No se ha podido guardar el viaje. Inténtalo de nuevo en unos segundos.",
        },
      },
      { status: 503 },
    );
  }
}
