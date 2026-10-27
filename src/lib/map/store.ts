import { create } from "zustand";
import type { BBox } from "@/domain/geo";
import { type ActiveLayers, DEFAULT_LAYERS, type MapLayerKey, toggleLayer } from "./layers";

/** Vistas de la barra inferior en móvil (docs/DISENO.md). */
export const WORKSPACE_VIEWS = ["map", "list", "itinerary", "trip"] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

/** Alturas del bottom sheet en móvil. */
export const SHEET_SNAPS = ["peek", "half", "full"] as const;
export type SheetSnap = (typeof SHEET_SNAPS)[number];

/** Siguiente altura al pulsar el asa (alternativa por botón al gesto de arrastre). */
export function nextSnap(snap: SheetSnap): SheetSnap {
  return snap === "peek" ? "half" : snap === "half" ? "full" : "peek";
}

/** Altura más cercana al soltar el arrastre, a partir de la fracción de pantalla ocupada. */
export function nearestSnap(fraction: number, heights: Record<SheetSnap, number>): SheetSnap {
  return SHEET_SNAPS.reduce((best, snap) =>
    Math.abs(heights[snap] - fraction) < Math.abs(heights[best] - fraction) ? snap : best,
  );
}

/** Quién pidió la selección: si viene de la lista, el mapa se centra en el lugar. */
export type SelectionOrigin = "map" | "list";

export interface MapUiState {
  layers: ActiveLayers;
  selectedId?: string;
  selectionOrigin?: SelectionOrigin;
  /** Contador para repetir el centrado aunque se elija el mismo lugar otra vez. */
  focusRequest: number;
  view: WorkspaceView;
  sheet: SheetSnap;
  /** Zona visible del mapa; la lista muestra lo mismo que el mapa. */
  bounds?: BBox;
  toggleLayer: (layer: MapLayerKey) => void;
  showAllLayers: () => void;
  select: (id: string | undefined, origin: SelectionOrigin) => void;
  setView: (view: WorkspaceView) => void;
  setSheet: (sheet: SheetSnap) => void;
  setBounds: (bounds: BBox | undefined) => void;
}

export const createMapUiStore = () =>
  create<MapUiState>()((set) => ({
    layers: DEFAULT_LAYERS,
    focusRequest: 0,
    view: "map",
    sheet: "peek",
    toggleLayer: (layer) => set((state) => ({ layers: toggleLayer(state.layers, layer) })),
    showAllLayers: () => set({ layers: DEFAULT_LAYERS }),
    select: (id, origin) =>
      set((state) => ({
        selectedId: id,
        selectionOrigin: id ? origin : undefined,
        focusRequest: state.focusRequest + 1,
        // En móvil, al elegir un lugar se abre su ficha a media altura en la vista mapa.
        ...(id ? { view: "map" as const, sheet: state.sheet === "full" ? "full" : "half" } : {}),
      })),
    // Lista, itinerario y viaje ocupan todo el sheet; al volver al mapa se recoge.
    setView: (view) =>
      set((state) => ({
        view,
        sheet: view !== "map" ? "full" : state.selectedId ? "half" : "peek",
      })),
    setSheet: (sheet) => set({ sheet }),
    setBounds: (bounds) => set({ bounds }),
  }));

export type MapUiStore = ReturnType<typeof createMapUiStore>;
