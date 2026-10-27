"use client";

import { Heart } from "lucide-react";
import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_LABELS, groupByLayer, LAYER_LABELS, type MapPlace } from "@/lib/map/layers";
import { cn } from "@/lib/utils";
import { LayerGlyph } from "./layer-style";
import { useMapUi } from "./workspace-context";

/**
 * Lista accesible equivalente al mapa: los mismos lugares (capas activas y zona visible),
 * agrupados por capa. Elegir uno lo selecciona y centra el mapa.
 */
export function PlaceList({ items, className }: { items: MapPlace[]; className?: string }) {
  const selectedId = useMapUi((state) => state.selectedId);
  const selectionOrigin = useMapUi((state) => state.selectionOrigin);
  const select = useMapUi((state) => state.select);
  const listRef = useRef<HTMLDivElement>(null);

  // Selección desde el mapa → la lista muestra el elemento elegido.
  useEffect(() => {
    if (!selectedId || selectionOrigin !== "map") return;
    const element = listRef.current?.querySelector<HTMLElement>(
      `[data-place-id="${CSS.escape(selectedId)}"]`,
    );
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedId, selectionOrigin]);

  return (
    <div ref={listRef} className={cn("flex flex-col gap-5", className)}>
      {groupByLayer(items).map((group) => (
        <section key={group.layer} aria-labelledby={`list-${group.layer}`}>
          <h3
            id={`list-${group.layer}`}
            className="text-muted-foreground mb-1.5 flex items-center gap-2 text-sm font-medium"
          >
            <LayerGlyph layer={group.layer} className="size-5" iconClassName="size-3" />
            {LAYER_LABELS[group.layer]}
            <span className="font-normal">({group.items.length})</span>
          </h3>
          <ul className="flex flex-col">
            {group.items.map(({ place, isFavorite }) => {
              const selected = place.id === selectedId;
              return (
                <li key={place.id}>
                  <button
                    type="button"
                    data-place-id={place.id}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => select(place.id, "list")}
                    className={cn(
                      "focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-3",
                      selected ? "bg-accent ring-cta ring-2" : "hover:bg-muted",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{place.name}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {CATEGORY_LABELS[place.category]}
                        {place.address?.street
                          ? ` · ${[place.address.street, place.address.houseNumber].filter(Boolean).join(" ")}`
                          : ""}
                      </span>
                    </span>
                    {isFavorite ? (
                      <>
                        <Heart
                          aria-hidden
                          className="text-layer-saved fill-layer-saved size-4 shrink-0"
                        />
                        <span className="sr-only">Guardado</span>
                      </>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PlaceListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-4 w-28" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5 px-2 py-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
