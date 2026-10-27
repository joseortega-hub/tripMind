import { z } from "zod";
import { PlaceSchema } from "@/domain/place";
import { isTripId } from "@/domain/trip";
import { invalidRequest } from "@/server/api/responses";
import { changeTripHotel } from "@/server/services/hotel-repository";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const notFound = () =>
  Response.json({ error: { code: "not_found", message: "El viaje no existe." } }, { status: 404 });

const BodySchema = z.object({
  place: PlaceSchema.refine((place) => place.layer === "lodging", {
    message: "Solo se puede elegir un alojamiento",
    path: ["layer"],
  }),
});

/**
 * PUT /api/trips/[id]/hotel `{ place }` — elige o cambia el hotel (snapshot OSM con fuente).
 * Si ya hay itinerario lo recalcula desde el hotel nuevo conservando lo bloqueado.
 * Responde `{ hotel, itinerary, regenerated, itineraryError? }`.
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
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);

  try {
    const result = await changeTripHotel(id, parsed.data.place);
    return result ? Response.json(result) : notFound();
  } catch (error) {
    console.error("[api] no se pudo cambiar el hotel:", error);
    return Response.json(
      {
        error: {
          code: "storage_unavailable",
          message: "No se ha podido guardar el hotel. Inténtalo de nuevo en unos segundos.",
        },
      },
      { status: 503 },
    );
  }
}
