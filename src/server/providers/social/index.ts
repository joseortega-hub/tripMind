import { z } from "zod";
import type { SocialPlatform } from "@/domain/discover";
import type { Source } from "@/domain/source";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig } from "../core/config";
import { type FetchLike, fetchJson, parseProviderResponse, userAgent } from "../core/http";

/** Enlace de vídeo reconocido: plataforma, URL normalizada e id del vídeo si va en la URL. */
export interface SocialLink {
  platform: SocialPlatform;
  url: string;
  videoId?: string;
}

const TIKTOK_HOSTS = /^(www\.|m\.|vm\.|vt\.)?tiktok\.com$/i;
const INSTAGRAM_HOSTS = /^(www\.)?instagram\.com$/i;

/**
 * Reconoce un enlace de TikTok o Instagram pegado por el usuario (solo https y dominios oficiales).
 * Devuelve `undefined` para cualquier otra URL.
 */
export function parseSocialLink(input: string): SocialLink | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  url.hash = "";
  if (TIKTOK_HOSTS.test(url.hostname)) {
    const videoId = url.pathname.match(/\/(?:video|photo)\/(\d{5,30})/)?.[1];
    // Los parámetros de seguimiento (`is_from_webapp`, `_r`…) no hacen falta.
    url.search = "";
    return { platform: "tiktok", url: url.toString(), videoId };
  }
  if (INSTAGRAM_HOSTS.test(url.hostname) && /^\/(p|reel|reels|tv)\/[\w-]+/.test(url.pathname)) {
    url.search = "";
    return { platform: "instagram", url: url.toString() };
  }
  return undefined;
}

export interface SocialPreview {
  status: "ok" | "not_configured" | "demo_unavailable" | "unavailable";
  message?: string;
  title?: string;
  authorName?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
  videoId?: string;
  source?: Source;
  isDemo: boolean;
}

export const TikTokOEmbedSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  author_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
  embed_product_id: z.string().optional(),
});

const httpsOrUndefined = (value?: string) => (value?.startsWith("https://") ? value : undefined);

export function mapTikTokOEmbed(
  raw: z.infer<typeof TikTokOEmbedSchema>,
  link: SocialLink,
  retrievedAt: string,
): SocialPreview {
  const videoId = /^\d{5,30}$/.test(raw.embed_product_id ?? "")
    ? raw.embed_product_id
    : link.videoId;
  return {
    status: "ok",
    title: raw.title?.trim() || undefined,
    authorName: raw.author_name?.trim() || undefined,
    authorUrl: httpsOrUndefined(raw.author_url),
    thumbnailUrl: httpsOrUndefined(raw.thumbnail_url),
    videoId,
    source: {
      name: "TikTok (oEmbed)",
      url: link.url,
      retrievedAt,
      attribution: raw.author_name ? `Vídeo de ${raw.author_name} en TikTok` : "Vídeo de TikTok",
    },
    isDemo: false,
  };
}

export interface SocialEmbedProvider {
  preview(link: SocialLink): Promise<SocialPreview>;
}

const HOUR = 60 * 60 * 1000;

export const INSTAGRAM_NOT_CONFIGURED =
  "Instagram exige un token de una app de Meta para su oEmbed: no está configurado. Puedes guardar el enlace sin vista previa.";
export const TIKTOK_DEMO_UNAVAILABLE =
  "Modo demostración: no hay vista previa grabada de TikTok. Elige tú el lugar del vídeo.";

/**
 * oEmbed público de TikTok (sin clave) para título, autor y miniatura. Instagram queda "no
 * configurado": Meta exige token de app con la función oEmbed Read. Nunca se descarga el vídeo.
 */
export function createSocialEmbedProvider(deps: {
  userAgent: string;
  cache: CacheStore;
  demo: boolean;
  fetch?: FetchLike;
}): SocialEmbedProvider {
  return {
    async preview(link) {
      if (link.platform === "instagram") {
        return { status: "not_configured", message: INSTAGRAM_NOT_CONFIGURED, isDemo: false };
      }
      if (deps.demo) {
        return {
          status: "demo_unavailable",
          message: TIKTOK_DEMO_UNAVAILABLE,
          videoId: link.videoId,
          isDemo: true,
        };
      }
      const { value } = await cached(
        deps.cache,
        {
          key: cacheKey("tiktok-oembed", link.url),
          provider: "tiktok-oembed",
          ttlMs: 24 * HOUR,
          schema: z.object({ raw: TikTokOEmbedSchema, retrievedAt: z.iso.datetime() }),
        },
        async () => {
          const raw = await fetchJson(
            `https://www.tiktok.com/oembed?${new URLSearchParams({ url: link.url })}`,
            { providerId: "tiktok-oembed", userAgent: deps.userAgent, fetch: deps.fetch },
          );
          return {
            raw: parseProviderResponse(TikTokOEmbedSchema, raw, "tiktok-oembed"),
            retrievedAt: new Date().toISOString(),
          };
        },
      );
      return mapTikTokOEmbed(value.raw, link, value.retrievedAt);
    },
  };
}

export function getSocialEmbedProvider(): SocialEmbedProvider {
  const config = getProvidersConfig();
  return createSocialEmbedProvider({
    userAgent: userAgent(config.contactEmail),
    cache: getCacheStore(),
    demo: config.mode === "demo",
  });
}
