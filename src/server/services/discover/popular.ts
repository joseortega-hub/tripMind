import type { PlacePopularity } from "@/domain/discover";
import type { Place } from "@/domain/place";
import type { ProviderSelection } from "@/server/providers/core/registry";
import { ProviderError } from "@/server/providers/core/types";
import {
  articleFromTag,
  articleKey,
  type DailyViews,
  PAGEVIEWS_NAME,
  type PageviewsProvider,
} from "@/server/providers/pageviews";

/** Artículos que se consultan como máximo (los lugares llegan ordenados por relevancia). */
export const MAX_ARTICLES = 25;
const PERIOD_DAYS = 60;
const RECENT_DAYS = 7;
/** "Popular ahora": la última semana supera en un 50 % la media anterior… */
const TRENDING_RATIO = 1.5;
/** …y tiene un mínimo de visitas al día (evita picos de artículos casi sin lectores). */
const MIN_RECENT_DAILY = 20;

const shift = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/** Compara la media de la última semana con la de las semanas anteriores (días sin dato = 0). */
export function popularityFrom(views: DailyViews[], from: string, to: string) {
  const byDate = new Map(views.map((day) => [day.date, day.views]));
  const recentStart = shift(to, -(RECENT_DAYS - 1));
  const recent: number[] = [];
  const baseline: number[] = [];
  for (let date = from; date <= to; date = shift(date, 1)) {
    (date >= recentStart ? recent : baseline).push(byDate.get(date) ?? 0);
  }
  const recentDaily = Math.round(mean(recent));
  const baselineDaily = Math.round(mean(baseline));
  const ratio = baselineDaily > 0 ? Math.round((recentDaily / baselineDaily) * 100) / 100 : null;
  return {
    recentDaily,
    baselineDaily,
    ratio,
    isTrending:
      recentDaily >= MIN_RECENT_DAILY && (ratio === null ? false : ratio >= TRENDING_RATIO),
  };
}

export interface PopularResult {
  results: PlacePopularity[];
  status: "ok" | "unavailable";
  from: string;
  to: string;
}

/** Visitas de Wikipedia de los lugares con artículo (etiqueta OSM `wikipedia`). */
export async function popularPlaces(
  places: readonly Place[],
  selection: ProviderSelection<PageviewsProvider>,
): Promise<PopularResult> {
  const { provider } = selection;
  const to = provider.lastAvailableDay();
  const from = shift(to, -(PERIOD_DAYS - 1));
  const seen = new Set<string>();
  const targets: { place: Place; article: NonNullable<ReturnType<typeof articleFromTag>> }[] = [];
  for (const place of places) {
    const article = place.wikipedia ? articleFromTag(place.wikipedia) : undefined;
    if (!article || seen.has(articleKey(article))) continue;
    seen.add(articleKey(article));
    targets.push({ place, article });
    if (targets.length >= MAX_ARTICLES) break;
  }

  const results: PlacePopularity[] = [];
  let failures = 0;
  // De cinco en cinco: uso moderado de la API de Wikimedia.
  for (let index = 0; index < targets.length; index += 5) {
    const batch = targets.slice(index, index + 5);
    const settled = await Promise.allSettled(
      batch.map(({ article }) => provider.daily(article, from, to)),
    );
    settled.forEach((outcome, i) => {
      const { place, article } = batch[i]!;
      if (outcome.status === "rejected") {
        if (!(outcome.reason instanceof ProviderError)) throw outcome.reason;
        failures += 1;
        return;
      }
      if (outcome.value.views.length === 0) return;
      results.push({
        placeId: place.id,
        article: `${article.project}:${article.title.replace(/_/g, " ")}`,
        ...popularityFrom(outcome.value.views, from, to),
        from,
        to,
        source: {
          name: `${PAGEVIEWS_NAME} (visitas en Wikipedia)`,
          url: `https://pageviews.wmcloud.org/?project=${article.project}.org&pages=${encodeURIComponent(article.title)}&range=latest-60`,
          retrievedAt: outcome.value.retrievedAt,
          license: "CC0",
        },
        isDemo: selection.isDemo,
      });
    });
  }
  results.sort(
    (a, b) => Number(b.isTrending) - Number(a.isTrending) || (b.ratio ?? 0) - (a.ratio ?? 0),
  );
  return {
    results,
    status: failures > 0 && results.length === 0 && targets.length > 0 ? "unavailable" : "ok",
    from,
    to,
  };
}
