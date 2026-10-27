"use client";

import {
  Accessibility,
  Clock,
  ExternalLink,
  Globe,
  Heart,
  MapPin,
  Phone,
  Star,
  TramFront,
  X,
} from "lucide-react";
import Image from "next/image";
import { DataSource } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import type { Place } from "@/domain/place";
import { CATEGORY_LABELS, type MapLayerKey } from "@/lib/map/layers";
import { cn } from "@/lib/utils";
import { LAYER_TEXT, LayerGlyph } from "./layer-style";

const WHEELCHAIR_LABELS = {
  yes: "Accesible en silla de ruedas",
  limited: "Accesibilidad limitada en silla de ruedas",
  no: "No accesible en silla de ruedas",
} as const;

const addressText = (place: Place) =>
  [
    [place.address?.street, place.address?.houseNumber].filter(Boolean).join(" "),
    [place.address?.postcode, place.address?.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

const imageAlt = (place: Place) => `Fotografía de ${place.name} (Wikimedia Commons)`;

export interface FavoriteControl {
  isFavorite: boolean;
  pending: boolean;
  error?: string;
  toggle: () => void;
}

/** Ficha de un lugar: solo muestra lo que trae la fuente, con su procedencia. */
export function PlaceDetail({
  place,
  layer,
  favorite,
  onClose,
  headingLevel = 2,
  children,
}: {
  place: Place;
  layer: MapLayerKey;
  favorite: FavoriteControl;
  onClose: () => void;
  headingLevel?: 2 | 3;
  /** Secciones añadidas por el espacio de trabajo (cómo llegar, qué hay cerca). */
  children?: React.ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const address = addressText(place);
  const image = place.image;

  return (
    <article aria-labelledby="place-detail-title" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <LayerGlyph
          layer={layer === "saved" ? place.layer : layer}
          className="mt-0.5 size-9"
          iconClassName="size-4.5"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Heading
            id="place-detail-title"
            className="text-xl leading-tight font-semibold tracking-tight text-balance"
          >
            {place.name}
          </Heading>
          <p
            className={cn(
              "text-sm font-medium",
              LAYER_TEXT[layer === "saved" ? place.layer : layer],
            )}
          >
            {CATEGORY_LABELS[place.category]}
            {place.stars ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                · <Star className="inline size-3.5 align-[-2px]" aria-hidden /> {place.stars}{" "}
                <span className="sr-only">estrellas</span> según OpenStreetMap
              </span>
            ) : null}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-11" onClick={onClose}>
          <X aria-hidden />
          <span className="sr-only">Cerrar ficha</span>
        </Button>
      </div>

      {image ? (
        <figure className="flex flex-col gap-1.5">
          <div className="bg-muted relative aspect-[16/10] overflow-hidden rounded-lg">
            <Image
              src={image.thumbnailUrl ?? image.url}
              alt={imageAlt(place)}
              fill
              sizes="(min-width: 1280px) 24rem, (min-width: 768px) 22rem, 100vw"
              className="object-cover"
            />
          </div>
          <figcaption className="text-muted-foreground text-xs">
            Foto
            {image.author ? `: ${image.author}` : ""}
            {image.license ? (
              <>
                {" · "}
                {image.licenseUrl ? (
                  <a
                    href={image.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {image.license}
                  </a>
                ) : (
                  image.license
                )}
              </>
            ) : null}
            {" · "}
            {image.source.url ? (
              <a
                href={image.source.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {image.source.name}
              </a>
            ) : (
              image.source.name
            )}
          </figcaption>
        </figure>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={favorite.isFavorite ? "outline" : "cta"}
          aria-pressed={favorite.isFavorite}
          disabled={favorite.pending}
          onClick={favorite.toggle}
          className="min-h-11"
        >
          <Heart
            aria-hidden
            className={cn(favorite.isFavorite && "fill-layer-saved text-layer-saved")}
          />
          {favorite.isFavorite ? "Guardado" : "Guardar"}
        </Button>
        {place.website ? (
          <Button asChild variant="outline" className="min-h-11">
            <a href={place.website} target="_blank" rel="noreferrer">
              <Globe aria-hidden />
              {place.websiteSource === "wikidata" ? "Web oficial" : "Sitio web"}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </Button>
        ) : null}
      </div>
      {favorite.error ? (
        <p role="alert" className="text-destructive text-sm">
          {favorite.error}
        </p>
      ) : null}

      <dl className="flex flex-col gap-2.5 text-sm">
        {address ? (
          <Row icon={MapPin} label="Dirección">
            {address}
          </Row>
        ) : null}
        {place.openingHours ? (
          <Row icon={Clock} label="Horario">
            <span className="font-mono text-[0.8125rem]">{place.openingHours}</span>
            <span className="text-muted-foreground block text-xs">
              Tal y como figura en OpenStreetMap; compruébalo antes de ir.
            </span>
          </Row>
        ) : null}
        {place.phone ? (
          <Row icon={Phone} label="Teléfono">
            <a
              href={`tel:${place.phone.replace(/\s+/g, "")}`}
              className="underline underline-offset-2"
            >
              {place.phone}
            </a>
          </Row>
        ) : null}
        {place.transit && place.transit.lines.length > 0 ? (
          <Row icon={TramFront} label="Líneas">
            Líneas {place.transit.lines.join(", ")}
            {place.transit.network ? ` (${place.transit.network})` : ""}
            <span className="text-muted-foreground block text-xs">
              Según las etiquetas de OpenStreetMap; no es un horario y puede estar desactualizado.
            </span>
          </Row>
        ) : null}
        {place.wheelchair ? (
          <Row icon={Accessibility} label="Accesibilidad">
            {WHEELCHAIR_LABELS[place.wheelchair]} (según OpenStreetMap)
          </Row>
        ) : null}
      </dl>

      {children}

      <div className="flex flex-col gap-2 border-t pt-3">
        <DataSource source={place.source} isDemo={place.isDemo} />
        {place.source.url ? (
          <a
            href={place.source.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden />
            Ver en{" "}
            {place.source.url.includes("openstreetmap.org") ? "OpenStreetMap" : place.source.name}
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : null}
      </div>
    </article>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    // Solo <dt> y <dd> dentro del <div> de cada grupo (estructura válida de <dl>).
    <div className="flex gap-2.5">
      <dt className="shrink-0">
        <Icon className="text-muted-foreground mt-0.5 size-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
