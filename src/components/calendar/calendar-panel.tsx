"use client";

import { ExternalLink, MapPin, RotateCw, SlidersHorizontal } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DataSource } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { type FeedStatus, NOTICE_KINDS, type NoticeKind, type TripNotice } from "@/domain/calendar";
import {
  applyNoticeFilters,
  isFiltered,
  type NoticeFilters,
  noticeSources,
} from "@/lib/calendar/filters";
import { IMPACT_NAMES, NOTICE_NAMES } from "@/lib/calendar/notices";
import { datesBetween, formatHours, zoneDifference } from "@/lib/calendar/time";
import { formatDay } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import { NOTICE_BG, NoticeBadge } from "./notice-badge";
import { type useNoticeFilters, type useTripCalendar, useUserTimeZone } from "./use-calendar";

const selectClass =
  "border-input bg-background focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-3";

export interface CalendarPanelProps {
  startDate: string;
  endDate: string;
  destinationName: string;
  calendar: ReturnType<typeof useTripCalendar>;
  filterState: ReturnType<typeof useNoticeFilters>;
  /** Día elegido en el itinerario (se resalta en la franja). */
  selectedDate?: string;
  onSelectDate: (date: string) => void;
  onShowOnMap: (notice: TripNotice) => void;
  headingLevel?: 2 | 3;
}

/**
 * Calendario del viaje (REQUISITOS §17): franja de días con insignias, leyenda que a la vez filtra
 * por tipo, filtros por impacto/día/fuente/itinerario y la lista de avisos con su fuente.
 */
