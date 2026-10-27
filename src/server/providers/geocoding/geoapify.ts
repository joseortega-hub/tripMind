import { z } from "zod";
import type { BBox } from "@/domain/geo";
import type { GeocodeKind, GeocodeResult } from "@/domain/geocoding";
import type { Source } from "@/domain/source";
import { fetchJson, parseProviderResponse, type FetchLike } from "../core/http";
import { OSM_ATTRIBUTION, OSM_LICENSE, osmId, osmUrl, toOsmType } from "../core/osm";
import type { GeocodeQuery } from "./types";

export const GEOAPIFY_URL = "https://api.geoapify.com/v1/geocode/autocomplete";
export const GEOAPIFY_NAME = "Geoapify · OpenStreetMap";

/**
 * Esquema tolerante: Geoapify añade campos según el tipo de resultado y solo usamos estos.
 * https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
 */
const GeoapifyResultSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  name: z.string().optional(),
  formatted: z.string().optional(),
  address_line1: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  result_type: z.string().optional(),
  place_id: z.string().optional(),
  bbox: z
    .object({ lon1: z.number(), lat1: z.number(), lon2: z.number(), lat2: z.number() })
    .optional(),
  datasource: z
    .object({
      sourcename: z.string().optional(),
      raw: z
        .object({ osm_id: z.coerce.number().optional(), osm_type: z.string().optional() })
        .loose()
        .optional(),
    })
    .loose()
    .optional(),
});

export const GeoapifyResponseSchema = z.object({ results: z.array(GeoapifyResultSchema) });
export type GeoapifyResponse = z.infer<typeof GeoapifyResponseSchema>;
type GeoapifyResult = z.infer<typeof GeoapifyResultSchema>;

/** La clave va en la URL (así lo pide Geoapify), pero solo se usa en el servidor. */
export function geoapifyUrl({ q, limit, near }: GeocodeQuery, apiKey: string): string {
  const params = new URLSearchParams({
    text: q,
    lang: "es",
    limit: String(limit),
    format: "json",
    apiKey,
  });
  if (near) params.set("bias", `proximity:${near.lng},${near.lat}`);
  return `${GEOAPIFY_URL}?${params}`;
}

const KIND_BY_RESULT_TYPE: Record<string, GeocodeKind> = {
  country: "country",
  state: "region",
  county: "region",
  city: "city",
  suburb: "district",
  district: "district",
  street: "street",
  building: "address",
  amenity: "poi",
};

const unique = (parts: (string | undefined)[]) =>
  parts.filter((part, i, all): part is string => !!part && all.indexOf(part) === i);

function sourceOf(r: GeoapifyResult, retrievedAt: string): { id: string; source: Source } {
  const raw = r.datasource?.raw;
  const type = raw?.osm_type
    ? (toOsmType(raw.osm_type) ?? toOsmType(raw.osm_type.toUpperCase()))
    : undefined;
  const fromOsm = r.datasource?.sourcename === "openstreetmap" && type && raw?.osm_id;
  return {
    id: fromOsm ? osmId(type, raw.osm_id!) : `geoapify:${r.place_id ?? `${r.lat},${r.lon}`}`,
    source: {
      name: GEOAPIFY_NAME,
      url: fromOsm ? osmUrl(type, raw.osm_id!) : "https://www.geoapify.com/",
      retrievedAt,
      license: OSM_LICENSE,
      attribution: `Powered by Geoapify · ${OSM_ATTRIBUTION}`,
    },
  };
}

export function mapGeoapifyResponse(
  response: GeoapifyResponse,
  { retrievedAt, isDemo }: { retrievedAt: string; isDemo: boolean },
): GeocodeResult[] {
  const results: GeocodeResult[] = [];
  for (const r of response.results) {
    const name = r.name ?? r.address_line1 ?? r.city ?? r.country;
    if (!name) continue;
    const { id, source } = sourceOf(r, retrievedAt);
    const bbox: BBox | undefined = r.bbox && [
      Math.min(r.bbox.lon1, r.bbox.lon2),
      Math.min(r.bbox.lat1, r.bbox.lat2),
      Math.max(r.bbox.lon1, r.bbox.lon2),
      Math.max(r.bbox.lat1, r.bbox.lat2),
    ];
    results.push({
      id,
      name,
      label: unique([name, r.city, r.state, r.country]).join(", "),
      kind: KIND_BY_RESULT_TYPE[r.result_type ?? ""] ?? "other",
      location: { lat: r.lat, lng: r.lon },
      bbox: bbox && bbox[0] < bbox[2] && bbox[1] < bbox[3] ? bbox : undefined,
      countryCode: r.country_code?.toUpperCase(),
      source,
      isDemo,
    });
  }
  return results;
}

export async function geoapifyAutocomplete(
  query: GeocodeQuery,
  deps: { apiKey: string; userAgent: string; fetch?: FetchLike },
): Promise<GeocodeResult[]> {
  const raw = await fetchJson(geoapifyUrl(query, deps.apiKey), {
    providerId: "geoapify",
    userAgent: deps.userAgent,
    fetch: deps.fetch,
  });
  const response = parseProviderResponse(GeoapifyResponseSchema, raw, "geoapify");
  return mapGeoapifyResponse(response, { retrievedAt: new Date().toISOString(), isDemo: false });
}
