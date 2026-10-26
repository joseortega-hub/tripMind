import type { PlaceCategory } from "@/domain/place";

type Tags = Record<string, string | undefined>;

/**
 * Filtros Overpass por categoría (todos exigen `name`). Los lugares de culto se limitan a los que
 * tienen Wikidata para quedarse con los relevantes y no con cada parroquia.
 */
export const OVERPASS_FILTERS: Record<PlaceCategory, string[]> = {
  museum: ['["tourism"="museum"]'],
  gallery: ['["tourism"="gallery"]'],
  monument: [
    '["historic"~"^(monument|castle|palace)$"]',
    // Las placas conmemorativas y "stolpersteine" son memoriales, pero no un punto turístico.
    '["historic"="memorial"]["memorial"!~"^(plaque|stolperstein|blue_plaque)$"]',
  ],
  attraction: ['["tourism"="attraction"]'],
  viewpoint: ['["tourism"="viewpoint"]'],
  park: ['["leisure"="park"]', '["leisure"="garden"]["access"!="private"]'],
  place_of_worship: ['["amenity"="place_of_worship"]["wikidata"]'],
  theatre: ['["amenity"="theatre"]'],
  restaurant: ['["amenity"="restaurant"]'],
  cafe: ['["amenity"="cafe"]'],
  bar: ['["amenity"~"^(bar|pub)$"]'],
  fast_food: ['["amenity"="fast_food"]'],
  hotel: ['["tourism"="hotel"]'],
  hostel: ['["tourism"="hostel"]'],
  apartment: ['["tourism"="apartment"]'],
  guest_house: ['["tourism"="guest_house"]'],
  train_station: ['["railway"="station"]["station"!="subway"]'],
  metro_station: ['["railway"="station"]["station"="subway"]'],
  bus_station: ['["amenity"="bus_station"]'],
};

/**
 * Clasifica un elemento OSM en una categoría. El orden importa: un museo con `historic=palace`
 * (Palacio Real) se muestra como museo. Devuelve undefined si no encaja en ninguna capa.
 */
export function classifyOsmTags(tags: Tags): PlaceCategory | undefined {
  const { tourism, amenity, historic, leisure, railway, station, access, memorial } = tags;
  if (tourism === "museum") return "museum";
  if (tourism === "gallery") return "gallery";
  if (amenity === "theatre") return "theatre";
  if (tourism === "hotel") return "hotel";
  if (tourism === "hostel") return "hostel";
  if (tourism === "apartment") return "apartment";
  if (tourism === "guest_house") return "guest_house";
  if (amenity === "restaurant") return "restaurant";
  if (amenity === "cafe") return "cafe";
  if (amenity === "bar" || amenity === "pub") return "bar";
  if (amenity === "fast_food") return "fast_food";
  if (railway === "station") return station === "subway" ? "metro_station" : "train_station";
  if (amenity === "bus_station") return "bus_station";
  if (historic && ["monument", "castle", "palace"].includes(historic)) return "monument";
  if (
    historic === "memorial" &&
    !["plaque", "stolperstein", "blue_plaque"].includes(memorial ?? "")
  ) {
    return "monument";
  }
  if (amenity === "place_of_worship" && tags.wikidata) return "place_of_worship";
  if (tourism === "viewpoint") return "viewpoint";
  if (leisure === "park" || (leisure === "garden" && access !== "private")) return "park";
  if (tourism === "attraction") return "attraction";
  return undefined;
}
