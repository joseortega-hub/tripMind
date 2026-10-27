import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { type Place, PlaceSchema } from "@/domain/place";
import { prisma } from "@/server/db";

/** Lugares guardados de un viaje (capa 7), del más reciente al más antiguo. Null si no existe. */
export async function listFavorites(tripId: string): Promise<Place[] | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { favorites: { orderBy: { createdAt: "desc" }, select: { place: true } } },
  });
  if (!trip) return null;
  // Snapshots guardados con un esquema anterior se ignoran en lugar de romper la página.
  return trip.favorites.flatMap(({ place }) => {
    const parsed = PlaceSchema.safeParse(place);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Guarda el lugar (snapshot con fuente e `isDemo`); repetirlo actualiza el snapshot. */
export async function addFavorite(tripId: string, place: Place): Promise<void> {
  const snapshot = place as unknown as Prisma.InputJsonValue;
  await prisma.favorite.upsert({
    where: { tripId_placeId: { tripId, placeId: place.id } },
    create: { tripId, placeId: place.id, place: snapshot },
    update: { place: snapshot },
  });
}

export async function removeFavorite(tripId: string, placeId: string): Promise<void> {
  await prisma.favorite.deleteMany({ where: { tripId, placeId } });
}

export async function tripExists(tripId: string): Promise<boolean> {
  return (await prisma.trip.count({ where: { id: tripId } })) > 0;
}
