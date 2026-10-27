import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TripWorkspace } from "@/components/map/trip-workspace";
import { isTripId, type Trip } from "@/domain/trip";
import { env } from "@/lib/env";
import { getTrip } from "@/server/services/trips";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const tripTitle = (trip: Trip) => trip.title ?? `Viaje a ${trip.destination.name}`;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!isTripId(id)) return { title: "Viaje no encontrado — TripMind" };
  const trip = await getTrip(id).catch(() => null);
  return { title: trip ? `${tripTitle(trip)} — TripMind` : "Viaje — TripMind" };
}

export default async function TripPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!isTripId(id)) notFound();
  const trip = await getTrip(id);
  if (!trip) notFound();

  // El estilo del mapa no es secreto (OpenFreeMap no usa clave); se lee en el servidor.
  return (
    <main>
      <TripWorkspace trip={trip} mapStyleUrl={env.MAP_STYLE_URL} />
    </main>
  );
}
