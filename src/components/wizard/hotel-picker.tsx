"use client";

import { useQuery } from "@tanstack/react-query";
import { Accessibility, BedDouble, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { DataSource, DemoBadge } from "@/components/data-source";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { GeocodeResult, LatLng, Place } from "@/domain";
import { getJson, type ProviderMeta } from "@/lib/api-client";
import { LODGING_LABELS } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import { ProviderErrorAlert } from "./destination-search";
import { describedBy, FieldError } from "./field";

interface PlacesResponse {
  results: Place[];
  provider: ProviderMeta;
  warnings?: string[];
}

/** Medio lado del área de búsqueda en grados (~4 × 4 km, el máximo que admite `/api/places`). */
const HALF_SIDE = 0.019;
const MAX_VISIBLE = 40;

export function lodgingBBox({ lat, lng }: LatLng): string {
  return [lng - HALF_SIDE, lat - HALF_SIDE, lng + HALF_SIDE, lat + HALF_SIDE]
    .map((value) => value.toFixed(5))
    .join(",");
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Busca alojamientos reales (capa `lodging` de OSM) alrededor del centro del destino. */
export function HotelPicker({
  id,
  destination,
  value,
  error,
  onChange,
}: {
  id: string;
  destination?: GeocodeResult;
  value?: Place;
  error?: string;
  onChange: (place: Place | undefined) => void;
}) {
  const [filter, setFilter] = useState("");
  const bbox = destination ? lodgingBBox(destination.location) : undefined;
  const {
    data,
    isLoading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ["lodging", bbox],
    queryFn: ({ signal }) =>
      getJson<PlacesResponse>(
        `/api/places?${new URLSearchParams({ bbox: bbox!, layers: "lodging", limit: "300" })}`,
        signal,
      ),
    enabled: Boolean(bbox),
    retry: false,
  });

  const matches = useMemo(() => {
    const needle = normalize(filter.trim());
    const all = data?.results ?? [];
    return needle ? all.filter((place) => normalize(place.name).includes(needle)) : all;
  }, [data, filter]);

  if (!destination) {
    return <p className="text-muted-foreground text-sm">Elige primero el destino en el paso 1.</p>;
  }

  if (value) {
    return (
      <div className="flex flex-col gap-2">
        <div
          id={id}
          tabIndex={-1}
          className="bg-accent/50 flex items-start justify-between gap-3 rounded-lg border p-3 outline-none"
        >
          <div className="flex min-w-0 gap-3">
            <BedDouble className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">{value.name}</p>
              <PlaceFacts place={value} />
              <DataSource source={value.source} isDemo={value.isDemo} className="mt-1" />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => onChange(undefined)}
          >
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Alojamientos registrados en OpenStreetMap en un área de unos 4 × 4 km alrededor del centro
        de {destination.name}.
      </p>
      <Input
        id={id}
        type="search"
        placeholder="Filtrar por nombre"
        aria-label="Filtrar alojamientos por nombre"
        className="h-11 text-base"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        {...describedBy(id, error)}
      />
      <FieldError id={id} error={error} />
      {data?.provider.isDemo ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          <DemoBadge />
          {data.provider.notice}
        </div>
      ) : null}
      {data?.warnings?.map((warning) => (
        <Alert key={warning}>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando alojamientos">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : fetchError ? (
        <div className="flex flex-col gap-2">
          <ProviderErrorAlert error={fetchError} />
          <Button type="button" variant="outline" className="self-start" onClick={() => refetch()}>
            Reintentar
          </Button>
        </div>
      ) : data ? (
        <>
          <p className="text-sm" aria-live="polite">
            {matches.length === 0
              ? "No hay alojamientos con ese nombre en esta zona."
              : `${matches.length} ${matches.length === 1 ? "alojamiento" : "alojamientos"}`}
            {matches.length > MAX_VISIBLE ? ` · se muestran ${MAX_VISIBLE}, filtra por nombre` : ""}
          </p>
          <ul
            aria-label="Alojamientos"
            className="flex max-h-96 flex-col gap-1 overflow-auto rounded-lg border p-1"
          >
            {matches.slice(0, MAX_VISIBLE).map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm outline-none",
                    "hover:bg-muted focus-visible:ring-ring/50 focus-visible:ring-3",
                  )}
                  onClick={() => onChange(place)}
                >
                  <BedDouble className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium">{place.name}</span>
                    <PlaceFacts place={place} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            ¿No aparece tu alojamiento? Elige «Todavía no» y anota tus preferencias; podrás fijarlo
            más adelante.
          </p>
        </>
      ) : null}
    </div>
  );
}

function PlaceFacts({ place }: { place: Place }) {
  const street = [place.address?.street, place.address?.houseNumber].filter(Boolean).join(" ");
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
      <span>{LODGING_LABELS[place.category] ?? place.category}</span>
      {place.stars ? (
        <span className="inline-flex items-center gap-0.5">
          <Star className="size-3" aria-hidden />
          {place.stars} <span className="sr-only">estrellas</span>
        </span>
      ) : null}
      {street ? <span>{street}</span> : null}
      {place.wheelchair === "yes" ? (
        <span className="inline-flex items-center gap-0.5">
          <Accessibility className="size-3" aria-hidden />
          Accesible
        </span>
      ) : null}
    </span>
  );
}
