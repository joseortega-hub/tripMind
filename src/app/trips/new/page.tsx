import type { Metadata } from "next";
import { TripWizard } from "@/components/wizard/trip-wizard";

export const metadata: Metadata = { title: "Nuevo viaje — TripMind" };

export default function NewTripPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-12">
      <h1 className="text-muted-foreground mb-6 text-sm font-medium">Planificar un viaje</h1>
      <TripWizard />
    </main>
  );
}
