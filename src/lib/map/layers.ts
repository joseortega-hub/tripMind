import { type BBox, bboxContains, type LatLng } from "@/domain/geo";
import type { Place, PlaceCategory } from "@/domain/place";

/**
 * Capas del mapa (REQUISITOS §8): 1 turismo, 2 gastronomía, 3 alojamiento, 4 transporte
 * (estaciones y paradas de OSM) y 7 guardados. Itinerario (5) y entradas (6) llegan después.
 */
export const MAP_LAYERS = ["tourism", "food", "lodging", "transport", "saved"] as const;
export type MapLayerKey = (typeof MAP_LAYERS)[number];

/**
 * Capas que se piden juntas a `/api/places`; "guardados" sale de los favoritos del viaje y
 * transporte se pide aparte solo cuando se activa (hay muchas paradas de autobús).
 */
export const PLACE_LAYERS = ["tourism", "food", "lodging"] as const;

export const LAYER_LABELS: Record<MapLayerKey, string> = {
  tourism: "Turismo",
  food: "Gastronomía",
  lodging: "Alojamiento",
  transport: "Transporte",
  saved: "Guardados",
};

export const CATEGORY_LABELS: Partial<Record<PlaceCategory, string>> = {
  museum: "Museo",
  gallery: "Galería de arte",
  monument: "Monumento",
  attraction: "Atracción turística",
  viewpoint: "Mirador",
  park: "Parque o jardín",
  place_of_worship: "Templo",
  theatre: "Teatro",
  restaurant: "Restaurante",
  cafe: "Cafetería",
  bar: "Bar",
  fast_food: "Comida rápida",
  hotel: "Hotel",
  hostel: "Hostal / albergue",
  apartment: "Apartamento",
  guest_house: "Casa de huéspedes",
  train_station: "Estación de tren",
  metro_station: "Estación de metro",
  bus_station: "Estación de autobuses",
  tram_stop: "Parada de tranvía o metro ligero",
  bus_stop: "Parada de autobús",
};

export type ActiveLayers = Record<MapLayerKey, boolean>;

export const DEFAULT_LAYERS: ActiveLayers = {
  tourism: true,
  food: true,
  lodging: true,
  transport: false,
  saved: true,
};

export function toggleLayer(active: ActiveLayers, layer: MapLayerKey): ActiveLayers {
  return { ...active, [layer]: !active[layer] };
}

export const allLayersOff = (active: ActiveLayers) => MAP_LAYERS.every((layer) => !active[layer]);

/** Lugar listo para pintar: la capa con la que se dibuja y si está guardado. */
export interface MapPlace {
  place: Place;
  layer: MapLayerKey;
  isFavorite: boolean;
}

/**
 * Une los lugares del proveedor con los favoritos del viaje y aplica las capas activas.
 * Un favorito se dibuja con la capa "guardados" si está activa; si no, con la de su categoría.
 * Los favoritos que no están en la respuesta (otra zona, otra fecha) se muestran con su snapshot.
 */
export function visiblePlaces(
  places: readonly Place[],
  favorites: readonly Place[],
  active: ActiveLayers,
): MapPlace[] {
  const favoriteIds = new Set(favorites.map((place) => place.id));
  const byId = new Map<string, Place>();
  for (const place of places) byId.set(place.id, place);
  for (const place of favorites) if (!byId.has(place.id)) byId.set(place.id, place);

  const result: MapPlace[] = [];
  for (const place of byId.values()) {
    const isFavorite = favoriteIds.has(place.id);
    if (isFavorite && active.saved) {
      result.push({ place, layer: "saved", isFavorite });
    } else if (active[place.layer]) {
      result.push({ place, layer: place.layer, isFavorite });
    }
  }
  return result.sort((a, b) => a.place.name.localeCompare(b.place.name, "es"));
}

/** Lugares dentro de la zona visible del mapa (sin límites conocidos, todos). */
export function placesInBounds(items: readonly MapPlace[], bounds?: BBox): MapPlace[] {
  return bounds ? items.filter((item) => bboxContains(bounds, item.place.location)) : [...items];
}

export function groupByLayer(items: readonly MapPlace[]) {
  return MAP_LAYERS.map((layer) => ({
    layer,
    items: items.filter((item) => item.layer === layer),
  })).filter((group) => group.items.length > 0);
}

/** Medio lado del área de lugares en grados (~4 × 4 km, el máximo que admite `/api/places`). */
const HALF_SIDE = 0.019;

/** Área de búsqueda alrededor de un punto, en el formato de `/api/places`. */
export function areaAround({ lat, lng }: LatLng): string {
  return [lng - HALF_SIDE, lat - HALF_SIDE, lng + HALF_SIDE, lat + HALF_SIDE]
    .map((value) => value.toFixed(5))
    .join(",");
}
