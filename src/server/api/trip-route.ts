import { isTripId, type Trip } from "@/domain/trip";
import { getTrip } from "@/server/services/trips";

export type TripRouteContext = { params: Promise<{ id: string }> };

export const tripNotFound = () =>
  Response.json({ error: { code: "not_found", message: "El viaje no existe." } }, { status: 404 });

export async function readJsonBody(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_request", message: "El cuerpo debe ser JSON" } },
      { status: 400 },
    );
  }
}

/** Lee el viaje de la ruta: 404 si no existe, 503 si la BD falla; si no, ejecuta `handler`. */
export async function withTrip(
  { params }: TripRouteContext,
  handler: (trip: Trip) => Promise<Response>,
): Promise<Response> {
  const { id } = await params;
  if (!isTripId(id)) return tripNotFound();
  let trip: Trip | null;
  try {
    trip = await getTrip(id);
  } catch (error) {
    console.error("[api] viaje no disponible:", error);
    return Response.json(
      {
        error: {
          code: "storage_unavailable",
          message: "No se ha podido leer el viaje. Inténtalo de nuevo en unos segundos.",
        },
      },
      { status: 503 },
    );
  }
  if (!trip) return tripNotFound();
  return handler(trip);
}
