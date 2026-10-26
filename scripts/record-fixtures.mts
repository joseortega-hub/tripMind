/**
 * Graba respuestas REALES de los proveedores para el modo demo. No genera datos: solo guarda lo
 * que devuelven Photon, Nominatim, Overpass, Wikidata y Wikimedia Commons.
 *
 * Uso: npx tsx scripts/record-fixtures.mts
 * Respeta las políticas de uso: User-Agent identificable y ≥1 s entre peticiones a Nominatim.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BBox } from "../src/domain/geo";
import { PlaceCategorySchema } from "../src/domain/place";
import { fetchJson, userAgent } from "../src/server/providers/core/http";
import { nominatimUrl } from "../src/server/providers/geocoding/nominatim";
import { photonUrl } from "../src/server/providers/geocoding/photon";
import {
  buildOverpassQuery,
  mapOverpassResponse,
  OVERPASS_URL,
  OverpassResponseSchema,
} from "../src/server/providers/pois/overpass";
import {
  commonsImageInfoUrl,
  parseWikidataEntities,
  wikidataEntitiesUrl,
  WikidataEntitiesSchema,
} from "../src/server/providers/pois/wikidata";

const ua = userAgent(process.env.CONTACT_EMAIL?.trim() || undefined);
const recordedAt = new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function save(dir: string, file: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), `${JSON.stringify(data, null, 1)}\n`);
  console.log("✔", join(dir, file));
}

const GEO_DIR = "src/server/providers/geocoding/fixtures";
const POI_DIR = "src/server/providers/pois/fixtures";

/** Consultas de autocompletado grabadas (Madrid y Barcelona). */
const PHOTON_QUERIES = [
  "madrid",
  "museo del prado",
  "puerta del sol",
  "retiro",
  "atocha",
  "barcelona",
  "sagrada familia",
];
const NOMINATIM_QUERIES = ["madrid", "museo del prado", "barcelona"];

/** Madrid centro: Paseo del Prado, Barrio de las Letras y Atocha. */
const DEMO_BBOX: BBox = [-3.7, 40.408, -3.688, 40.418];

async function recordGeocoding() {
  const photon = [];
  for (const q of PHOTON_QUERIES) {
    const url = photonUrl({ q, limit: 8 });
    photon.push({
      query: q,
      url,
      response: await fetchJson(url, { providerId: "photon", userAgent: ua }),
    });
    await sleep(500);
  }
  save(GEO_DIR, "photon.json", { recordedAt, entries: photon });

  const nominatim = [];
  for (const q of NOMINATIM_QUERIES) {
    const url = nominatimUrl({ q, limit: 5 });
    nominatim.push({
      query: q,
      url,
      response: await fetchJson(url, { providerId: "nominatim", userAgent: ua }),
    });
    await sleep(1100);
  }
  save(GEO_DIR, "nominatim.json", { recordedAt, entries: nominatim });
}

async function recordPois() {
  const query = buildOverpassQuery({
    bbox: DEMO_BBOX,
    categories: PlaceCategorySchema.options,
    limit: 1000,
  });
  const raw = await fetchJson(OVERPASS_URL, {
    providerId: "overpass",
    userAgent: ua,
    form: { data: query },
    timeoutMs: 60_000,
  });
  save(POI_DIR, "overpass.json", { recordedAt, bbox: DEMO_BBOX, query, response: raw });

  const places = mapOverpassResponse(OverpassResponseSchema.parse(raw), {
    retrievedAt: recordedAt,
    isDemo: true,
  });
  const ids = [...new Set(places.flatMap((p) => (p.wikidataId ? [p.wikidataId] : [])))];
  const wikidata = [];
  const files = new Set<string>();
  for (let i = 0; i < ids.length; i += 50) {
    const url = wikidataEntitiesUrl(ids.slice(i, i + 50));
    const response = WikidataEntitiesSchema.parse(
      await fetchJson(url, { providerId: "wikidata", userAgent: ua }),
    );
    // Solo se conservan las declaraciones que usa la app (P18 imagen, P856 web oficial).
    for (const entity of Object.values(response.entities)) {
      if (entity.claims)
        entity.claims = { P18: entity.claims.P18 ?? [], P856: entity.claims.P856 ?? [] };
    }
    wikidata.push({ url, response });
    for (const facts of Object.values(parseWikidataEntities(response))) {
      if (facts.imageFile) files.add(facts.imageFile);
    }
    await sleep(500);
  }
  save(POI_DIR, "wikidata.json", {
    recordedAt,
    note: "Declaraciones recortadas a P18 y P856",
    entries: wikidata,
  });

  const commons = [];
  const list = [...files];
  for (let i = 0; i < list.length; i += 50) {
    const url = commonsImageInfoUrl(list.slice(i, i + 50));
    commons.push({ url, response: await fetchJson(url, { providerId: "commons", userAgent: ua }) });
    await sleep(500);
  }
  save(POI_DIR, "commons.json", { recordedAt, entries: commons });
  console.log(
    `${places.length} lugares, ${ids.length} entidades Wikidata, ${list.length} imágenes`,
  );
}

await recordGeocoding();
await recordPois();
