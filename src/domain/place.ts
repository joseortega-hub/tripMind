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
  "ice_cream",
  "food_court",
  "marketplace",
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
  ice_cream: "food",
  food_court: "food",
  marketplace: "food",
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

/** `diet:*` de OSM: "only" = solo ese tipo de cocina; "limited" = algunas opciones. */
export const DietValueSchema = z.enum(["yes", "only", "limited", "no"]);
export type DietValue = z.infer<typeof DietValueSchema>;

/** Categorías de precio de TripMind (REQUISITOS §10); solo con un rango publicado por una fuente. */
export const PriceCategorySchema = z.enum(["budget", "mid", "special", "luxury"]);
export type PriceCategory = z.infer<typeof PriceCategorySchema>;

export const FoodFactsSchema = z.object({
  vegetarian: DietValueSchema.optional(),
  vegan: DietValueSchema.optional(),
  glutenFree: DietValueSchema.optional(),
  /** `outdoor_seating`: terraza. */
  outdoorSeating: z.boolean().optional(),
  /** `takeaway`: "only" = solo para llevar. */
  takeaway: z.enum(["yes", "only", "no"]).optional(),
  /** `reservation`: si se puede (o hay que) reservar; no es un enlace ni disponibilidad. */
  reservation: z.enum(["yes", "no", "required", "recommended"]).optional(),
  /** Enlace de reserva publicado en la fuente (`reservation:website`, `website:booking`). */
  reservationUrl: z.url().optional(),
  /** Carta en la web del local (`website:menu`). TripMind no muestra ni inventa menús. */
  menuUrl: z.url().optional(),
  /** Rango de precio publicado en la fuente (`price_range` con 1–4 símbolos de moneda). */
  price: z.object({ category: PriceCategorySchema, raw: z.string().min(1) }).optional(),
});
export type FoodFacts = z.infer<typeof FoodFactsSchema>;

/** Etiquetas OSM de tarifa y reserva de una visita (sin interpretar más allá de su valor). */
export const TicketFactsSchema = z.object({
  /** `fee` tal cual: "yes", "no", "donation", o un texto libre ("15€. 2h before closing free."). */
  fee: z.string().min(1).max(300).optional(),
  /** `charge`: importe publicado (p. ej. "12 EUR"). */
  charge: z.string().min(1).max(300).optional(),
  /** `reservation`: yes / no / required / recommended. */
  reservation: z.enum(["yes", "no", "required", "recommended"]).optional(),
  /** Página de venta o reserva publicada en OSM (`website:tickets`, `reservation:website`…). */
  ticketsUrl: z.url().optional(),
});
export type TicketFacts = z.infer<typeof TicketFactsSchema>;

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
  /** Fecha de la consulta a Wikidata cuando `website` sale de P856 (la de OSM está en `source`). */
  websiteRetrievedAt: z.iso.datetime().optional(),
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
   * Alojamiento: servicios declarados en OSM (solo los que tienen etiqueta). Pueden estar
   * desactualizados y la UI los presenta "según OSM".
   */
  lodging: z
    .object({
      rooms: z.number().int().positive().optional(),
      /** `internet_access`: wlan, wired, terminal… o "no". */
      internetAccess: z.string().optional(),
      /** `internet_access:fee`: true si se paga aparte. */
      internetFee: z.boolean().optional(),
      airConditioning: z.boolean().optional(),
      petsAllowed: z.boolean().optional(),
      swimmingPool: z.boolean().optional(),
      bar: z.boolean().optional(),
      smoking: z.string().optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      brand: z.string().optional(),
      operator: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  /**
   * Gastronomía: etiquetas de OSM (dietas, terraza, reservas, rango de precio). Solo las que
   * existen en la fuente; pueden estar desactualizadas y la UI las presenta "según OSM".
   */
  food: FoodFactsSchema.optional(),
  /**
   * Entradas: etiquetas de OSM sobre tarifa y reserva (`fee`, `charge`, `reservation`) y enlace de
   * venta publicado en la fuente. Se conservan tal cual; el estado informativo se deriva de ellas.
   */
  tickets: TicketFactsSchema.optional(),
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
