import { z } from "zod";
import { LatLngSchema } from "./geo";
import { ExternalDataSchema, SourceSchema } from "./source";

/** Capas del mapa que se alimentan de POIs (REQUISITOS §8: capas 1-4). */
export const MapLayerSchema = z.enum(["tourism", "food", "lodging", "transport"]);
export type MapLayer = z.infer<typeof MapLayerSchema>;

export const PlaceCategorySchema = z.enum([
  // Turismo
  "museum",
  "gallery",
  "monument",
  "attraction",
  "viewpoint",
  "park",
  "place_of_worship",
  "theatre",
  // Gastronomía
  "restaurant",
  "cafe",
  "bar",
  "fast_food",
  // Alojamiento
  "hotel",
  "hostel",
  "apartment",
  "guest_house",
  // Transporte
  "train_station",
  "metro_station",
  "bus_station",
  "tram_stop",
  "bus_stop",
]);
export type PlaceCategory = z.infer<typeof PlaceCategorySchema>;

export const CATEGORY_LAYER: Record<PlaceCategory, MapLayer> = {
  museum: "tourism",
  gallery: "tourism",
  monument: "tourism",
  attraction: "tourism",
  viewpoint: "tourism",
  park: "tourism",
  place_of_worship: "tourism",
  theatre: "tourism",
  restaurant: "food",
  cafe: "food",
  bar: "food",
  fast_food: "food",
  hotel: "lodging",
  hostel: "lodging",
  apartment: "lodging",
  guest_house: "lodging",
  train_station: "transport",
  metro_station: "transport",
  bus_station: "transport",
  tram_stop: "transport",
  bus_stop: "transport",
};

export function categoriesForLayers(layers: readonly MapLayer[]): PlaceCategory[] {
  return PlaceCategorySchema.options.filter((category) =>
    layers.includes(CATEGORY_LAYER[category]),
  );
}

/** Imagen con autoría y licencia obligatorias (Wikimedia Commons exige mostrarlas). */
export const PlaceImageSchema = z.object({
  url: z.url(),
  thumbnailUrl: z.url().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  licenseUrl: z.url().optional(),
  source: SourceSchema,
});
export type PlaceImage = z.infer<typeof PlaceImageSchema>;

export const AddressSchema = z.object({
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postcode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});
export type Address = z.infer<typeof AddressSchema>;

/**
 * Lugar real obtenido de un proveedor. `id` es estable y con prefijo de proveedor,
 * p. ej. "osm:node/123456". Los campos opcionales solo se rellenan si la fuente los trae.
 */
export const PlaceSchema = ExternalDataSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  category: PlaceCategorySchema,
  layer: MapLayerSchema,
  location: LatLngSchema,
  address: AddressSchema.optional(),
  /** Web tal y como la publica la fuente (OSM `website` o Wikidata P856). */
  website: z.url().optional(),
  /** De dónde sale `website`: la web oficial (P856) tiene prioridad (REQUISITOS §12). */
  websiteSource: z.enum(["wikidata", "osm"]).optional(),
  phone: z.string().optional(),
  /** Horario en formato `opening_hours` de OSM, sin interpretar. */
  openingHours: z.string().optional(),
  wikidataId: z
    .string()
    .regex(/^Q\d+$/)
    .optional(),
  wikipedia: z.string().optional(),
  image: PlaceImageSchema.optional(),
  /** Accesibilidad en silla de ruedas según OSM (`wheelchair`). */
  wheelchair: z.enum(["yes", "limited", "no"]).optional(),
  cuisine: z.array(z.string()).optional(),
  /** Estrellas declaradas en OSM (`stars`), solo alojamiento. */
  stars: z.number().min(0).max(7).optional(),
  /**
   * Estaciones y paradas: líneas según OSM (`route_ref`), red y operador. Son las etiquetas del
   * mapa, no un horario: pueden estar desactualizadas y la UI lo indica.
   */
  transit: z
    .object({
      lines: z.array(z.string().min(1)).default([]),
      network: z.string().optional(),
      operator: z.string().optional(),
    })
    .optional(),
});
export type Place = z.infer<typeof PlaceSchema>;
