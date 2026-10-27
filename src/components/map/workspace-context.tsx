"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { createMapUiStore, type MapUiState, type MapUiStore } from "@/lib/map/store";

const MapUiContext = createContext<MapUiStore | null>(null);

export function MapUiProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createMapUiStore);
  return <MapUiContext.Provider value={store}>{children}</MapUiContext.Provider>;
}

export function useMapUi<T>(selector: (state: MapUiState) => T): T {
  const store = useContext(MapUiContext);
  if (!store) throw new Error("useMapUi necesita <MapUiProvider>");
  return useStore(store, selector);
}

export type Layout = "mobile" | "tablet" | "desktop";

const TABLET = "(min-width: 768px)";
const DESKTOP = "(min-width: 1280px)";

function subscribe(onChange: () => void) {
  const queries = [TABLET, DESKTOP].map((query) => window.matchMedia(query));
  queries.forEach((query) => query.addEventListener("change", onChange));
  return () => queries.forEach((query) => query.removeEventListener("change", onChange));
}

function currentLayout(): Layout {
  if (window.matchMedia(DESKTOP).matches) return "desktop";
  return window.matchMedia(TABLET).matches ? "tablet" : "mobile";
}

/** Distribución según el ancho (mobile-first: el servidor pinta la de móvil). */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, currentLayout, () => "mobile");
}
