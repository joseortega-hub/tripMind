import { isTripId } from "@/domain/trip";
import { invalidRequest } from "@/server/api/responses";
import {
  BookingChangeSchema,
  BookingTargetError,
  getTripTicketOffers,
  updateTripBooking,
} from "@/server/services/bookings";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const notFound = () =>
  Response.json({ error: { code: "not_found", message: "El viaje no existe." } }, { status: 404 });

const storageFailure = (error: unknown) => {
  console.error("[api] reservas no disponibles:", error);
  return Response.json(
    {
      error: {
        code: "storage_unavailable",
        message:
          "No se han podido leer ni guardar las reservas. Inténtalo de nuevo en unos segundos.",
      },
    },
    { status: 503 },
  );
};

/**
 * GET /api/trips/[id]/bookings — estado del proveedor de entradas y sus productos por lugar
 * (`{ provider, status, offers }`). Sin proveedor configurado, `offers` va vacío.
 */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!isTripId(id)) return notFound();
  try {
    const result = await getTripTicketOffers(id);
    return result ? Response.json(result) : notFound();
  } catch (error) {
    return storageFailure(error);
  }
}

/**
 * PUT /api/trips/[id]/bookings `{ target: "activity", activityId | target: "hotel", status, note?,
 * paid? }` — guarda lo que anota el usuario. Responde `{ itinerary }` o `{ hotel }`.
 */
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isTripId(id)) return notFound();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_request", message: "El cuerpo debe ser JSON" } },
      { status: 400 },
    );
  }
  const parsed = BookingChangeSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  try {
    const result = await updateTripBooking(id, parsed.data);
    return result ? Response.json(result) : notFound();
  } catch (error) {
    if (error instanceof BookingTargetError) {
      return Response.json(
        { error: { code: "invalid_target", message: error.message } },
        { status: 409 },
      );
    }
    return storageFailure(error);
  }
}
