import { describe, expect, it } from "vitest";
import type { Place, PlaceCategory } from "@/domain/place";
import { CATEGORY_LAYER } from "@/domain/place";
import { buildClusterIndex, markerHighlighted, SELECTION_ZOOM } from "./clusters";
import {
  allLayersOff,
  areaAround,
  DEFAULT_LAYERS,
  groupByLayer,
  placesInBounds,
  toggleLayer,
  visiblePlaces,
} from "./layers";
import { createMapUiStore, nearestSnap, nextSnap } from "./store";

const source = { name: "OpenStreetMap (Overpass API)", retrievedAt: "2026-10-26T21:33:43.876Z" };

function place(id: string, category: PlaceCategory, lat = 40.41, lng = -3.69, name = id): Place {
  return {
    id,
    name,
    category,
    layer: CATEGORY_LAYER[category],
    location: { lat, lng },
    source,
    isDemo: true,
  };
}

const prado = place("osm:way/1", "museum", 40.4138, -3.6921, "Museo del Prado");
const cafe = place("osm:node/2", "cafe", 40.412, -3.695, "Café Central");
const hotel = place("osm:node/3", "hotel", 40.409, -3.699, "Hotel Mediodía");
const station = place("osm:node/4", "train_station", 40.406, -3.69, "Atocha");

describe("capas del mapa", () => {
  it("muestra las capas activas y deja fuera transporte (Fase 4)", () => {
    const items = visiblePlaces([prado, cafe, hotel, station], [], DEFAULT_LAYERS);
    expect(items.map((item) => item.place.name)).toEqual([
      "Café Central",
      "Hotel Mediodía",
      "Museo del Prado",
    ]);
  });

  it("filtra al desactivar una capa", () => {
    const layers = toggleLayer(DEFAULT_LAYERS, "food");
    expect(layers.food).toBe(false);
    expect(visiblePlaces([prado, cafe], [], layers).map((item) => item.place.id)).toEqual([
      prado.id,
    ]);
  });

  it("dibuja los favoritos en la capa guardados aunque su capa esté apagada", () => {
    const layers = { tourism: false, food: false, lodging: false, saved: true };
    const items = visiblePlaces([prado, cafe], [cafe], layers);
    expect(items).toEqual([{ place: cafe, layer: "saved", isFavorite: true }]);
  });

  it("con guardados apagado, el favorito vuelve a su capa y conserva la marca", () => {
    const layers = toggleLayer(DEFAULT_LAYERS, "saved");
    expect(visiblePlaces([cafe], [cafe], layers)).toEqual([
      { place: cafe, layer: "food", isFavorite: true },
    ]);
  });

  it("incluye favoritos que no llegan en la respuesta, sin duplicar", () => {
    const elsewhere = place("osm:node/9", "museum", 41.38, 2.17, "Museu Picasso");
    const items = visiblePlaces([prado], [prado, elsewhere], DEFAULT_LAYERS);
    expect(items.map((item) => item.place.id).sort()).toEqual([prado.id, elsewhere.id].sort());
    expect(items.every((item) => item.layer === "saved")).toBe(true);
  });

  it("detecta todas las capas apagadas", () => {
    expect(allLayersOff(DEFAULT_LAYERS)).toBe(false);
    expect(allLayersOff({ tourism: false, food: false, lodging: false, saved: false })).toBe(true);
  });

  it("la lista equivale a la zona visible del mapa", () => {
    const items = visiblePlaces([prado, cafe, hotel], [], DEFAULT_LAYERS);
    expect(placesInBounds(items, [-3.694, 40.413, -3.69, 40.415]).map((i) => i.place.id)).toEqual([
      prado.id,
    ]);
    expect(placesInBounds(items)).toHaveLength(3);
  });

  it("agrupa por capa en el orden del mapa", () => {
    const groups = groupByLayer(visiblePlaces([prado, cafe, hotel], [hotel], DEFAULT_LAYERS));
    expect(groups.map((group) => group.layer)).toEqual(["tourism", "food", "saved"]);
  });

  it("calcula el área de búsqueda alrededor del destino", () => {
    expect(areaAround({ lat: 40.4168, lng: -3.7035 })).toBe("-3.72250,40.39780,-3.68450,40.43580");
  });
});

