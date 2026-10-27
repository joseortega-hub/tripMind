"use client";

import { useEffect, useRef, useState } from "react";
import { nearestSnap, nextSnap, type SheetSnap } from "@/lib/map/store";
import { cn } from "@/lib/utils";

const SNAP_LABELS: Record<SheetSnap, string> = {
  peek: "recogido",
  half: "a media altura",
  full: "desplegado",
};

/** Alturas en píxeles a partir del alto disponible (pico fijo para que quepan las capas). */
export function sheetHeights(available: number): Record<SheetSnap, number> {
  return {
    peek: Math.min(156, available * 0.4),
    half: Math.round(available * 0.5),
    full: Math.max(available - 24, 0),
  };
}

/**
 * Bottom sheet de móvil con tres alturas. El asa se arrastra y, como alternativa al gesto,
 * es un botón que pasa a la siguiente altura (docs/DISENO.md).
 */
export function BottomSheet({
  snap,
  onSnap,
  available,
  label,
  contentKey,
  children,
}: {
  snap: SheetSnap;
  onSnap: (snap: SheetSnap) => void;
  /** Alto disponible para el sheet (entre la cabecera y la barra inferior). */
  available: number;
  label: string;
  /** Cambia con el contenido (vista o lugar) para empezar arriba al cambiar. */
  contentKey: string;
  children: React.ReactNode;
}) {
  const heights = sheetHeights(available);
  const [dragHeight, setDragHeight] = useState<number>();
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  /** Un arrastre termina en clic: ese clic no debe cambiar de altura otra vez. */
  const suppressClick = useRef(false);
  const height = dragHeight ?? heights[snap];

  useEffect(() => setDragHeight(undefined), [snap]);

  return (
    <section
      aria-label={label}
      className={cn(
        "bg-card absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl border-t shadow-[0_-6px_24px_-12px_rgb(23_36_43/0.35)]",
        dragHeight === undefined && "transition-[height] duration-200 ease-out",
      )}
      style={{ height }}
    >
      <button
        type="button"
        aria-label={`Panel ${SNAP_LABELS[snap]}. Cambiar altura`}
        className="focus-visible:ring-ring/50 flex h-7 w-full shrink-0 touch-none items-center justify-center rounded-t-2xl outline-none focus-visible:ring-3"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { startY: event.clientY, startHeight: height, moved: false };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state) return;
          const delta = state.startY - event.clientY;
          if (Math.abs(delta) > 4) state.moved = true;
          if (state.moved) {
            setDragHeight(
              Math.min(Math.max(state.startHeight + delta, heights.peek), heights.full),
            );
          }
        }}
        onPointerUp={() => {
          const state = drag.current;
          drag.current = null;
          if (!state?.moved) return;
          suppressClick.current = true;
          const fraction = (dragHeight ?? height) / available;
          const fractions = {
            peek: heights.peek / available,
            half: heights.half / available,
            full: heights.full / available,
          };
          const target = nearestSnap(fraction, fractions);
          setDragHeight(undefined);
          onSnap(target);
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onSnap(nextSnap(snap));
        }}
      >
        <span aria-hidden className="bg-input/70 h-1.5 w-10 rounded-full" />
      </button>
      <div key={contentKey} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {children}
      </div>
    </section>
  );
}
