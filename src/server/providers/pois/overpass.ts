import { z } from "zod";
import type { BBox } from "@/domain/geo";
import { type Address, CATEGORY_LAYER, type Place } from "@/domain/place";
import { fetchJson, parseProviderResponse, type FetchLike } from "../core/http";
import { osmId, osmSource } from "../core/osm";
import { classifyOsmTags, OVERPASS_FILTERS } from "./categories";
import type { PlacesQuery } from "./types";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const OVERPASS_NAME = "OpenStreetMap (Overpass API)";

const OverpassElementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

export const OverpassResponseSchema = z.object({ elements: z.array(OverpassElementSchema) });
export type OverpassResponse = z.infer<typeof OverpassResponseSchema>;
type OverpassElement = z.infer<typeof OverpassElementSchema>;

/**
 * Amplía el bbox a una rejilla de ~550 m para que vistas casi iguales compartan caché
 * (y por tanto no repitan la consulta a Overpass).
 */
export function snapBBox([w, s, e, n]: BBox, step = 0.005): BBox {
  const down = (v: number) => Number((Math.floor(v / step) * step).toFixed(6));
  const up = (v: number) => Number((Math.ceil(v / step) * step).toFixed(6));
  return [down(w), down(s), up(e), up(n)];
}

export function buildOverpassQuery({ bbox, categories, limit }: PlacesQuery): string {
  const [w, s, e, n] = bbox;
  const area = `(${s},${w},${n},${e})`;
  const filters = [...new Set(categories.flatMap((category) => OVERPASS_FILTERS[category]))];
  const statements = filters.map((filter) => `  nwr${filter}["name"]${area};`).join("\n");
  return `[out:json][timeout:25];\n(\n${statements}\n);\nout center tags qt ${limit};`;
}

const parseWebsite = (value: string | undefined) =>
  value && z.url({ protocol: /^https?$/ }).safeParse(value).success ? value : undefined;

function addressOf(tags: Record<string, string>): Address | undefined {
  const address: Address = {
    street: tags["addr:street"],
    houseNumber: tags["addr:housenumber"],
    postcode: tags["addr:postcode"],
    city: tags["addr:city"],
    country: tags["addr:country"],
  };
  return Object.values(address).some(Boolean) ? address : undefined;
}

/** Líneas (`route_ref`, separadas por ";"), red y operador de una estación o parada. */
function transitOf(tags: Record<string, string>): NonNullable<Place["transit"]> {
  const lines = (tags.route_ref ?? "")
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    lines: [...new Set(lines)].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    network: tags.network,
    operator: tags.operator,
  };
}

const yesNo = (value: string | undefined) =>
  value === "yes" ? true : value === "no" ? false : undefined;

/** Servicios de un alojamiento según sus etiquetas OSM; sin etiquetas, `undefined`. */
export function lodgingOf(tags: Record<string, string>): Place["lodging"] {
  const rooms = /^\d+$/.test(tags.rooms?.trim() ?? "") ? Number(tags.rooms) : undefined;
  const lodging: NonNullable<Place["lodging"]> = {
    rooms: rooms && rooms > 0 ? rooms : undefined,
    internetAccess: tags.internet_access,
    internetFee: yesNo(tags["internet_access:fee"]),
    airConditioning: yesNo(tags.air_conditioning),
    petsAllowed: yesNo(tags.pets_allowed ?? tags.dog),
    swimmingPool: yesNo(tags.swimming_pool),
    bar: yesNo(tags.bar),
    smoking: tags.smoking,
    checkIn: tags.check_in,
    checkOut: tags.check_out,
    brand: tags.brand,
    operator: tags.operator,
    email: tags.email ?? tags["contact:email"],
  };
  const present = Object.fromEntries(
    Object.entries(lodging).filter(([, value]) => value !== undefined && value !== ""),
  );
  return Object.keys(present).length > 0 ? present : undefined;
}

function mapElement(el: OverpassElement, retrievedAt: string, isDemo: boolean): Place | undefined {
  const tags = el.tags ?? {};
  const name = tags.name;
  const category = classifyOsmTags(tags);
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || !category || lat === undefined || lng === undefined) return undefined;

  const website = parseWebsite(tags.website ?? tags["contact:website"]);
  const wheelchair = tags.wheelchair;
  const stars = Number.parseFloat(tags.stars ?? "");
  const wikidata = tags.wikidata;
  const layer = CATEGORY_LAYER[category];
  return {
    id: osmId(el.type, el.id),
    name,
    category,
    layer,
    location: { lat, lng },
    address: addressOf(tags),
    website,
    websiteSource: website ? "osm" : undefined,
    phone: tags.phone ?? tags["contact:phone"],
    openingHours: tags.opening_hours,
    wikidataId: wikidata && /^Q\d+$/.test(wikidata) ? wikidata : undefined,
    wikipedia: tags.wikipedia,
    wheelchair:
      wheelchair === "yes" || wheelchair === "limited" || wheelchair === "no"
        ? wheelchair
        : undefined,
    cuisine: tags.cuisine
      ?.split(";")
      .map((c) => c.trim())
      .filter(Boolean),
    stars: Number.isFinite(stars) && stars >= 0 && stars <= 7 ? stars : undefined,
    lodging: layer === "lodging" ? lodgingOf(tags) : undefined,
    transit: layer === "transport" ? transitOf(tags) : undefined,
    source: osmSource(OVERPASS_NAME, el.type, el.id, retrievedAt),
    isDemo,
  };
}

/** Convierte elementos OSM en lugares, descartando los que no tienen nombre, categoría o posición. */
export function mapOverpassResponse(
  response: OverpassResponse,
  { retrievedAt, isDemo }: { retrievedAt: string; isDemo: boolean },
): Place[] {
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const element of response.elements) {
    const place = mapElement(element, retrievedAt, isDemo);
    if (place && !seen.has(place.id)) {
      seen.add(place.id);
      places.push(place);
    }
  }
  return places;
}

export async function overpassSearch(
  query: PlacesQuery,
  deps: { userAgent: string; fetch?: FetchLike },
): Promise<Place[]> {
  const raw = await fetchJson(OVERPASS_URL, {
    providerId: "overpass",
    form: { data: buildOverpassQuery(query) },
    // El servidor público puede encolar la consulta; [timeout:25] es solo el tiempo de ejecución.
    timeoutMs: 45_000,
    ...deps,
  });
  const response = parseProviderResponse(OverpassResponseSchema, raw, "overpass");
  return mapOverpassResponse(response, { retrievedAt: new Date().toISOString(), isDemo: false });
}
