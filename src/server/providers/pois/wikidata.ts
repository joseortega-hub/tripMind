import { z } from "zod";
import type { Place, PlaceImage } from "@/domain/place";
import { fetchJson, parseProviderResponse, type FetchLike } from "../core/http";

export const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Máximo de ids/títulos por petición que admiten las APIs de MediaWiki. */
const BATCH = 50;

// ---------- Wikidata: P18 (imagen) y P856 (web oficial) ----------

const ClaimSchema = z.object({
  rank: z.string().optional(),
  mainsnak: z.object({
    snaktype: z.string(),
    datavalue: z.object({ value: z.unknown() }).optional(),
  }),
});

export const WikidataEntitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      missing: z.string().optional(),
      claims: z.record(z.string(), z.array(ClaimSchema)).optional(),
    }),
  ),
});
export type WikidataEntitiesResponse = z.infer<typeof WikidataEntitiesSchema>;

export const WikidataFactsSchema = z.object({
  imageFile: z.string().optional(),
  website: z.url().optional(),
});
export type WikidataFacts = z.infer<typeof WikidataFactsSchema>;

export function wikidataEntitiesUrl(ids: string[]): string {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "claims",
    format: "json",
  });
  return `${WIKIDATA_API}?${params}`;
}

/** Valor de la mejor declaración (preferida > normal; nunca obsoleta). */
function bestValue(claims: z.infer<typeof ClaimSchema>[] | undefined): string | undefined {
  const usable = (claims ?? []).filter(
    (c) => c.rank !== "deprecated" && c.mainsnak.snaktype === "value",
  );
  const best = usable.find((c) => c.rank === "preferred") ?? usable[0];
  const value = best?.mainsnak.datavalue?.value;
  return typeof value === "string" ? value : undefined;
}

export function parseWikidataEntities(
  response: WikidataEntitiesResponse,
): Record<string, WikidataFacts> {
  const facts: Record<string, WikidataFacts> = {};
  for (const [id, entity] of Object.entries(response.entities)) {
    if (entity.missing !== undefined) continue;
    const website = bestValue(entity.claims?.P856);
    facts[id] = {
      imageFile: bestValue(entity.claims?.P18),
      website:
        website && z.url({ protocol: /^https?$/ }).safeParse(website).success ? website : undefined,
    };
  }
  return facts;
}

// ---------- Wikimedia Commons: URL, autor y licencia de la imagen ----------

const MetaValue = z.object({ value: z.unknown() }).optional();

export const CommonsImageInfoSchema = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          missing: z.boolean().optional(),
          imageinfo: z
            .array(
              z.object({
                url: z.url(),
                thumburl: z.url().optional(),
                descriptionurl: z.url(),
                extmetadata: z
                  .object({ Artist: MetaValue, LicenseShortName: MetaValue, LicenseUrl: MetaValue })
                  .optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});
export type CommonsImageInfoResponse = z.infer<typeof CommonsImageInfoSchema>;

export const CommonsImageSchema = z.object({
  url: z.url(),
  thumbnailUrl: z.url().optional(),
  descriptionUrl: z.url(),
  author: z.string().optional(),
  license: z.string(),
  licenseUrl: z.url().optional(),
});
export type CommonsImage = z.infer<typeof CommonsImageSchema>;

export const commonsTitle = (file: string) => `File:${file.replace(/_/g, " ")}`;

export function commonsImageInfoUrl(files: string[]): string {
  const params = new URLSearchParams({
    action: "query",
    titles: files.map(commonsTitle).join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "640",
    iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
    format: "json",
    formatversion: "2",
  });
  return `${COMMONS_API}?${params}`;
}

/** El autor viene como HTML (enlaces a su página de usuario): se deja solo el texto. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const metaText = (meta: { value: unknown } | undefined) =>
  typeof meta?.value === "string" && meta.value.trim() ? htmlToText(meta.value) : undefined;

/**
 * Devuelve las imágenes por título normalizado ("File:…"). Las que no traen licencia se descartan:
 * Commons exige mostrar autor y licencia, y sin ella no se pueden usar.
 */
export function parseCommonsImageInfo(
  response: CommonsImageInfoResponse,
): Record<string, CommonsImage> {
  const images: Record<string, CommonsImage> = {};
  for (const page of response.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    const license = metaText(info?.extmetadata?.LicenseShortName);
    if (page.missing || !info || !license) continue;
    const licenseUrl = metaText(info.extmetadata?.LicenseUrl);
    images[page.title] = {
      url: info.url,
      thumbnailUrl: info.thumburl,
      descriptionUrl: info.descriptionurl,
      author: metaText(info.extmetadata?.Artist),
      license,
      licenseUrl: licenseUrl && z.url().safeParse(licenseUrl).success ? licenseUrl : undefined,
    };
  }
  return images;
}

// ---------- Enriquecimiento ----------

export const EnrichmentSchema = z.object({
  retrievedAt: z.iso.datetime(),
  facts: z.record(z.string(), WikidataFactsSchema),
  images: z.record(z.string(), CommonsImageSchema),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

/**
 * Añade web oficial (P856, prioritaria sobre `website` de OSM) e imagen con autor y licencia.
 * Los lugares sin Wikidata o sin datos se devuelven tal cual.
 */
export function applyEnrichment(places: Place[], enrichment: Enrichment): Place[] {
  return places.map((place) => {
    const facts = place.wikidataId ? enrichment.facts[place.wikidataId] : undefined;
    if (!facts) return place;
    const enriched: Place = { ...place };
    if (facts.website) {
      enriched.website = facts.website;
      enriched.websiteSource = "wikidata";
      enriched.websiteRetrievedAt = enrichment.retrievedAt;
    }
    const image = facts.imageFile ? enrichment.images[commonsTitle(facts.imageFile)] : undefined;
    if (image) {
      const placeImage: PlaceImage = {
        url: image.url,
        thumbnailUrl: image.thumbnailUrl,
        author: image.author,
        license: image.license,
        licenseUrl: image.licenseUrl,
        source: {
          name: "Wikimedia Commons",
          url: image.descriptionUrl,
          retrievedAt: enrichment.retrievedAt,
          license: image.license,
          attribution: image.author,
        },
      };
      enriched.image = placeImage;
    }
    return enriched;
  });
}

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

export async function fetchEnrichment(
  wikidataIds: string[],
  deps: { userAgent: string; fetch?: FetchLike },
): Promise<Enrichment> {
  const facts: Record<string, WikidataFacts> = {};
  for (const ids of chunks(wikidataIds, BATCH)) {
    const raw = await fetchJson(wikidataEntitiesUrl(ids), { providerId: "wikidata", ...deps });
    Object.assign(
      facts,
      parseWikidataEntities(parseProviderResponse(WikidataEntitiesSchema, raw, "wikidata")),
    );
  }

  const files = [
    ...new Set(Object.values(facts).flatMap((f) => (f.imageFile ? [f.imageFile] : []))),
  ];
  const images: Record<string, CommonsImage> = {};
  for (const batch of chunks(files, BATCH)) {
    const raw = await fetchJson(commonsImageInfoUrl(batch), { providerId: "commons", ...deps });
    Object.assign(
      images,
      parseCommonsImageInfo(parseProviderResponse(CommonsImageInfoSchema, raw, "commons")),
    );
  }
  return { retrievedAt: new Date().toISOString(), facts, images };
}