export function CalendarPanel({
  startDate,
  endDate,
  destinationName,
  calendar,
  filterState,
  selectedDate,
  onSelectDate,
  onShowOnMap,
  headingLevel = 3,
}: CalendarPanelProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  const SubHeading = `h${headingLevel + 1}` as "h3" | "h4";
  const { filters, update, reset } = filterState;
  const [moreOpen, setMoreOpen] = useState(false);
  const dates = useMemo(() => datesBetween(startDate, endDate), [startDate, endDate]);
  const shown = useMemo(
    () => applyNoticeFilters(calendar.notices, filters),
    [calendar.notices, filters],
  );
  const filtered = isFiltered(filters);
  const { query, calendar: data } = calendar;

  const toggleKind = (kind: NoticeKind) =>
    update({
      kinds: filters.kinds.includes(kind)
        ? filters.kinds.filter((k) => k !== kind)
        : [...filters.kinds, kind],
    });

  return (
    <section
      aria-labelledby={headingId}
      data-testid="trip-calendar"
      className="flex flex-col gap-3 border-b pb-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Heading id={headingId} className="text-base font-semibold">
          Calendario del viaje
        </Heading>
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {query.isPending
            ? "Cargando avisos…"
            : filtered
              ? `${shown.length} de ${calendar.notices.length} avisos con estos filtros`
              : calendar.notices.length === 1
                ? "1 aviso"
                : `${calendar.notices.length} avisos`}
        </p>
      </div>

      {data ? (
        <ZoneLine timeZone={data.timeZone} destination={destinationName} dates={dates} />
      ) : null}

      <div
        role="group"
        aria-label="Leyenda y filtro por tipo de aviso"
        className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pb-0.5"
      >
        {NOTICE_KINDS.map((kind) => {
          const active = filters.kinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => toggleKind(kind)}
              data-testid={`notice-chip-${kind}`}
              className={cn(
                "focus-visible:ring-ring/50 flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1.5 text-xs font-medium outline-none focus-visible:ring-3",
                active
                  ? cn(NOTICE_BG[kind], "text-notice-foreground border-transparent")
                  : "bg-card hover:bg-muted",
              )}
            >
              <NoticeBadge
                kind={kind}
                decorative
                className={active ? "ring-notice-foreground/70 ring-1" : undefined}
              />
              {NOTICE_NAMES[kind]}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground -mt-1 text-xs">
        Pulsa un tipo para ver solo esos avisos (puedes elegir varios). Se aplica igual a la lista y
        al mapa.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          aria-expanded={moreOpen}
          aria-controls={`${headingId}-filters`}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <SlidersHorizontal aria-hidden />
          Más filtros
        </Button>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch
            checked={filters.onlyItinerary}
            onCheckedChange={(checked) => update({ onlyItinerary: checked })}
          />
          Solo lo que afecta a mi itinerario
        </label>
        {filtered ? (
          <Button variant="ghost" size="sm" className="min-h-11" onClick={reset}>
            Quitar filtros
          </Button>
        ) : null}
      </div>
      {moreOpen ? (
        <MoreFilters
          id={`${headingId}-filters`}
          filters={filters}
          update={update}
          dates={dates}
          sources={noticeSources(calendar.notices)}
        />
      ) : null}

      {query.isPending ? (
        <div className="flex gap-1.5" aria-hidden>
          {dates.slice(0, 5).map((date) => (
            <Skeleton key={date} className="h-20 w-16 shrink-0 rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-destructive">No se ha podido cargar el calendario del viaje.</span>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => query.refetch()}>
            <RotateCw aria-hidden />
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          <DayStrip
            dates={dates}
            notices={shown}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
          <NoticeList
            notices={shown}
            total={calendar.notices.length}
            filtered={filtered}
            onReset={reset}
            onShowOnMap={onShowOnMap}
            SubHeading={SubHeading}
          />
          {data ? <FeedStatuses calendar={data} /> : null}
        </>
      )}
    </section>
  );
}

function ZoneLine({
  timeZone,
  destination,
  dates,
}: {
  timeZone: string;
  destination: string;
  dates: string[];
}) {
  const userZone = useUserTimeZone();
  const text = useMemo(() => {
    if (!userZone || userZone === timeZone || dates.length === 0) return undefined;
    const first = zoneDifference(timeZone, userZone, dates[0]!);
    const last = zoneDifference(timeZone, userZone, dates.at(-1)!);
    const describe = (minutes: number) =>
      minutes === 0
        ? "la misma hora que tú"
        : `${formatHours(minutes)} ${minutes > 0 ? "por delante" : "por detrás"} de tu hora`;
    return first === last
      ? `${destination} va ${describe(first)}.`
      : `${destination} va ${describe(first)} al empezar el viaje y ${describe(last)} al final (cambia la hora en uno de los dos sitios).`;
  }, [userZone, timeZone, dates, destination]);
  return (
    <p className="text-muted-foreground text-xs">
      Horas en hora local de {destination} ({timeZone}).{text ? ` ${text}` : ""}
    </p>
  );
}

function MoreFilters({
  id,
  filters,
  update,
  dates,
  sources,
}: {
  id: string;
  filters: NoticeFilters;
  update: (change: Partial<NoticeFilters>) => void;
  dates: string[];
  sources: string[];
}) {
  return (
    <div id={id} className="bg-muted/50 grid gap-3 rounded-lg p-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Impacto
        <select
          className={selectClass}
          value={filters.impact}
          onChange={(event) => update({ impact: event.target.value as NoticeFilters["impact"] })}
        >
          <option value="all">Todos</option>
          <option value="opportunity">{IMPACT_NAMES.opportunity}</option>
          <option value="affects_plan">{IMPACT_NAMES.affects_plan}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Día
        <select
          className={selectClass}
          value={filters.date}
          onChange={(event) => update({ date: event.target.value })}
        >
          <option value="all">Todos los días</option>
          {dates.map((date, index) => (
            <option key={date} value={date}>
              Día {index + 1}: {formatDay(date)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Fuente
        <select
          className={selectClass}
          value={filters.source}
          onChange={(event) => update({ source: event.target.value })}
        >
          <option value="all">Todas</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DayStrip({
  dates,
  notices,
  selectedDate,
  onSelectDate,
}: {
  dates: string[];
  notices: TripNotice[];
  selectedDate?: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Días del viaje con sus avisos"
      className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pb-1"
    >
      {dates.map((date, index) => {
        const dayNotices = notices.filter((notice) => notice.date === date);
        const kinds = NOTICE_KINDS.filter((kind) => dayNotices.some((n) => n.kind === kind));
        const [weekday, number] = formatDay(date).split(" ");
        const active = date === selectedDate;
        const summary = kinds.length
          ? `${dayNotices.length === 1 ? "1 aviso" : `${dayNotices.length} avisos`}: ${kinds
              .map((kind) => NOTICE_NAMES[kind])
              .join(", ")}`
          : "sin avisos";
        return (
          <button
            key={date}
            type="button"
            aria-pressed={active}
            aria-label={`${formatDay(date)}, día ${index + 1} del viaje: ${summary}`}
            onClick={() => onSelectDate(date)}
            data-testid="calendar-day"
            data-date={date}
            className={cn(
              "focus-visible:ring-ring/50 flex min-h-20 w-16 shrink-0 flex-col items-center gap-1 rounded-lg border px-1 pt-1.5 pb-2 outline-none focus-visible:ring-3",
              active ? "border-primary ring-primary ring-1" : "bg-card hover:bg-muted",
            )}
          >
            <span className="text-muted-foreground text-[0.6875rem] leading-none">
              {weekday?.replace(",", "")}
            </span>
            <span className="text-lg leading-none font-semibold tabular-nums">{number}</span>
            <span className="flex flex-wrap justify-center gap-0.5">
              {kinds.map((kind) => (
                <NoticeBadge key={kind} kind={kind} size="sm" decorative />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Avisos que se ven antes de "Ver todos" (el sheet móvil no debe llenarse solo de avisos). */
const LIST_PREVIEW = 3;

function NoticeList({
  notices,
  total,
  filtered,
  onReset,
  onShowOnMap,
  SubHeading,
}: {
  notices: TripNotice[];
  total: number;
  filtered: boolean;
  onReset: () => void;
  onShowOnMap: (notice: TripNotice) => void;
  SubHeading: "h3" | "h4";
}) {
  const [expanded, setExpanded] = useState(false);
  if (total === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin avisos para estas fechas: ni festivos, ni cambios de hora, ni nada que afecte a tu plan.
      </p>
    );
  }
  if (notices.length === 0 && filtered) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="text-muted-foreground">Ningún aviso con estos filtros.</p>
        <Button variant="outline" size="sm" className="min-h-11" onClick={onReset}>
          Quitar filtros
        </Button>
      </div>
    );
  }
  const visible = expanded ? notices : notices.slice(0, LIST_PREVIEW);
  const dates = [...new Set(visible.map((notice) => notice.date))];
  return (
    <div className="flex flex-col gap-3" data-testid="notice-list">
      {dates.map((date) => (
        <div key={date} className="flex flex-col gap-1.5">
          <SubHeading className="text-muted-foreground text-xs font-semibold">
            {formatDay(date)}
          </SubHeading>
          <ul className="flex flex-col gap-2">
            {visible
              .filter((notice) => notice.date === date)
              .map((notice) => (
                <li key={notice.id} className="flex gap-2.5" data-testid="notice">
                  <NoticeBadge kind={notice.kind} size="lg" decorative className="mt-0.5" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-sm leading-snug font-medium">
                      {notice.title.startsWith(NOTICE_NAMES[notice.kind]) ? null : (
                        <span className="sr-only">{NOTICE_NAMES[notice.kind]}: </span>
                      )}
                      {notice.title}
                    </p>
                    {notice.detail ? (
                      <p className="text-muted-foreground text-xs">{notice.detail}</p>
                    ) : null}
                    <p className="text-xs">
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2 py-0.5",
                          notice.impact === "opportunity"
                            ? "border-primary/40 text-primary"
                            : "border-foreground/25",
                        )}
                      >
                        {notice.impact === "opportunity"
                          ? IMPACT_NAMES.opportunity
                          : notice.affectsItinerary
                            ? "Afecta a tu itinerario"
                            : "Puede afectar al plan"}
                      </span>
                    </p>
                    <DataSource source={notice.source} isDemo={notice.isDemo} />
                    <div className="flex flex-wrap gap-x-1">
                      {notice.location ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary -ml-2 min-h-11"
                          onClick={() => onShowOnMap(notice)}
                        >
                          <MapPin aria-hidden />
                          Ver en el mapa
                        </Button>
                      ) : null}
                      {notice.url ? (
                        <Button variant="ghost" size="sm" className="text-primary min-h-11" asChild>
                          <a href={notice.url} target="_blank" rel="noreferrer">
                            <ExternalLink aria-hidden />
                            Ficha del evento (enlace externo)
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {notices.length > LIST_PREVIEW ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 self-start"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Ver menos avisos" : `Ver los ${notices.length} avisos`}
        </Button>
      ) : null}
    </div>
  );
}

function StatusLine({
  kind,
  label,
  status,
}: {
  kind: NoticeKind;
  label: string;
  status: FeedStatus;
}) {
  return (
    <li className="flex gap-2">
      <NoticeBadge kind={kind} size="sm" className="mt-0.5" />
      <span>
        <span className="text-foreground font-medium">{label}</span> ({status.providerName}
        {status.isDemo ? ", datos de demostración" : ""}):{" "}
        {status.status === "ok" ? (status.message ?? "al día.") : status.message}
        {status.externalUrl ? (
          <>
            {" "}
            <a href={status.externalUrl} target="_blank" rel="noreferrer" className="underline">
              Consultar por tu cuenta (enlace externo)
            </a>
          </>
        ) : null}
      </span>
    </li>
  );
}

function FeedStatuses({
  calendar,
}: {
  calendar: NonNullable<ReturnType<typeof useTripCalendar>["calendar"]>;
}) {
  return (
    <details className="text-muted-foreground text-xs">
      <summary className="focus-visible:ring-ring/50 min-h-11 cursor-pointer content-center rounded outline-none focus-visible:ring-3">
        De dónde salen los avisos
      </summary>
      <ul className="mt-1 flex flex-col gap-1.5">
        <StatusLine kind="holiday" label="Festivos" status={calendar.holidaysStatus} />
        <StatusLine kind="event" label="Eventos" status={calendar.eventsStatus} />
        <StatusLine kind="weather" label="Previsión" status={calendar.weatherStatus} />
        <li className="flex gap-2">
          <NoticeBadge kind="dst" size="sm" className="mt-0.5" />
          <span>
            <span className="text-foreground font-medium">Cambio de hora</span>: base de datos de
            zonas horarias IANA, calculado sin conexión.
          </span>
        </li>
        <li className="flex gap-2">
          <NoticeBadge kind="transport" size="sm" className="mt-0.5" />
          <span>
            <span className="text-foreground font-medium">Transporte</span>: no hay fuente de
            huelgas ni cortes conectada; consulta la web del operador.
          </span>
        </li>
        <li className="flex gap-2">
          <NoticeBadge kind="closure" size="sm" className="mt-0.5" />
          <NoticeBadge kind="booking" size="sm" className="mt-0.5 -ml-1" />
          <span>
            <span className="text-foreground font-medium">Cierres y reservas</span>: de tu
            itinerario (horarios de OpenStreetMap y lo que anotas).
          </span>
        </li>
      </ul>
    </details>
  );
}
