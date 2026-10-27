import { z } from "zod";
import { SavedMediaSchema } from "@/domain/discover";
import { PlaceSchema } from "@/domain/place";
import { isTripId } from "@/domain/trip";
import { invalidRequest } from "@/server/api/responses";
import {
  addFavorite,
  listFavorites,
  removeFavorite,
  tripExists,
} from "@/server/services/favorites";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const notFound = () =>
  Response.json({ error: { code: "not_found", message: "El viaje no existe." } }, { status: 404 });

function storageUnavailable(error: unknown) {
  console.error("[api] favoritos no disponibles:", error);
  return Response.json(
    {
      error: {
        code: "storage_unavailable",
        message:
          "No se han podido guardar ni leer tus lugares. Inténtalo de nuevo en unos segundos.",
      },
    },
    { status: 503 },
  );
}

const BodySchema = z.object({ place: PlaceSchema, media: SavedMediaSchema.optional() });
const DeleteSchema = z.object({ placeId: z.string().min(1).max(200) });

/** GET /api/trips/[id]/favorites — lugares guardados del viaje: `{ results, media }`. */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!isTripId(id)) return notFound();
  try {
    const list = await listFavorites(id);
    return list ? Response.json({ results: list.places, media: list.media }) : notFound();
  } catch (error) {
    return storageUnavailable(error);
  }
}

/**
 * POST /api/trips/[id]/favorites `{ place, media? }` — guarda el lugar (snapshot con fuente) y,
 * si viene de un vídeo de TikTok/Instagram confirmado por el usuario, el enlace del vídeo.
 */
export async function POST(request: Request, { params }: Context) {
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
    if (!(await tripExists(id))) return notFound();
    await addFavorite(id, parsed.data.place, parsed.data.media);
    return Response.json({ placeId: parsed.data.place.id }, { status: 201 });
  } catch (error) {
    return storageUnavailable(error);
  }
}

/** DELETE /api/trips/[id]/favorites?placeId=osm:node/123 — los ids llevan "/", por eso va en la query. */
export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isTripId(id)) return notFound();
  const parsed = DeleteSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalidRequest(parsed.error);
  try {
    await removeFavorite(id, parsed.data.placeId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return storageUnavailable(error);
  }
}
