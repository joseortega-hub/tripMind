export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">TripMind</h1>
      <p className="text-muted-foreground text-lg">
        Convierte una idea de viaje en un plan completo: itinerario por días, mapa interactivo,
        alojamiento, restaurantes y transporte, con datos de fuentes verificables.
      </p>
      <p className="text-muted-foreground text-sm">En construcción — ver docs/ROADMAP.md.</p>
    </main>
  );
}
