"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clapperboard, Heart, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DataSource } from "@/components/data-source";
import { favoritesMediaKey, favoritesQueryKey } from "@/components/map/use-trip-places";
import { Button } from "@/components/ui/button";
import type { SavedMedia, SocialPlatform } from "@/domain/discover";
import type { Place } from "@/domain/place";
import type { Source } from "@/domain/source";
import { ApiError, postJson } from "@/lib/api-client";
import { CATEGORY_LABELS } from "@/lib/map/layers";
import { normalizeSearch } from "@/lib/discover";

interface SocialResponse {
  link: { platform: SocialPlatform; url: string; videoId?: string };
  preview: {
    status: "ok" | "not_configured" | "demo_unavailable" | "unavailable";
    message?: string;
    title?: string;
    authorName?: string;
    authorUrl?: string;
    videoId?: string;
    source?: Source;
    isDemo: boolean;
  };
  candidates: Place[];
}

const PLATFORM_NAMES: Record<SocialPlatform, string> = { tiktok: "TikTok", instagram: "Instagram" };

/**
 * "Guardar desde TikTok/Instagram" (REQUISITOS §18): el usuario pega el enlace, TripMind lee el
 * oEmbed público (título y autor), propone lugares del destino mencionados y el usuario CONFIRMA
 * cuál es antes de guardarlo. Nunca se asigna un lugar solo ni se descarga el vídeo.
 */
export function SaveFromSocial({
  tripId,
  places,
  onSaved,
  Heading,
}: {
  tripId: string;
  /** Lugares del destino ya cargados, para elegir otro a mano. */
  places: Place[];
  onSaved: (place: Place) => void;
  Heading: "h3" | "h4";
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [choice, setChoice] = useState<string>();
  const [manual, setManual] = useState("");
  const [saved, setSaved] = useState<Place>();

  const preview = useMutation({
    mutationFn: (value: string) =>
      postJson<SocialResponse>(`/api/trips/${tripId}/social`, { url: value }),
    onMutate: () => {
      setChoice(undefined);
      setSaved(undefined);
    },
    onSuccess: (data) => setChoice(data.candidates[0]?.id),
  });

  const save = useMutation({
    mutationFn: ({ place, media }: { place: Place; media: SavedMedia }) =>
      postJson(`/api/trips/${tripId}/favorites`, { place, media }),
    onSuccess: (_body, { place }) => {
      setSaved(place);
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey(tripId) });
      queryClient.invalidateQueries({ queryKey: favoritesMediaKey(tripId) });
    },
  });

  const data = preview.data;
  const matches = useMemo(() => {
    const query = normalizeSearch(manual);
    if (query.length < 3) return [];
    return places.filter((place) => normalizeSearch(place.name).includes(query)).slice(0, 6);
  }, [manual, places]);
  const options = [
    ...(data?.candidates ?? []),
    ...matches.filter((m) => !data?.candidates.some((c) => c.id === m.id)),
  ];
  const chosen = options.find((place) => place.id === choice);

  const confirm = () => {
    if (!data || !chosen) return;
    const media: SavedMedia = {
      platform: data.link.platform,
      url: data.link.url,
      videoId: data.preview.videoId ?? data.link.videoId,
      title: data.preview.title,
      authorName: data.preview.authorName,
      authorUrl: data.preview.authorUrl,
      source: data.preview.source,
      isDemo: data.preview.isDemo,
      savedAt: new Date().toISOString(),
    };
    save.mutate({ place: chosen, media });
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3"
      data-testid="save-from-social"
    >
      <div className="flex flex-col gap-0.5">
        <Heading id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <Clapperboard className="text-primary size-4" aria-hidden />
          Guardar un sitio de un vídeo
        </Heading>
        <p className="text-muted-foreground text-xs">
          Pega el enlace de un vídeo de TikTok o de una publicación de Instagram. Te proponemos el
          lugar y tú confirmas cuál es. No descargamos el vídeo.
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) preview.mutate(url.trim());
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          Enlace del vídeo
          <input
            type="url"
            inputMode="url"
            required
            placeholder="https://www.tiktok.com/@…/video/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="border-input bg-background focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-3"
          />
        </label>
        <Button type="submit" variant="outline" className="min-h-11" disabled={preview.isPending}>
          <Search aria-hidden />
          {preview.isPending ? "Leyendo el enlace…" : "Buscar el lugar"}
        </Button>
      </form>
      {preview.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {preview.error instanceof ApiError && preview.error.status === 400
            ? preview.error.message
            : `No se ha podido leer el enlace: ${preview.error.message}`}
        </p>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3" data-testid="social-preview">
          <div className="flex flex-col gap-1">
            <p className="text-sm">
              <span className="font-medium">{PLATFORM_NAMES[data.link.platform]}</span>
              {data.preview.authorName ? ` · ${data.preview.authorName}` : ""}
            </p>
            {data.preview.title ? <p className="text-sm">“{data.preview.title}”</p> : null}
            {data.preview.message ? (
              <p className="text-muted-foreground text-xs">{data.preview.message}</p>
            ) : null}
            {data.preview.source ? (
              <DataSource source={data.preview.source} isDemo={data.preview.isDemo} />
            ) : null}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">¿Qué lugar es?</legend>
            {data.candidates.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {data.preview.title
                  ? "No reconocemos ningún lugar del destino en el texto del vídeo. Búscalo tú:"
                  : "Busca el lugar del vídeo:"}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Encontrado en el texto del vídeo. Comprueba que es el correcto.
              </p>
            )}
            <label className="flex flex-col gap-1 text-xs font-medium">
              Buscar un lugar del destino
              <input
                type="search"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                placeholder="Nombre del lugar (mín. 3 letras)"
                className="border-input bg-background focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-3"
              />
            </label>
            {options.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {options.map((place) => (
                  <li key={place.id}>
                    <label className="hover:bg-muted flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm">
                      <input
                        type="radio"
                        name={`${id}-place`}
                        value={place.id}
                        checked={choice === place.id}
                        onChange={() => setChoice(place.id)}
                        className="accent-primary size-4"
                      />
                      <span>
                        {place.name}
                        <span className="text-muted-foreground">
                          {" "}
                          ({CATEGORY_LABELS[place.category]})
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : manual.trim().length >= 3 ? (
              <p className="text-muted-foreground text-xs">
                Ningún lugar cargado en el mapa se llama así.
              </p>
            ) : null}
          </fieldset>

          <Button
            variant="cta"
            className="min-h-11 self-start"
            disabled={!chosen || save.isPending}
            onClick={confirm}
          >
            <Heart aria-hidden />
            {save.isPending
              ? "Guardando…"
              : chosen
                ? `Guardar «${chosen.name}» con el vídeo`
                : "Elige un lugar para guardarlo"}
          </Button>
          {save.isError ? (
            <p role="alert" className="text-destructive text-sm">
              No se ha podido guardar. Inténtalo de nuevo.
            </p>
          ) : null}
          {saved ? (
            <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
              <CheckCircle2 className="text-primary size-4" aria-hidden />
              <span>Guardado en Guardados: {saved.name}. El vídeo está en su ficha.</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary min-h-11"
                onClick={() => onSaved(saved)}
              >
                Ver la ficha
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
