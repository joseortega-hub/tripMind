/**
 * Graba matrices REALES de OSRM (FOSSGIS) desde los alojamientos del fixture de lugares para el
 * modo demo (Fase 6): a pie hacia los lugares turísticos y las estaciones, y a pie y en coche
 * de ida y vuelta entre alojamientos y lugares (para recalcular el itinerario al cambiar de hotel).
 *
 * Uso: npx tsx scripts/record-lodging-fixtures.mts
 * Política de FOSSGIS: User-Agent con contacto y ≥1 s entre peticiones (unas 32 tablas).
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import type { LatLng } from "../src/domain/geo";
import { fetchJson, userAgent } from "../src/server/providers/core/http";
import { mapOverpassResponse, OverpassResponseSchema } from "../src/server/providers/pois/overpass";
import { osrmTableUrl } from "../src/server/providers/routing/osrm";

const ua = userAgent(process.env.CONTACT_EMAIL?.trim() || undefined);
const recordedAt = new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Alojamientos por tabla: 10 + 70 lugares + 18 estaciones = 98 puntos (máximo 100). */
const CHUNK = 10;

function load(file: string) {
  const fixture = JSON.parse(readFileSync(file, "utf8"));
  return mapOverpassResponse(OverpassResponseSchema.parse(fixture.response), {
    retrievedAt: fixture.recordedAt,
    isDemo: true,
  });
}

const places = load("src/server/providers/pois/fixtures/overpass.json");
const tourism = places.filter((place) => place.layer === "tourism").map((p) => p.location);
const lodging = places.filter((place) => place.layer === "lodging");
const stations = load("src/server/providers/pois/fixtures/stops.json")
  .filter((stop) => stop.layer === "transport" && stop.category !== "bus_stop")
  .map((stop) => stop.location);

async function table(origins: LatLng[], destinations: LatLng[], mode: "walk" | "car") {
  await sleep(1100);
  const query = { origins, destinations, mode };
  const response = await fetchJson(osrmTableUrl(query), {
    providerId: "osrm",
    userAgent: ua,
    timeoutMs: 60_000,
  });
  return { ...query, response: compact(response) };
}

/** Solo código, duraciones (0,1 s) y distancias (1 m): sin `sources`/`destinations` repetidos. */
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

const tables = [];
for (let start = 0; start < lodging.length; start += CHUNK) {
  const chunk = lodging.slice(start, start + CHUNK).map((place) => place.location);
  tables.push(await table(chunk, [...tourism, ...stations], "walk"));
  tables.push(await table(tourism, chunk, "walk"));
  tables.push(await table(chunk, tourism, "car"));
  tables.push(await table(tourism, chunk, "car"));
  console.log(`  alojamientos ${start + chunk.length}/${lodging.length}`);
}

const file = "src/server/providers/routing/fixtures/lodging.json";
writeFileSync(
  file,
  `${JSON.stringify({ recordedAt, lodging: lodging.map((p) => p.id), tables })}\n`,
);
console.log("✔", file);
