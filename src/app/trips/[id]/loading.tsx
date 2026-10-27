import { Skeleton } from "@/components/ui/skeleton";

/** Misma forma que el espacio del viaje: cabecera fina, mapa y paneles laterales en escritorio. */
export default function LoadingTrip() {
  return (
    <main
      className="flex h-[calc(100dvh-3.5rem-1px)] flex-col"
      aria-busy="true"
      aria-label="Cargando el viaje"
    >
      <div className="flex min-h-12 items-center border-b px-4 sm:px-6">
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[22rem_1fr] xl:grid-cols-[21rem_1fr_24rem]">
        <div className="hidden flex-col gap-3 border-r p-4 md:flex">
          <Skeleton className="h-10" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="rounded-none" />
        <div className="hidden border-l xl:block" />
      </div>
    </main>
  );
}
