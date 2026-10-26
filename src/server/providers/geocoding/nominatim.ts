import { z } from "zod";
import type { BBox } from "@/domain/geo";
import type { GeocodeKind, GeocodeResult } from "@/domain/geocoding";
import { fetchJson, parseProviderResponse, type FetchLike } from "../core/http";
import { osmId, osmSource, toOsmType } from "../core/osm";
import { RateLimiter } from "../core/rate-limit";
import type { GeocodeQuery } from "./types";

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const NOMINATIM_NAME = "Nominatim · OpenStreetMap";

/** Política de uso de Nominatim: como máximo 1 petición por segundo (por proceso). */
export const nominatimLimiter = new RateLimiter(1000);

const NominatimItemSchema = z.object({
  osm_type: z.string(),
  osm_id: z.number(),
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  category: z.string().optional(),
  addresstype: z.string().optional(),
  name: z.string().optional(),
  display_name: z.string(),
  address: z.record(z.string(), z.string()).optional(),
  /** [sur, norte, oeste, este] como cadenas */
  boundingbox: z
    .tuple([z.coerce.number(), z.coerce.number(), z.coerce.number(), z.coerce.number()])
    .optional(),
});

export const NominatimResponseSchema = z.array(NominatimItemSchema);
export type NominatimResponse = z.infer<typeof NominatimResponseSchema>;

export function nominatimUrl({ q, limit }: GeocodeQuery): string {
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    "accept-language": "es",
  });
  return `${NOMINATIM_URL}?${params}`;
}

const KIND_BY_ADDRESSTYPE: Record<string, GeocodeKind> = {
  country: "country",
  state: "region",
  region: "region",
  province: "region",
  county: "region",
  city: "city",
  town: "city",
  village: "city",
  municipality: "city",
  suburb: "district",
  quarter: "district",
  neighbourhood: "district",
  city_district: "district",
  road: "street",
  house: "address",
  building: "address",
};

export function mapNominatimResponse(
  response: NominatimResponse,
  { retrievedAt, isDemo }: { retrievedAt: string; isDemo: boolean },
): GeocodeResult[] {
  const results: GeocodeResult[] = [];
  for (const item of response) {
    const type = toOsmType(item.osm_type);
    const name = item.name || item.display_name.split(",")[0]?.trim();
    if (!type || !name) continue;

    const box = item.boundingbox;
    const bbox: BBox | undefined = box && [box[2], box[0], box[3], box[1]];
    const kind =
      KIND_BY_ADDRESSTYPE[item.addresstype ?? ""] ??
      (item.category && item.category !== "place" && item.category !== "boundary"
        ? "poi"
        : "other");
    results.push({
      id: osmId(type, item.osm_id),
      name,
      label: item.display_name,
      kind,
      location: { lat: item.lat, lng: item.lon },
      bbox: bbox && bbox[0] < bbox[2] && bbox[1] < bbox[3] ? bbox : undefined,
      countryCode: item.address?.country_code?.toUpperCase(),
      source: osmSource(NOMINATIM_NAME, type, item.osm_id, retrievedAt),
      isDemo,
    });
  }
  return results;
}

export async function nominatimSearch(
  query: GeocodeQuery,
  deps: { userAgent: string; fetch?: FetchLike; limiter?: RateLimiter },
): Promise<GeocodeResult[]> {
  const limiter = deps.limiter ?? nominatimLimiter;
  const raw = await limiter.schedule(() =>
    fetchJson(nominatimUrl(query), { providerId: "nominatim", ...deps }),
  );
  const response = parseProviderResponse(NominatimResponseSchema, raw, "nominatim");
  return mapNominatimResponse(response, { retrievedAt: new Date().toISOString(), isDemo: false });
}
