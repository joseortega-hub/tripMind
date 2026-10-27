import { ItineraryEditSchema } from "@/domain/itinerary";
import { isTripId } from "@/domain/trip";
import { invalidRequest, providerFailure } from "@/server/api/responses";
import { externalPlacesUrl } from "@/server/providers/pois";
import { ItineraryEditError, PlacesUnavailableError } from "@/server/services/itinerary";
import {
  editTripItinerary,
  generateTripItinerary,
  getTripItinerary,
} from "@/server/services/itinerary/service";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const notFound = () =>
  Response.json({ error: { code: "not_found", message: "El viaje no existe." } }, { status: 404 });

function failure(error: unknown) {
  if (error instanceof ItineraryEditError) {
    return Response.json(
      { error: { code: "invalid_edit", message: error.message } },
      { status: 409 },
    );
  }
  if (error instanceof PlacesUnavailableError) {
    // Sin lugares no hay itinerario: se ofrece el mapa de OpenStreetMap como alternativa.
    return providerFailure(error, externalPlacesUrl(error.at));
  }
  console.error("[api] itinerario no disponible:", error);
  return Response.json(
    {
      error: {
        code: "storage_unavailable",
        message:
          "No se ha podido guardar ni leer el itinerario. Inténtalo de nuevo en unos segundos.",
      },
    },
    { status: 503 },
  );
}

/** GET /api/trips/[id]/itinerary — `{ days, meta }` (días vacíos si aún no se ha generado). */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!isTripId(id)) return notFound();
  try {
    const itinerary = await getTripItinerary(id);
    return itinerary ? Response.json(itinerary) : notFound();
  } catch (error) {
    return failure(error);
  }
}

/** POST /api/trips/[id]/itinerary — genera (o regenera conservando lo bloqueado). */
export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!isTripId(id)) return notFound();
  try {
    const itinerary = await generateTripItinerary(id);
    return itinerary ? Response.json(itinerary) : notFound();
  } catch (error) {
    return failure(error);
  }
}

/** PATCH /api/trips/[id]/itinerary `{ op, … }` — edición manual (ver `ItineraryEditSchema`). */
export async function PATCH(request: Request, { params }: Context) {
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
  const parsed = ItineraryEditSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  try {
    const itinerary = await editTripItinerary(id, parsed.data);
    return itinerary ? Response.json(itinerary) : notFound();
  } catch (error) {
    return failure(error);
  }
}
