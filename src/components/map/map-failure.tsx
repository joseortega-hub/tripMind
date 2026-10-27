import { ExternalLink, MapPinOff } from "lucide-react";
import type { LatLng } from "@/domain/geo";

export type MapFailureReason = "style" | "webgl";

const MESSAGES: Record<MapFailureReason, string> = {
  style: "No se ha podido cargar el mapa base de OpenFreeMap.",
  webgl: "Este navegador no permite mostrar el mapa (necesita WebGL).",
};

/** Estado de error del mapa: la lista sigue disponible y se ofrece un mapa externo. */
export function MapFailure({ reason, center }: { reason: MapFailureReason; center: LatLng }) {
  const externalUrl = `https://www.openstreetmap.org/#map=15/${center.lat.toFixed(5)}/${center.lng.toFixed(5)}`;
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <MapPinOff className="text-muted-foreground size-8" aria-hidden />
      <p className="font-medium">{MESSAGES[reason]}</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        Los lugares siguen disponibles en la lista. También puedes ver la zona en OpenStreetMap.
      </p>
      <a
        href={externalUrl}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-2"
      >
        <ExternalLink className="size-4" aria-hidden />
        Abrir la zona en OpenStreetMap
        <span className="sr-only"> (se abre en otra pestaña)</span>
      </a>
    </div>
  );
}
