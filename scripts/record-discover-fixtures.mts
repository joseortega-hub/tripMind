/**
 * Graba respuestas REALES para la demo de la Fase 9: festivos de Nager.Date (España 2026 y
 * 2027), previsión de Open-Meteo para Madrid centro y visitas de Wikipedia (Wikimedia Pageviews)
 * de los artículos de los lugares grabados en `pois/fixtures/overpass.json`. No genera datos.
 *
 * Uso: npx tsx scripts/record-discover-fixtures.mts
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchJson, userAgent } from "../src/server/providers/core/http";
import { nagerUrl } from "../src/server/providers/holidays";
import { articleFromTag, articleKey, pageviewsUrl } from "../src/server/providers/pageviews";
import { openMeteoUrl } from "../src/server/providers/weather";

const ua = userAgent(process.env.CONTACT_EMAIL?.trim() || undefined);
const recordedAt = new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function save(dir: string, file: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), `${JSON.stringify(data)}\n`);
  console.log("✔", join(dir, file));
}

const get = (url: string, providerId: string) => fetchJson(url, { providerId, userAgent: ua });

async function holidays() {
  const responses: Record<string, unknown> = {};
  for (const year of [2026, 2027]) {
    responses[`ES-${year}`] = await get(nagerUrl(year, "ES"), "nager-date");
  }
  save("src/server/providers/holidays/fixtures", "nager.json", { recordedAt, responses });
}

/** Centro del destino de las demos (Madrid, el mismo que usan los E2E). */
const MADRID = { lat: 40.4125, lng: -3.6945 };

async function weather() {
  const response = await get(openMeteoUrl(MADRID), "open-meteo");
  save("src/server/providers/weather/fixtures", "open-meteo.json", {
    recordedAt,
    at: MADRID,
    response,
  });
}

async function pageviews() {
  const overpass = JSON.parse(
    readFileSync("src/server/providers/pois/fixtures/overpass.json", "utf8"),
  ) as { response: { elements: { tags?: Record<string, string> }[] } };
  const tags = new Set<string>();
  for (const element of overpass.response.elements) {
    if (element.tags?.wikipedia) tags.add(element.tags.wikipedia);
  }
  const day = 24 * 60 * 60 * 1000;
  const to = new Date(Date.now() - day).toISOString().slice(0, 10);
  const from = new Date(Date.now() - 60 * day).toISOString().slice(0, 10);
  const articles: Record<string, unknown> = {};
  for (const tag of tags) {
    const article = articleFromTag(tag);
    if (!article || articles[articleKey(article)]) continue;
    try {
      articles[articleKey(article)] = await get(
        pageviewsUrl(article, from, to),
        "wikimedia-pageviews",
      );
    } catch (error) {
      console.warn("sin datos:", tag, (error as Error).message);
    }
    await sleep(200);
  }
  save("src/server/providers/pageviews/fixtures", "pageviews.json", {
    recordedAt,
    from,
    to,
    articles,
  });
}

await holidays();
await weather();
await pageviews();
