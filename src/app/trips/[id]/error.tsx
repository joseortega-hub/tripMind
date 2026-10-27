"use client";

import { Button } from "@/components/ui/button";

export default function TripError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">No se ha podido cargar el viaje</h1>
      <p className="text-muted-foreground">
        Hubo un problema al leer los datos guardados. Puede ser temporal: vuelve a intentarlo en
        unos segundos.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </main>
  );
}
