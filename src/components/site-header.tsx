import Link from "next/link";
import { Compass } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="bg-background/95 border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-3"
        >
          <Compass className="text-primary size-5" aria-hidden />
          TripMind
        </Link>
        <nav aria-label="Principal">
          <Link
            href="/trips/new"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3"
          >
            Nuevo viaje
          </Link>
        </nav>
      </div>
    </header>
  );
}
