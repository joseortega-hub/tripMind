"use client";

import { useMutation } from "@tanstack/react-query";
import { Clock, Footprints, LocateFixed } from "lucide-react";
import { useId, useState } from "react";
import { DataSource } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import type { FreeTimeRequest, FreeTimeSuggestion } from "@/domain/discover";
import type { LatLng } from "@/domain/geo";
import type { ItineraryMeta } from "@/domain/itinerary";
import type { Place } from "@/domain/place";
import type { ItineraryDay, Trip } from "@/domain/trip";
import { ApiError, postJson } from "@/lib/api-client";
import { OPENING_LABELS } from "@/lib/itinerary-labels";
import { CATEGORY_LABELS } from "@/lib/map/layers";
import { formatDay } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";

interface FreeTimeResponse {
  suggestions: FreeTimeSuggestion[];
  plan: FreeTimeSuggestion[];
  planMinutes: number;
  withoutTimes: number;
  travel: ItineraryMeta["travel"];
  notices: string[];
}

const HOURS = [1, 1.5, 2, 3, 4, 5, 6];
const fieldClass =
  "border-input bg-background focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-3";

interface Origin {
  key: string;
  label: string;
  location?: LatLng;
}

const formatMinutes = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;

/**
 * "Tengo N horas libres" (REQUISITOS §14C): desde tu ubicación o un punto del viaje, lugares que
 * caben con trayectos a pie reales (ida y vuelta), la duración estimada y el horario del día.
 */
