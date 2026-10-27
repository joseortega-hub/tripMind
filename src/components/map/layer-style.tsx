import {
  BedDouble,
  Heart,
  Landmark,
  type LucideIcon,
  Ticket,
  TramFront,
  UtensilsCrossed,
} from "lucide-react";
import type { MapLayerKey } from "@/lib/map/layers";
import { cn } from "@/lib/utils";

/** Icono por capa: el color nunca es la única pista (docs/DISENO.md). */
export const LAYER_ICONS: Record<MapLayerKey, LucideIcon> = {
  tourism: Landmark,
  food: UtensilsCrossed,
  lodging: BedDouble,
  transport: TramFront,
  tickets: Ticket,
  saved: Heart,
};

/** Clases de Tailwind de los tokens `--layer-*` (definidas completas para que Tailwind las vea). */
export const LAYER_BG: Record<MapLayerKey, string> = {
  tourism: "bg-layer-tourism",
  food: "bg-layer-food",
  lodging: "bg-layer-lodging",
  transport: "bg-layer-transport",
  tickets: "bg-layer-tickets",
  saved: "bg-layer-saved",
};

export const LAYER_TEXT: Record<MapLayerKey, string> = {
  tourism: "text-layer-tourism",
  food: "text-layer-food",
  lodging: "text-layer-lodging",
  transport: "text-layer-transport",
  tickets: "text-layer-tickets",
  saved: "text-layer-saved",
};

/** Insignia redonda con el icono de la capa (marcadores, lista, ficha). */
export function LayerGlyph({
  layer,
  className,
  iconClassName,
}: {
  layer: MapLayerKey;
  className?: string;
  iconClassName?: string;
}) {
  const Icon = LAYER_ICONS[layer];
  return (
    <span
      aria-hidden
      className={cn(
        "text-layer-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full",
        LAYER_BG[layer],
        className,
      )}
    >
      <Icon className={cn("size-3.5", iconClassName)} strokeWidth={2.25} />
    </span>
  );
}
