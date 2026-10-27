import { z } from "zod";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig, type ProvidersConfig } from "../core/config";
import { type FetchLike, fetchJson, parseProviderResponse, userAgent } from "../core/http";
import { type ProviderSelection, selectProvider } from "../core/registry";
import { ProviderError, type ProviderInfo } from "../core/types";
import fixture from "./fixtures/pageviews.json";

export const PAGEVIEWS_NAME = "Wikimedia Pageviews API";

/** Artículo de Wikipedia a partir de la etiqueta OSM `wikipedia` ("es:Museo del Prado"). */
export interface WikiArticle {
  /** Proyecto, p. ej. "es.wikipedia". */
  project: string;
  /** Título con guiones bajos, sin ancla. */
  title: string;
}

export function articleFromTag(tag: string): WikiArticle | undefined {
  const match = tag.match(/^([a-z]{2,3}(?:-[a-z]+)?):(.+)$/i);
  if (!match) return undefined;
  const title = match[2]!.split("#")[0]!.trim().replace(/ /g, "_");
  if (!title) return undefined;
  return { project: `${match[1]!.toLowerCase()}.wikipedia`, title };
}

export const articleKey = (article: WikiArticle) => `${article.project}:${article.title}`;

export interface DailyViews {
  date: string;
  views: number;
}

export interface PageviewsProvider extends ProviderInfo {
  /** Visitas diarias (usuarios, todos los accesos) del artículo entre dos fechas incluidas. */
  daily(
    article: WikiArticle,
    from: string,
    to: string,
  ): Promise<{ views: DailyViews[]; retrievedAt: string }>;
  /** Último día con datos que se puede pedir (en demo, el de la grabación). */
  lastAvailableDay(): string;
}

const compact = (date: string) => date.replaceAll("-", "");

export function pageviewsUrl(article: WikiArticle, from: string, to: string) {
  return (
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/" +
    `${article.project}/all-access/user/${encodeURIComponent(article.title)}/daily/` +
    `${compact(from)}/${compact(to)}`
  );
}

export const PageviewsResponseSchema = z.object({
  items: z.array(z.object({ timestamp: z.string(), views: z.number().int().nonnegative() })),
});

export function mapPageviews(raw: z.infer<typeof PageviewsResponseSchema>): DailyViews[] {
  return raw.items.map((item) => ({
    date: `${item.timestamp.slice(0, 4)}-${item.timestamp.slice(4, 6)}-${item.timestamp.slice(6, 8)}`,
    views: item.views,
  }));
}

const HOUR = 60 * 60 * 1000;
const CachedSchema = z.object({
  views: z.array(z.object({ date: z.string(), views: z.number() })),
  retrievedAt: z.iso.datetime(),
});

/** Ayer en UTC: Wikimedia publica los datos del día anterior. */
const yesterday = () => new Date(Date.now() - 24 * HOUR).toISOString().slice(0, 10);

export function createRealPageviewsProvider(deps: {
  userAgent: string;
  cache: CacheStore;
  fetch?: FetchLike;
}): PageviewsProvider {
  return {
    id: "wikimedia-pageviews",
    name: PAGEVIEWS_NAME,
    isDemo: false,
    lastAvailableDay: yesterday,
    async daily(article, from, to) {
      const { value } = await cached(
        deps.cache,
        {
          key: cacheKey("pageviews", articleKey(article), from, to),
          provider: "wikimedia-pageviews",
          ttlMs: 12 * HOUR,
          schema: CachedSchema,
        },
        async () => {
          let raw: unknown;
          try {
            raw = await fetchJson(pageviewsUrl(article, from, to), {
              providerId: "wikimedia-pageviews",
              userAgent: deps.userAgent,
              fetch: deps.fetch,
            });
          } catch (error) {
            // 404: el artículo no tiene visitas en ese periodo (o no existe).
            if (error instanceof ProviderError && error.options.status === 404) {
              return { views: [], retrievedAt: new Date().toISOString() };
            }
            throw error;
          }
          return {
            views: mapPageviews(
              parseProviderResponse(PageviewsResponseSchema, raw, "wikimedia-pageviews"),
            ),
            retrievedAt: new Date().toISOString(),
          };
        },
      );
      return value;
    },
  };
}

const recorded = fixture as unknown as {
  recordedAt: string;
  from: string;
  to: string;
  articles: Record<string, unknown>;
};

/** Demo: visitas reales grabadas de los artículos de los lugares de Madrid centro. */
export function createDemoPageviewsProvider(): PageviewsProvider {
  return {
    id: "demo-pageviews",
    name: "Demostración (visitas grabadas de Wikimedia Pageviews)",
    isDemo: true,
    lastAvailableDay: () => recorded.to,
    async daily(article, from, to) {
      const hit = recorded.articles[articleKey(article)];
      if (!hit) return { views: [], retrievedAt: recorded.recordedAt };
      const views = mapPageviews(PageviewsResponseSchema.parse(hit)).filter(
        (day) => day.date >= from && day.date <= to,
      );
      return { views, retrievedAt: recorded.recordedAt };
    },
  };
}

/** La política de Wikimedia pide un User-Agent con contacto (CONTACT_EMAIL). */
export function getPageviewsProvider(
  config: ProvidersConfig = getProvidersConfig(),
): ProviderSelection<PageviewsProvider> {
  return selectProvider(config.mode, {
    missingConfig: config.contactEmail ? [] : ["CONTACT_EMAIL"],
    real: () =>
      createRealPageviewsProvider({
        userAgent: userAgent(config.contactEmail),
        cache: getCacheStore(),
      }),
    demo: createDemoPageviewsProvider,
  });
}