export function FreeTimeFinder({
  trip,
  days,
  defaultDate,
  selectedPlace,
  onSelectPlace,
  Heading,
}: {
  trip: Trip;
  days: ItineraryDay[];
  defaultDate?: string;
  selectedPlace?: Place;
  onSelectPlace: (place: Place) => void;
  Heading: "h3" | "h4";
}) {
  const id = useId();
  const [date, setDate] = useState(defaultDate ?? trip.startDate);
  const [start, setStart] = useState("16:00");
  const [hours, setHours] = useState(3);
  const [originKey, setOriginKey] = useState(trip.hotel ? "hotel" : "location");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string>();

  const stops = (days.find((d) => d.date === date)?.activities ?? []).filter((a) => a.place);
  const origins: Origin[] = [
    ...(trip.hotel
      ? [{ key: "hotel", label: `Tu hotel: ${trip.hotel.name}`, location: trip.hotel.location }]
      : []),
    { key: "location", label: "Mi ubicación actual" },
    ...(selectedPlace
      ? [
          {
            key: "selected",
            label: `Lugar abierto: ${selectedPlace.name}`,
            location: selectedPlace.location,
          },
        ]
      : []),
    ...stops.map((a) => ({
      key: `stop:${a.id}`,
      label: `Parada del día: ${a.title}`,
      location: a.place!.location,
    })),
  ];
  const origin = origins.find((o) => o.key === originKey) ?? origins[0]!;

  const search = useMutation({
    mutationFn: (request: FreeTimeRequest) =>
      postJson<FreeTimeResponse>(`/api/trips/${trip.id}/free-time`, request),
  });

  const run = (location: LatLng) =>
    search.mutate({
      origin: location,
      originLabel: origin.label,
      date,
      start,
      minutes: Math.round(hours * 60),
    });

  const submit = () => {
    setGeoError(undefined);
    if (origin.location) return run(origin.location);
    if (!("geolocation" in navigator)) {
      setGeoError("Tu navegador no permite conocer tu ubicación. Elige otro punto de partida.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        run({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setGeoError(
          "No se ha podido obtener tu ubicación (permiso denegado o sin señal). Elige otro punto de partida.",
        );
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const data = search.data;
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3"
      data-testid="free-time"
    >
      <div className="flex flex-col gap-0.5">
        <Heading id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="text-primary size-4" aria-hidden />
          Tengo unas horas libres
        </Heading>
        <p className="text-muted-foreground text-xs">
          Lugares que te da tiempo a ver a pie y volver, con tiempos de ruta reales y su horario de
          ese día.
        </p>
      </div>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="col-span-2 flex flex-col gap-1 text-xs font-medium">
          Desde
          <select
            className={fieldClass}
            value={origin.key}
            onChange={(e) => setOriginKey(e.target.value)}
          >
            {origins.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs font-medium">
          Día
          <select className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((day, index) => (
              <option key={day.date} value={day.date}>
                Día {index + 1}: {formatDay(day.date)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          A partir de las
          <input
            type="time"
            required
            className={fieldClass}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Tiempo libre
          <select
            className={fieldClass}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {formatMinutes(h * 60)}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="submit"
          variant="outline"
          className="col-span-2 min-h-11"
          disabled={search.isPending || locating || !/^\d{2}:\d{2}$/.test(start)}
        >
          {origin.key === "location" ? <LocateFixed aria-hidden /> : <Footprints aria-hidden />}
          {locating
            ? "Buscando tu ubicación…"
            : search.isPending
              ? "Calculando trayectos…"
              : "Ver qué me da tiempo"}
        </Button>
      </form>
      {geoError ? (
        <p role="alert" className="text-destructive text-sm">
          {geoError}
        </p>
      ) : null}
      {search.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {search.error instanceof ApiError && search.error.status !== 0
            ? `No se ha podido calcular: ${search.error.message}`
            : search.error.message}
          {search.error instanceof ApiError && search.error.externalUrl ? (
            <>
              {" "}
              <a
                href={search.error.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Ver la zona en OpenStreetMap (enlace externo)
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {data ? (
        <div className="flex flex-col gap-3" aria-live="polite" data-testid="free-time-results">
          {data.plan.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">
                Plan sugerido: {data.plan.length === 1 ? "1 lugar" : `${data.plan.length} lugares`}{" "}
                en {formatMinutes(data.planMinutes)} con la vuelta
              </p>
              <ol className="flex flex-col gap-1.5">
                {data.plan.map((s, index) => (
                  <SuggestionRow
                    key={s.place.id}
                    suggestion={s}
                    index={index + 1}
                    onSelect={onSelectPlace}
                  />
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No cabe ninguna visita en {formatMinutes(Math.round(hours * 60))} desde aquí con los
              tiempos calculados. Prueba con más tiempo, otra hora u otro punto de partida.
            </p>
          )}
          {data.suggestions.length > data.plan.length ? (
            <details className="text-sm">
              <summary className="focus-visible:ring-ring/50 min-h-11 cursor-pointer content-center rounded outline-none focus-visible:ring-3">
                Otras opciones que caben solas ({data.suggestions.length})
              </summary>
              <ul className="mt-1 flex flex-col gap-1.5">
                {data.suggestions.map((s) => (
                  <SuggestionRow key={s.place.id} suggestion={s} onSelect={onSelectPlace} />
                ))}
              </ul>
            </details>
          ) : null}
          {data.withoutTimes > 0 ? (
            <p className="text-muted-foreground text-xs">
              {data.withoutTimes === 1
                ? "1 lugar cercano no tiene tiempo de trayecto calculado y no se propone."
                : `${data.withoutTimes} lugares cercanos no tienen tiempo de trayecto calculado y no se proponen.`}
            </p>
          ) : null}
          {data.notices.map((notice) => (
            <p key={notice} className="text-muted-foreground text-xs">
              {notice}
            </p>
          ))}
          {data.travel.source ? (
            <DataSource source={data.travel.source} isDemo={data.travel.isDemo ?? false} />
          ) : (
            <p className="text-muted-foreground text-xs">{data.travel.message}</p>
          )}
          <p className="text-muted-foreground text-xs">
            Duraciones de visita estimadas por TripMind; horarios según OpenStreetMap.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SuggestionRow({
  suggestion: s,
  index,
  onSelect,
}: {
  suggestion: FreeTimeSuggestion;
  index?: number;
  onSelect: (place: Place) => void;
}) {
  const opening = OPENING_LABELS[s.openingStatus];
  return (
    <li className="flex gap-2">
      {index ? (
        <span
          aria-hidden
          className="border-primary text-primary mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold tabular-nums"
        >
          {index}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onSelect(s.place)}
        className="focus-visible:ring-ring/50 flex min-h-11 flex-col text-left outline-none focus-visible:ring-3"
      >
        <span className="text-primary text-sm font-medium">
          {index ? `${s.arrival} · ` : ""}
          {s.place.name}
        </span>
        <span className="text-muted-foreground text-xs">
          {CATEGORY_LABELS[s.place.category]}: {s.walkToMinutes} min a pie, visita de unos{" "}
          {s.visitMinutes} min, vuelta {s.walkBackMinutes} min.{" "}
          <span className={cn(opening.tone === "pending" && "text-amber-800 dark:text-amber-300")}>
            {opening.text}
          </span>
        </span>
      </button>
    </li>
  );
}
