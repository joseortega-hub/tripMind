import { z } from "zod";
import { BBoxStringSchema } from "@/domain/geo";
import { categoriesForLayers, type Place } from "@/domain/place";
import { areaAround } from "@/lib/map/layers";
import { invalidRequest } from "@/server/api/responses";
import { readJsonBody, type TripRouteContext, withTrip } from "@/server/api/trip-route";
import { ProviderError } from "@/server/providers/core/types";
import { getPlacesProvider } from "@/server/providers/pois";
import {
  getSocialEmbedProvider,
  parseSocialLink,
  type SocialPreview,
} from "@/server/providers/social";
import { detectPlaces } from "@/server/services/discover/social";

export const runtime = "nodejs";

const BodySchema = z.object({ url: z.string().min(1).max(2000) });

/**
 * POST /api/trips/[id]/social `{ url }` — enlace de TikTok/Instagram pegado por el usuario: vista
 * previa del oEmbed público (si está disponible) y lugares candidatos del destino mencionados en el
 * texto. No guarda nada: el usuario confirma el lugar y lo guarda con `POST …/favorites`.
 */
export async function POST(request: Request, context: TripRouteContext) {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  const link = parseSocialLink(parsed.data.url);
  if (!link) {
    return Response.json(
      {
        error: {
          code: "invalid_request",
          message: "Pega un enlace de un vídeo de TikTok o de una publicación de Instagram.",
        },
      },
      { status: 400 },
    );
  }
  return withTrip(context, async (trip) => {
    let preview: SocialPreview;
    try {
      preview = await getSocialEmbedProvider().preview(link);
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      console.warn("[api] oEmbed:", error.message);
      preview = {
        status: "unavailable",
        message: "No se ha podido leer la vista previa del vídeo ahora mismo. Elige tú el lugar.",
        videoId: link.videoId,
        isDemo: false,
      };
    }
    let candidates: Place[] = [];
    if (preview.title) {
      try {
        const search = await getPlacesProvider().provider.searchByBBox({
          bbox: BBoxStringSchema.parse(areaAround(trip.destination.location)),
          categories: categoriesForLayers(["tourism", "food"]),
          limit: 500,
        });
        candidates = detectPlaces(preview.title, search.places);
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error;
      }
    }
    return Response.json({ link, preview, candidates });
  });
}
