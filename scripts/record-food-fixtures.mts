/**
 * Graba respuestas REALES para la demo de gastronomía (Fase 7):
 * 1. Overpass: heladerías, zonas de restauración y mercados de Madrid centro (las categorías que
 *    se añadieron después de grabar `pois/fixtures/overpass.json`).
 * 2. OSRM (FOSSGIS): matrices a pie de ida y vuelta entre los puntos de la demo (Hotel México y
 *    los 70 lugares turísticos) y los 60 sitios de comida más cercanos a cada uno.
 *
 * Uso: npx tsx scripts/record-food-fixtures.mts
 * Políticas: User-Agent con contacto y ≥1 s entre peticiones a FOSSGIS.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import type { BBox, LatLng } from "../src/domain/geo";
import { straightLineMeters } from "../src/domain/route";
import { fetchJson, userAgent } from "../src/server/providers/core/http";
import {
  buildOverpassQuery,
  mapOverpassResponse,
  OVERPASS_URL,
  OverpassResponseSchema,
} from "../src/server/providers/pois/overpass";
import { osrmTableUrl } from "../src/server/providers/routing/osrm";

const ua = userAgent(process.env.CONTACT_EMAIL?.trim() || undefined);
const recordedAt = new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const NEAREST = 60;
const MAX_POINTS = 100;

const overpassFixture = JSON.parse(
  readFileSync("src/server/providers/pois/fixtures/overpass.json", "utf8"),
);
const bbox = overpassFixture.bbox as BBox;

// 1. Categorías nuevas de la capa de gastronomía.
const query = buildOverpassQuery({
  bbox,
  categories: ["ice_cream", "food_court", "marketplace"],
  limit: 2000,
});
const extra = await fetchJson(OVERPASS_URL, {
  providerId: "overpass",
  form: { data: query },
  timeoutMs: 60_000,
  userAgent: ua,
});
const foodFile = "src/server/providers/pois/fixtures/food.json";
writeFileSync(
  foodFile,
  `${JSON.stringify({ recordedAt, bbox, query, response: extra }, null, 1)}\n`,
);
console.log("✔", foodFile);

const load = (response: unknown, at: string) =>
  mapOverpassResponse(OverpassResponseSchema.parse(response), { retrievedAt: at, isDemo: true });
const food = [
  ...load(overpassFixture.response, overpassFixture.recordedAt),
  ...load(extra, recordedAt),
].filter((place) => place.layer === "food");

// 2. Matrices a pie desde/hacia los puntos de la demo de rutas.
const routing = JSON.parse(
  readFileSync("src/server/providers/routing/fixtures/routing.json", "utf8"),
);
const refs = routing.tables[0].origins as LatLng[];
const nearest = (ref: LatLng) =>
  [...food]
    .sort((a, b) => straightLineMeters(ref, a.location) - straightLineMeters(ref, b.location))
    .slice(0, NEAREST)
    .map((place) => place.location);
const key = ({ lat, lng }: LatLng) => `${lat},${lng}`;

/** Agrupa referencias mientras referencias + destinos únicos quepan en una tabla. */
const chunks: { origins: LatLng[]; destinations: LatLng[] }[] = [];
let current: { origins: LatLng[]; destinations: Map<string, LatLng> } | undefined;
for (const ref of refs) {
  const targets = nearest(ref);
  const merged = new Map(current?.destinations);
  for (const target of targets) merged.set(key(target), target);
  if (current && current.origins.length + 1 + merged.size <= MAX_POINTS) {
    current.origins.push(ref);
    current.destinations = merged;
    continue;
  }
  if (current) chunks.push({ ...current, destinations: [...current.destinations.values()] });
  current = { origins: [ref], destinations: new Map(targets.map((t) => [key(t), t])) };
}
if (current) chunks.push({ ...current, destinations: [...current.destinations.values()] });

/** Solo código, duraciones (0,1 s) y distancias (1 m). */
function compact(raw: unknown) {
  const table = raw as {
    code: string;
    durations?: (number | null)[][];
    distances?: (number | null)[][];
  };
  const round = (matrix: (number | null)[][] | undefined, factor: number) =>
    matrix?.map((row) => row.map((v) => (v === null ? null : Math.round(v * factor) / factor)));
  return {
    code: table.code,
    durations: round(table.durations, 10),
    distances: round(table.distances, 1),
  };
}

async function table(origins: LatLng[], destinations: LatLng[]) {
  await sleep(1100);
  const q = { origins, destinations, mode: "walk" as const };
  const response = await fetchJson(osrmTableUrl(q), {
    providerId: "osrm",
    userAgent: ua,
    timeoutMs: 60_000,
  });
  return { ...q, response: compact(response) };
}

const tables = [];
for (const [index, chunk] of chunks.entries()) {
  tables.push(await table(chunk.origins, chunk.destinations));
  tables.push(await table(chunk.destinations, chunk.origins));
  console.log(`  tabla ${index + 1}/${chunks.length}`);
}
const file = "src/server/providers/routing/fixtures/food.json";
writeFileSync(file, `${JSON.stringify({ recordedAt, tables })}\n`);
console.log("✔", file);
