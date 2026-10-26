import type { GeocodeResult } from "@/domain/geocoding";
import { normalizeText } from "../core/osm";
import nominatimFixture from "./fixtures/nominatim.json";
import photonFixture from "./fixtures/photon.json";
import { mapNominatimResponse, NominatimResponseSchema } from "./nominatim";
import { mapPhotonResponse, PhotonResponseSchema } from "./photon";
import type { GeocodeQuery, GeocodingProvider } from "./types";

/**
 * Resultados grabados de respuestas reales de Photon y Nominatim (Madrid y Barcelona).
 * Se pasan por los mismos mapeadores que el adaptador real, con `isDemo: true`.
 */
function loadFixtures(): { query: string; results: GeocodeResult[] }[] {
  const meta = { retrievedAt: photonFixture.recordedAt, isDemo: true };
  const photon = photonFixture.entries.map((entry) => ({
    query: entry.query,
    results: mapPhotonResponse(PhotonResponseSchema.parse(entry.response), meta),
  }));
  const nominatim = nominatimFixture.entries.map((entry) => ({
    query: entry.query,
    results: mapNominatimResponse(NominatimResponseSchema.parse(entry.response), {
      retrievedAt: nominatimFixture.recordedAt,
      isDemo: true,
    }),
  }));
  return [...photon, ...nominatim];
}

let fixtures: ReturnType<typeof loadFixtures> | undefined;

/** Busca entre los resultados grabados: primero los de la consulta grabada que encaja, luego por texto. */
export function searchDemo({ q, limit }: GeocodeQuery): GeocodeResult[] {
  fixtures ??= loadFixtures();
  const needle = normalizeText(q);
  if (!needle) return [];

  const byQuery = fixtures.filter((f) => f.query.startsWith(needle) || needle.startsWith(f.query));
  const candidates = [
    ...byQuery.flatMap((f) => f.results),
    ...fixtures.flatMap((f) => f.results).filter((r) => normalizeText(r.label).includes(needle)),
  ];

  const seen = new Set<string>();
  const results: GeocodeResult[] = [];
  for (const result of candidates) {
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    results.push(result);
    if (results.length >= limit) break;
  }
  return results;
}

export function createDemoGeocodingProvider(): GeocodingProvider {
  const respond = async (query: GeocodeQuery) => ({
    results: searchDemo(query),
    providerId: "demo-geocoding",
    fromCache: false,
  });
  return {
    id: "demo-geocoding",
    name: "Demostración (respuestas grabadas de Photon/Nominatim)",
    isDemo: true,
    autocomplete: respond,
    search: respond,
  };
}
