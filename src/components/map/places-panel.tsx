"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { CalendarDays, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Place } from "@/domain/place";
import { ApiError } from "@/lib/api-client";
import { allLayersOff, type MapPlace } from "@/lib/map/layers";
import { PlaceList, PlaceListSkeleton } from "./place-list";
import { PLACES_LIMIT, type PlacesResponse } from "./use-trip-places";
import { useMapUi } from "./workspace-context";

/** Lista de lugares con sus estados: carga, error, vacío, demo y avisos del proveedor. */
export function PlacesPanel({
  items,
  total,
  places,
  stops,
  favorites,
  mapAvailable,
}: {
  /** Lugares de las capas activas en la zona visible del mapa. */
  items: MapPlace[];
  /** Lugares de las capas activas en todo el destino. */
  total: number;
  places: UseQueryResult<PlacesResponse>;
  /** Estaciones y paradas (capa 4), solo con la capa activa. */
  stops: UseQueryResult<PlacesResponse>;
  favorites: UseQueryResult<Place[]>;
  mapAvailable: boolean;
}) {
  const layers = useMapUi((state) => state.layers);
  const showAllLayers = useMapUi((state) => state.showAllLayers);
  const recenter = useMapUi((state) => state.recenter);
  const provider = places.data?.provider;

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="text-muted-foreground text-sm">
        {places.isLoading
          ? "Cargando lugares…"
          : places.isError
            ? null
            : `${items.length === 1 ? "1 lugar" : `${items.length} lugares`} ${mapAvailable ? "en la zona visible del mapa" : "en el destino"}`}
      </div>

      {provider?.notice ? (
        <p className="text-muted-foreground border-l-2 border-amber-500/70 pl-2.5 text-xs">
          {provider.notice}
        </p>
      ) : null}
      {places.data?.warnings?.map((warning) => (
        <Alert key={warning}>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      {(places.data?.results.length ?? 0) >= PLACES_LIMIT ? (
        <p className="text-muted-foreground text-xs">
          Se muestran los {PLACES_LIMIT} primeros lugares de la zona; puede haber más.
        </p>
      ) : null}

      {layers.transport && stops.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando estaciones y paradas…</p>
      ) : null}
      {layers.transport && stops.isError ? (
        <PlacesError
          title="No se pueden cargar las estaciones y paradas"
          error={stops.error}
          retry={() => stops.refetch()}
        />
      ) : null}

      {favorites.isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pueden cargar tus lugares guardados</AlertTitle>
          <AlertDescription>
            <p>{favorites.error.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 min-h-11"
              onClick={() => favorites.refetch()}
            >
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {places.isLoading ? (
        <PlaceListSkeleton />
      ) : places.isError ? (
        <PlacesError error={places.error} retry={() => places.refetch()} />
      ) : allLayersOff(layers) ? (
        <Empty
          title="Todas las capas están desactivadas"
          text="Activa una capa para ver sus lugares en el mapa y en esta lista."
          action={
            <Button variant="outline" className="min-h-11" onClick={showAllLayers}>
              Activar todas las capas
            </Button>
          }
        />
      ) : total === 0 ? (
        <Empty
          title="No hay lugares de estas capas en el destino"
          text="Prueba a activar otras capas. Solo se muestran lugares que existen en la fuente de datos."
          action={
            <Button variant="outline" className="min-h-11" onClick={showAllLayers}>
              Activar todas las capas
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <Empty
          title="Nada a la vista en esta parte del mapa"
          text={`Hay ${total} lugares en el destino fuera de la zona visible.`}
          action={
            <Button variant="outline" className="min-h-11" onClick={recenter}>
              Volver al destino
            </Button>
          }
        />
      ) : (
        <PlaceList items={items} />
      )}
    </div>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground text-sm">{text}</p>
      {action}
    </div>
  );
}

function PlacesError({
  error,
  retry,
  title = "No se pueden cargar los lugares",
}: {
  error: Error;
  retry: () => void;
  title?: string;
}) {
  const externalUrl = error instanceof ApiError ? error.externalUrl : undefined;
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" className="min-h-11" onClick={retry}>
            Reintentar
          </Button>
          {externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-2"
            >
              <ExternalLink className="size-4" aria-hidden />
              Ver la zona en OpenStreetMap
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** Hueco del itinerario hasta la Fase 5. */
export function ItineraryPlaceholder() {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
      <CalendarDays className="text-primary size-6" aria-hidden />
      <p className="font-medium">El plan por días llegará pronto</p>
      <p className="text-muted-foreground text-sm">
        Mientras tanto, guarda los lugares que te interesen: aparecerán en la capa «Guardados» y
        servirán para construir tu itinerario.
      </p>
    </div>
  );
}
