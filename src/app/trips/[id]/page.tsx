import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarRange, Map } from "lucide-react";
import { DemoBadge } from "@/components/data-source";
import { TripOverview } from "@/components/trip-overview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Trip } from "@/domain";
import { formatLongDate, travelersText } from "@/lib/trip-labels";
import { getTrip } from "@/server/services/trips";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const tripTitle = (trip: Trip) => trip.title ?? `Viaje a ${trip.destination.name}`;

/** Ids generados por Prisma (`cuid`): evita consultar la BD con rutas arbitrarias. */
const isValidId = (id: string) => /^[a-z0-9]{20,40}$/i.test(id);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!isValidId(id)) return { title: "Viaje no encontrado — TripMind" };
  const trip = await getTrip(id).catch(() => null);
  return { title: trip ? `${tripTitle(trip)} — TripMind` : "Viaje — TripMind" };
}

export default async function TripPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const trip = await getTrip(id);
  if (!trip) notFound();

  const usesDemoData = trip.destination.isDemo || trip.hotel?.place?.isDemo === true;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
      <header className="flex flex-col gap-2 border-b pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{tripTitle(trip)}</h1>
          {usesDemoData ? <DemoBadge /> : null}
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2">
          <CalendarRange className="size-4" aria-hidden />
          {formatLongDate(trip.startDate)} – {formatLongDate(trip.endDate)} ·{" "}
          {travelersText(trip.travelers)}
        </p>
      </header>

      {usesDemoData ? (
        <Alert className="mt-6">
          <AlertTitle>Proveedor en modo demostración</AlertTitle>
          <AlertDescription>
            Parte de los datos de este viaje proceden de respuestas grabadas, no de una consulta en
            vivo. Se indican con la etiqueta «Datos de demostración».
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[22rem_1fr]">
        <section aria-labelledby="resumen" className="rounded-xl border px-4">
          <h2 id="resumen" className="sr-only">
            Resumen del viaje
          </h2>
          <TripOverview trip={trip} />
        </section>

        <section
          aria-labelledby="plan"
          className="bg-muted/40 flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center"
        >
          <Map className="text-primary size-8" aria-hidden />
          <h2 id="plan" className="text-lg font-medium">
            Mapa e itinerario
          </h2>
          <p className="text-muted-foreground max-w-md text-sm">
            Aquí aparecerán el mapa interactivo y el plan por días de tu viaje. Esta parte aún está
            en desarrollo; tus datos ya están guardados.
          </p>
        </section>
      </div>
    </main>
  );
}
