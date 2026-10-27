import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TripNotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Viaje no encontrado</h1>
      <p className="text-muted-foreground">
        El enlace no corresponde a ningún viaje guardado. Comprueba la dirección o crea uno nuevo.
      </p>
      <Button asChild>
        <Link href="/trips/new">Planificar un viaje</Link>
      </Button>
    </main>
  );
}
