import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { type SavedMedia, SavedMediaSchema } from "@/domain/discover";
import { type Place, PlaceSchema } from "@/domain/place";
import { prisma } from "@/server/db";

export interface FavoritesList {
  places: Place[];
  /** Vídeo desde el que se guardó cada lugar (solo los guardados desde TikTok/Instagram). */
  media: Record<string, SavedMedia>;
}

/** Lugares guardados de un viaje (capa 7), del más reciente al más antiguo. Null si no existe. */
export async function listFavorites(tripId: string): Promise<FavoritesList | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      favorites: { orderBy: { createdAt: "desc" }, select: { place: true, media: true } },
    },
  });
  if (!trip) return null;
  const media: Record<string, SavedMedia> = {};
  // Snapshots guardados con un esquema anterior se ignoran en lugar de romper la página.
  const places = trip.favorites.flatMap((row) => {
    const parsed = PlaceSchema.safeParse(row.place);
    if (!parsed.success) return [];
    const video = row.media ? SavedMediaSchema.safeParse(row.media) : undefined;
    if (video?.success) media[parsed.data.id] = video.data;
    return [parsed.data];
  });
  return { places, media };
}

/**
 * Guarda el lugar (snapshot con fuente e `isDemo`); repetirlo actualiza el snapshot. Con `media`
 * se guarda también el vídeo desde el que se añadió; sin él se conserva el que hubiera.
 */
export async function addFavorite(tripId: string, place: Place, media?: SavedMedia): Promise<void> {
  const snapshot = place as unknown as Prisma.InputJsonValue;
  const video = media ? (media as unknown as Prisma.InputJsonValue) : undefined;
  await prisma.favorite.upsert({
    where: { tripId_placeId: { tripId, placeId: place.id } },
    create: { tripId, placeId: place.id, place: snapshot, media: video },
    update: { place: snapshot, ...(video ? { media: video } : {}) },
  });
}

export async function removeFavorite(tripId: string, placeId: string): Promise<void> {
  await prisma.favorite.deleteMany({ where: { tripId, placeId } });
}

export async function tripExists(tripId: string): Promise<boolean> {
  return (await prisma.trip.count({ where: { id: tripId } })) > 0;
}
