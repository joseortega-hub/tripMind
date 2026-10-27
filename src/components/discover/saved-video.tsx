"use client";

import { Clapperboard, ExternalLink, Play } from "lucide-react";
import { useId, useState } from "react";
import { DataSource } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import type { SavedMedia } from "@/domain/discover";

const PLATFORM = { tiktok: "TikTok", instagram: "Instagram" } as const;

/**
 * Vídeo desde el que se guardó el lugar. El reproductor oficial de TikTok
 * (`tiktok.com/player/v1/{id}`) se carga solo al pulsar: es contenido de un tercero con sus
 * propias cookies. Instagram sin token de Meta: solo el enlace.
 */
export function SavedVideo({
  media,
  headingLevel = 3,
}: {
  media: SavedMedia;
  headingLevel?: 3 | 4;
}) {
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  const [loaded, setLoaded] = useState(false);
  const platform = PLATFORM[media.platform];
  const embeddable = media.platform === "tiktok" && media.videoId;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-2 border-t pt-4"
      data-testid="saved-video"
    >
      <Heading id={id} className="flex items-center gap-2 text-sm font-semibold">
        <Clapperboard className="text-primary size-4" aria-hidden />
        Lo guardaste desde un vídeo de {platform}
      </Heading>
      {media.title ? <p className="text-sm">“{media.title}”</p> : null}
      {media.authorName ? (
        <p className="text-muted-foreground text-xs">
          Autor:{" "}
          {media.authorUrl ? (
            <a href={media.authorUrl} target="_blank" rel="noreferrer" className="underline">
              {media.authorName}
            </a>
          ) : (
            media.authorName
          )}
        </p>
      ) : null}
      {embeddable && loaded ? (
        <iframe
          src={`https://www.tiktok.com/player/v1/${media.videoId}?description=1&music_info=1`}
          title={`Vídeo de ${platform}${media.authorName ? ` de ${media.authorName}` : ""}`}
          allow="encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="aspect-[9/16] w-full max-w-80 rounded-lg border"
        />
      ) : embeddable ? (
        <div className="flex flex-col gap-1">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 self-start"
            onClick={() => setLoaded(true)}
          >
            <Play aria-hidden />
            Cargar el vídeo de TikTok
          </Button>
          <p className="text-muted-foreground text-xs">
            Se carga el reproductor de TikTok, que puede usar sus propias cookies.
          </p>
        </div>
      ) : null}
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex min-h-11 items-center gap-1 self-start text-sm underline-offset-2 hover:underline"
      >
        <ExternalLink className="size-4" aria-hidden />
        Abrir en {platform} (enlace externo)
      </a>
      {media.source ? <DataSource source={media.source} isDemo={media.isDemo} /> : null}
    </section>
  );
}
