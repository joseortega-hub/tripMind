import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingTrip() {
  return (
    <main
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10"
      aria-busy="true"
      aria-label="Cargando el viaje"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-5 w-1/2 max-w-sm" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[22rem_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </main>
  );
}
