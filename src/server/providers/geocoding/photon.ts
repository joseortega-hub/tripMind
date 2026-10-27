import { z } from "zod";
import type { BBox } from "@/domain/geo";
import type { GeocodeKind, GeocodeResult } from "@/domain/geocoding";
import { fetchJson, parseProviderResponse, type FetchLike } from "../core/http";
import { osmId, osmSource, toOsmType } from "../core/osm";
import type { GeocodeQuery } from "./types";

export const PHOTON_URL = "https://photon.komoot.io/api/";
export const PHOTON_NAME = "Photon (komoot) · OpenStreetMap";

const PhotonFeatureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    osm_type: z.string(),
    osm_id: z.number(),
    osm_key: z.string().optional(),
    osm_value: z.string().optional(),
    type: z.string().optional(),
    name: z.string().optional(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    district: z.string().optional(),
    locality: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    countrycode: z.string().optional(),
    /** [oeste, norte, este, sur] */
    extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  }),
});

export const PhotonResponseSchema = z.object({ features: z.array(PhotonFeatureSchema) });
export type PhotonResponse = z.infer<typeof PhotonResponseSchema>;
type PhotonProperties = z.infer<typeof PhotonFeatureSchema>["properties"];

/**
 * El Photon público solo admite default/de/en/fr. "default" devuelve el nombre local en su
 * alfabeto (София, Polska); "en" da nombres en alfabeto latino y el país se traduce aparte.
 */
export const PHOTON_LANG = "en";

/** Pedimos más de lo necesario para poder reordenar antes de recortar. */
const OVERFETCH = 3;

export function photonUrl({ q, limit, near }: GeocodeQuery): string {
  const params = new URLSearchParams({
    q,
    limit: String(Math.min(limit * OVERFETCH, 30)),
    lang: PHOTON_LANG,
  });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  return `${PHOTON_URL}?${params}`;
}

function kindOf(p: PhotonProperties): GeocodeKind {
  switch (p.type) {
    case "country":
      return "country";
    case "state":
    case "county":
      return "region";
    case "city":
      return "city";
    case "district":
    case "locality":
      return "district";
    case "street":
      return "street";
    case "house":
      // Photon llama "house" a todo lo que tiene dirección: museos, hoteles… y portales.
      return p.osm_key === "place" || p.osm_key === "building" ? "address" : "poi";
    default:
      return "other";
  }
}

const unique = (parts: (string | undefined)[]) =>
  parts.filter((part, i, all): part is string => !!part && all.indexOf(part) === i);

const countryNamesEs = new Intl.DisplayNames(["es"], { type: "region" });

/** Nombre del país en español a partir del código ISO de la fuente (Bulgaria, Polonia). */
export function countryNameEs(countryCode: string | undefined, fallback?: string) {
  if (!countryCode) return fallback;
  try {
    return countryNamesEs.of(countryCode.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Photon ordena por parecido del texto y a menudo pone aldeas homónimas por delante de la
 * ciudad conocida ("Londres" → un pueblo de Argentina antes que Londres). Bajamos pueblos y
 * aldeas al final y respetamos el orden de Photon para todo lo demás (si no, "Roma" sacaría
 * Rumanía antes que Roma).
 */
const SMALL_PLACES = new Set(["village", "hamlet", "isolated_dwelling", "locality"]);
function placeRank(p: PhotonProperties): number {
  return p.osm_key === "place" && p.osm_value && SMALL_PLACES.has(p.osm_value) ? 1 : 0;
}

export function mapPhotonResponse(
  response: PhotonResponse,
  { retrievedAt, isDemo, limit }: { retrievedAt: string; isDemo: boolean; limit?: number },
): GeocodeResult[] {
  const features = response.features
    .map((feature, index) => ({ feature, index }))
    .sort(
      (a, b) =>
        placeRank(a.feature.properties) - placeRank(b.feature.properties) || a.index - b.index,
    )
    .map(({ feature }) => feature);

  const results: GeocodeResult[] = [];
  for (const { geometry, properties: p } of features) {
    const type = toOsmType(p.osm_type);
    const street = p.street && unique([p.street, p.housenumber]).join(" ");
    const name = p.name ?? street;
    if (!type || !name) continue;

    const [lng, lat] = geometry.coordinates;
    const bbox: BBox | undefined = p.extent && [p.extent[0], p.extent[3], p.extent[2], p.extent[1]];
    results.push({
      id: osmId(type, p.osm_id),
      name,
      label: unique([
        name,
        p.name ? street : undefined,
        p.city,
        p.state,
        countryNameEs(p.countrycode, p.country),
      ]).join(", "),
      kind: kindOf(p),
      location: { lat, lng },
      bbox: bbox && bbox[0] < bbox[2] && bbox[1] < bbox[3] ? bbox : undefined,
      countryCode: p.countrycode?.toUpperCase(),
      source: osmSource(PHOTON_NAME, type, p.osm_id, retrievedAt),
      isDemo,
    });
  }
  return limit === undefined ? results : results.slice(0, limit);
}

export async function photonSearch(
  query: GeocodeQuery,
  deps: { userAgent: string; fetch?: FetchLike },
): Promise<GeocodeResult[]> {
  const raw = await fetchJson(photonUrl(query), { providerId: "photon", ...deps });
  const response = parseProviderResponse(PhotonResponseSchema, raw, "photon");
  return mapPhotonResponse(response, {
    retrievedAt: new Date().toISOString(),
    isDemo: false,
    limit: query.limit,
  });
}