describe("agrupación de marcadores", () => {
  const items = visiblePlaces(
    [
      place("a", "museum", 40.41, -3.69),
      place("b", "museum", 40.4101, -3.6901),
      place("c", "cafe", 40.43, -3.65),
    ],
    [],
    DEFAULT_LAYERS,
  );
  const world: [number, number, number, number] = [-180, -85, 180, 85];

  it("agrupa los cercanos a poco zoom y los separa al acercarse", () => {
    const index = buildClusterIndex(items);
    const far = index.markers(world, 12);
    const cluster = far.find((marker) => marker.kind === "cluster");
    expect(cluster).toMatchObject({ kind: "cluster", count: 2 });
    expect(far).toHaveLength(2);

    const near = index.markers(world, SELECTION_ZOOM);
    expect(near.every((marker) => marker.kind === "place")).toBe(true);
    expect(near).toHaveLength(3);
  });

  it("resalta el grupo que contiene el lugar seleccionado", () => {
    const index = buildClusterIndex(items);
    const markers = index.markers(world, 12);
    const cluster = markers.find((marker) => marker.kind === "cluster")!;
    const single = markers.find((marker) => marker.kind === "place")!;
    expect(markerHighlighted(cluster, "a")).toBe(true);
    expect(markerHighlighted(cluster, "c")).toBe(false);
    expect(markerHighlighted(single, "c")).toBe(true);
    expect(markerHighlighted(single, undefined)).toBe(false);
  });

  it("el zoom de expansión no supera el de selección", () => {
    const index = buildClusterIndex(items);
    const cluster = index.markers(world, 3).find((marker) => marker.kind === "cluster");
    if (cluster?.kind !== "cluster") throw new Error("se esperaba un grupo");
    expect(index.expansionZoom(cluster.clusterId)).toBeLessThanOrEqual(SELECTION_ZOOM);
  });
});

describe("estado de la vista", () => {
  it("seleccionar abre la ficha a media altura y pide centrar", () => {
    const store = createMapUiStore();
    store.getState().setView("list");
    expect(store.getState().sheet).toBe("full");
    store.getState().select("a", "list");
    expect(store.getState()).toMatchObject({
      selectedId: "a",
      selectionOrigin: "list",
      view: "map",
      sheet: "full",
      focusRequest: 1,
    });
    store.getState().setSheet("peek");
    store.getState().select("b", "map");
    expect(store.getState()).toMatchObject({ selectionOrigin: "map", sheet: "half" });
  });

  it("deseleccionar limpia el origen y volver al mapa recoge el sheet", () => {
    const store = createMapUiStore();
    store.getState().select("a", "map");
    store.getState().select(undefined, "map");
    expect(store.getState().selectionOrigin).toBeUndefined();
    store.getState().setView("trip");
    store.getState().setView("map");
    expect(store.getState().sheet).toBe("peek");
  });

  it("alterna capas y las restablece", () => {
    const store = createMapUiStore();
    store.getState().toggleLayer("tourism");
    expect(store.getState().layers.tourism).toBe(false);
    store.getState().showAllLayers();
    expect(store.getState().layers).toEqual(DEFAULT_LAYERS);
  });

  it("recorre las alturas del sheet y ajusta a la más cercana", () => {
    expect(nextSnap("peek")).toBe("half");
    expect(nextSnap("half")).toBe("full");
    expect(nextSnap("full")).toBe("peek");
    const heights = { peek: 0.2, half: 0.5, full: 0.9 };
    expect(nearestSnap(0.3, heights)).toBe("peek");
    expect(nearestSnap(0.6, heights)).toBe("half");
    expect(nearestSnap(0.8, heights)).toBe("full");
  });
});
