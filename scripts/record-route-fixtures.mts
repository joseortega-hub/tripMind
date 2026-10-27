/**
 * Graba respuestas REALES de rutas y transporte para el modo demo (Fase 4). No genera datos: solo
 * guarda lo que devuelven Overpass (paradas), OSRM de FOSSGIS (rutas y matrices) y Transitous.
 *
 * Uso: npx tsx scripts/record-route-fixtures.mts
 * Políticas: User-Agent con contacto, ≥1 s entre peticiones a FOSSGIS y pocas consultas /plan
 * a Transitous (muy por debajo de las 720 diarias que piden coordinar).
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BBox, LatLng } from "../src/domain/geo";
import { categoriesForLayers } from "../src/domain/place";
import { fetchJson, userAgent } from "../src/server/providers/core/http";
import {
  buildOverpassQuery,
  mapOverpassResponse,
  OVERPASS_URL,
  OverpassResponseSchema,
} from "../src/server/providers/pois/overpass";
import { osrmRouteUrl, osrmTableUrl } from "../src/server/providers/routing/osrm";
import { transitousPlanUrl } from "../src/server/providers/transit/transitous";

const ua = userAgent(process.env.CONTACT_EMAIL?.trim() || undefined);
const recordedAt = new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function save(dir: string, file: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), `${JSON.stringify(data, null, 1)}\n`);
  console.log("✔", join(dir, file));
}

/** Estaciones y paradas alrededor de la zona demo de lugares (algo más amplia). */
const STOPS_BBOX: BBox = [-3.706, 40.402, -3.682, 40.422];
/** Hotel real del fixture de lugares desde el que se graban los trayectos. */
const HOTEL_ID = "osm:node/167302201";
/** Salida de los planes de transporte: miércoles laborable a las 10:00 en Madrid. */
const DEPARTURE = "2026-10-28T10:00:00+01:00";

const placesFixture = JSON.parse(
  readFileSync("src/server/providers/pois/fixtures/overpass.json", "utf8"),
);
const places = mapOverpassResponse(OverpassResponseSchema.parse(placesFixture.response), {
  retrievedAt: placesFixture.recordedAt,
  isDemo: true,
});
const hotel = places.find((place) => place.id === HOTEL_ID);
if (!hotel) throw new Error(`No está ${HOTEL_ID} en el fixture de lugares`);
const tourism = places.filter((place) => place.layer === "tourism");

async function recordStops() {
  const query = buildOverpassQuery({
    bbox: STOPS_BBOX,
    categories: categoriesForLayers(["transport"]),
    limit: 1000,
  });
  // El servidor público de Overpass a veces responde 502/504 bajo carga: hasta 3 intentos.
  let raw: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      raw = await fetchJson(OVERPASS_URL, {
        providerId: "overpass",
        userAgent: ua,
        form: { data: query },
        timeoutMs: 60_000,
      });
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`Overpass falló (intento ${attempt}), reintento en 20 s`);
      await sleep(20_000);
    }
  }
  save("src/server/providers/pois/fixtures", "stops.json", {
    recordedAt,
    bbox: STOPS_BBOX,
    query,
    response: raw,
  });
  return mapOverpassResponse(OverpassResponseSchema.parse(raw), { retrievedAt: recordedAt, isDemo: true });
}

async function osrm(url: string) {
  await sleep(1100);
  return fetchJson(url, { providerId: "osrm", userAgent: ua, timeoutMs: 60_000 });
}

async function recordRouting(stations: LatLng[]) {
  const from = hotel!.location;
  const routes = [];
  for (const mode of ["walk", "car"] as const) {
    // Lugares turísticos y estaciones (para comparar modos al abrir una estación de la capa 4).
    for (const to of [...tourism.map((place) => place.location), ...stations]) {
      const query = { from, to, mode };
      routes.push({ ...query, response: await osrm(osrmRouteUrl(query)) });
    }
    console.log(`  rutas ${mode}: ${tourism.length + stations.length}`);
  }

  const points = [from, ...tourism.map((place) => place.location)];
  const tables = [];
  for (const mode of ["walk", "car"] as const) {
    const query = { origins: points, destinations: points, mode };
    tables.push({ ...query, response: await osrm(osrmTableUrl(query)) });
  }
  const toStations = { origins: points, destinations: stations, mode: "walk" as const };
  tables.push({ ...toStations, response: await osrm(osrmTableUrl(toStations)) });

  save("src/server/providers/routing/fixtures", "routing.json", {
    recordedAt,
    hotel: { id: hotel!.id, name: hotel!.name, location: from },
    routes,
    tables,
  });
}

async function recordTransit() {
  const plans = [];
  // Solo los lugares con Wikidata (los más relevantes) y las estaciones (no paradas de autobús),
  // para mantener un uso ligero de Transitous.
  for (const place of [...tourism.filter((p) => p.wikidataId), ...savedStations()]) {
    const query = { from: hotel!.location, to: place.location, departure: DEPARTURE };
    const response = await fetchJson(transitousPlanUrl(query), {
      providerId: "transitous",
      userAgent: ua,
      timeoutMs: 60_000,
    });
    plans.push({ ...query, response: trimPlan(response) });
    await sleep(1500);
  }
  save("src/server/providers/transit/fixtures", "transitous.json", { recordedAt, plans });
}

const omit = (value: unknown, keys: string[]) =>
  Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => !keys.includes(key)),
  );

/** Quita lo que la app no usa (depuración, alertas, alternativas, tramos a pie paso a paso…). */
function trimPlan(raw: unknown) {
  const plan = raw as { itineraries?: Record<string, unknown>[]; direct?: { duration: number }[] };
  return {
    direct: (plan.direct ?? []).map((d) => ({ duration: d.duration })),
    itineraries: (plan.itineraries ?? []).map((itinerary) => ({
      ...itinerary,
      legs: (itinerary.legs as Record<string, unknown>[]).map((leg) => {
        const rest = omit(leg, ["steps", "alternatives", "tripFrom", "tripTo"]);
        return {
          ...rest,
          from: omit(rest.from, ["alerts"]),
          to: omit(rest.to, ["alerts"]),
          intermediateStops: Array.isArray(rest.intermediateStops)
            ? rest.intermediateStops.map((stop) => omit(stop, ["alerts"]))
            : undefined,
        };
      }),
    })),
  };
}

function savedStations() {
  const stopsFixture = JSON.parse(
    readFileSync("src/server/providers/pois/fixtures/stops.json", "utf8"),
  );
  return mapOverpassResponse(OverpassResponseSchema.parse(stopsFixture.response), {
    retrievedAt: stopsFixture.recordedAt,
    isDemo: true,
  }).filter((stop) => stop.layer === "transport" && stop.category !== "bus_stop");
}

// `--transit` graba solo los planes; `--routes`, solo rutas y matrices (con las paradas guardadas).
const only = process.argv.find((arg) => arg === "--transit" || arg === "--routes");
if (!only) {
  const stops = await recordStops();
  console.log(`${stops.length} paradas y estaciones`);
}
if (only !== "--transit") await recordRouting(savedStations().map((stop) => stop.location));
if (only !== "--routes") await recordTransit();
