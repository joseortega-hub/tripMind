"use client";

import { LAYER_LABELS, MAP_LAYERS, type MapLayerKey } from "@/lib/map/layers";
import { cn } from "@/lib/utils";
import { LAYER_BG, LAYER_ICONS } from "./layer-style";
import { useMapUi } from "./workspace-context";

/** Interruptores de capa: botones con `aria-pressed`, icono y número de lugares. */
export function LayerToggles({
  counts,
  className,
}: {
  counts: Partial<Record<MapLayerKey, number>>;
  className?: string;
}) {
  const layers = useMapUi((state) => state.layers);
  const toggle = useMapUi((state) => state.toggleLayer);

  return (
    <div role="group" aria-label="Capas del mapa" className={cn("flex gap-2", className)}>
      {MAP_LAYERS.map((layer) => {
        const Icon = LAYER_ICONS[layer];
        const active = layers[layer];
        const count = counts[layer];
        return (
          <button
            key={layer}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(layer)}
            className={cn(
              "focus-visible:ring-ring/50 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium shadow-xs outline-none focus-visible:ring-3",
              active
                ? "bg-card text-foreground border-foreground/25"
                : "bg-card/90 text-muted-foreground border-dashed",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-5 items-center justify-center rounded-full",
                active ? `text-layer-foreground ${LAYER_BG[layer]}` : "border-input border",
              )}
            >
              <Icon className="size-3" strokeWidth={2.5} />
            </span>
            {LAYER_LABELS[layer]}
            {count !== undefined ? (
              <span className="text-muted-foreground text-xs">
                <span className="sr-only">, </span>
                {count}
                <span className="sr-only"> lugares</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
