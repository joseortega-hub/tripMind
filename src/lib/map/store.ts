import { create } from "zustand";
import type { BBox } from "@/domain/geo";
import type { LineGeometry, RouteMode } from "@/domain/route";
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

/** Trayecto dibujado en el mapa (uno cada vez). `approximate` se dibuja discontinuo. */
export interface MapRoute {
  /** Identifica el trayecto (origen, destino y modo) para el botón "Ver en el mapa". */
  key: string;
  mode: RouteMode;
  quality: "routed" | "approximate";
  geometry: LineGeometry;
}

export interface MapUiState {
  layers: ActiveLayers;
  selectedId?: string;
  selectionOrigin?: SelectionOrigin;
  /** Último lugar abierto antes del actual: origen "desde el punto anterior". */
  previousId?: string;
  /** Último lugar abierto (aunque ya se haya cerrado su ficha). */
  lastId?: string;
  route?: MapRoute;
  /** Contador para repetir el centrado aunque se elija el mismo lugar otra vez. */
  focusRequest: number;
  view: WorkspaceView;
  sheet: SheetSnap;
  /** Zona visible del mapa; la lista muestra lo mismo que el mapa. */
  bounds?: BBox;
  /** Contador para volver a encuadrar el destino (estado vacío de la lista). */
  recenterRequest: number;
  /** Día elegido en el itinerario (su ruta es la capa 5); sin valor, el primero con plan. */
  itineraryDate?: string;
  /** Contador para encuadrar la ruta del día. */
  dayFitRequest: number;
  toggleLayer: (layer: MapLayerKey) => void;
  showAllLayers: () => void;
  select: (id: string | undefined, origin: SelectionOrigin) => void;
  setView: (view: WorkspaceView) => void;
  setSheet: (sheet: SheetSnap) => void;
  setBounds: (bounds: BBox | undefined) => void;
  recenter: () => void;
  showRoute: (route: MapRoute | undefined) => void;
  setItineraryDate: (date: string | undefined, fit?: boolean) => void;
}

export const createMapUiStore = () =>
  create<MapUiState>()((set) => ({
    layers: DEFAULT_LAYERS,
    focusRequest: 0,
    recenterRequest: 0,
    dayFitRequest: 0,
    view: "map",
    sheet: "peek",
    toggleLayer: (layer) => set((state) => ({ layers: toggleLayer(state.layers, layer) })),
    showAllLayers: () => set({ layers: DEFAULT_LAYERS }),
    select: (id, origin) =>
      set((state) => ({
        selectedId: id,
        // Al cerrar la ficha se recuerda el lugar; al abrir otro distinto pasa a ser el anterior.
        previousId: id && state.lastId && state.lastId !== id ? state.lastId : state.previousId,
        lastId: id ?? state.lastId,
        // La ruta pertenece a la ficha abierta: se borra al cambiar de lugar.
        route: id === state.selectedId ? state.route : undefined,
        selectionOrigin: id ? origin : undefined,
        focusRequest: state.focusRequest + 1,
        // En móvil, al elegir un lugar se abre su ficha a media altura en la vista mapa,
        // de modo que el lugar quede visible sobre el sheet.
        ...(id ? { view: "map" as const, sheet: "half" as const } : {}),
      })),
    // Lista, itinerario y viaje ocupan todo el sheet; al volver al mapa se recoge.
    setView: (view) =>
      set((state) => ({
        view,
        sheet: view !== "map" ? "full" : state.selectedId ? "half" : "peek",
      })),
    setSheet: (sheet) => set({ sheet }),
    setBounds: (bounds) => set({ bounds }),
    recenter: () => set((state) => ({ recenterRequest: state.recenterRequest + 1 })),
    showRoute: (route) => set({ route }),
    setItineraryDate: (itineraryDate, fit = true) =>
      set((state) => ({
        itineraryDate,
        dayFitRequest: fit ? state.dayFitRequest + 1 : state.dayFitRequest,
      })),
  }));

export type MapUiStore = ReturnType<typeof createMapUiStore>;
