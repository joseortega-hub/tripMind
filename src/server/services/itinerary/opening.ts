import OpeningHours from "opening_hours";
import type { OpeningStatus } from "@/domain/itinerary";

/** Intervalo del día en minutos desde las 00:00 locales; `uncertain` = estado "unknown" de OSM. */
export interface OpenWindow {
  start: number;
  end: number;
  uncertain: boolean;
}

/** Ventanas de un lugar en una fecha: confirmadas, desconocidas (todo el día) o sin interpretar. */
export type DayOpening =
  { kind: "hours"; windows: OpenWindow[] } | { kind: "no_hours" } | { kind: "unparsable" };

export interface OpeningContext {
  /** ISO 3166-1 alfa-2 del destino, para los festivos (`PH`) que conoce la librería. */
  countryCode?: string;
  location: { lat: number; lng: number };
}

const DAY = 24 * 60;

/**
 * `opening_hours` evalúa con la hora local del proceso: se construyen fechas cuyos componentes
 * locales son la hora de pared del destino, así el resultado no depende de la zona del servidor.
 */
const wallClock = (date: string, minutes: number) => {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 0, minutes);
};

const minutesOf = (date: Date, base: Date) =>
  Math.round((date.getTime() - base.getTime()) / 60_000);

const parsed = new Map<string, OpeningHours | null>();

function parse(value: string, context: OpeningContext): OpeningHours | null {
  const key = `${context.countryCode ?? ""}|${value}`;
  if (parsed.has(key)) return parsed.get(key) ?? null;
  let result: OpeningHours | null = null;
  try {
    const nominatim = context.countryCode
      ? {
          lat: context.location.lat,
          lon: context.location.lng,
          address: { country_code: context.countryCode.toLowerCase(), state: "" },
        }
      : null;
    result = new OpeningHours(value, nominatim);
  } catch {
    result = null;
  }
  parsed.set(key, result);
  return result;
}

/** Ventanas de apertura de un lugar en una fecha (hora local del destino). */
export function dayOpening(
  openingHours: string | undefined,
  date: string,
  context: OpeningContext,
): DayOpening {
  if (!openingHours?.trim()) return { kind: "no_hours" };
  const oh = parse(openingHours, context);
  if (!oh) return { kind: "unparsable" };
  const base = wallClock(date, 0);
  // Sin país conocido los festivos no se pueden evaluar: cualquier franja queda en duda.
  const holidaysUnknown = !context.countryCode && /\b(PH|SH)\b/.test(openingHours);
  try {
    const windows = oh
      .getOpenIntervals(base, wallClock(date, DAY))
      .map(([from, to, unknown]) => ({
        start: Math.max(0, minutesOf(from, base)),
        end: Math.min(DAY, minutesOf(to, base)),
        uncertain: unknown || holidaysUnknown,
      }))
      .filter((window) => window.end > window.start);
    return { kind: "hours", windows };
  } catch {
    return { kind: "unparsable" };
  }
}

/** Estado de una visita [start, end) según las ventanas del día. */
export function statusFor(opening: DayOpening, start: number, end: number): OpeningStatus {
  if (opening.kind !== "hours") return opening.kind;
  const window = opening.windows.find((w) => w.start <= start && w.end >= end);
  if (window) return window.uncertain ? "uncertain" : "open";
  // Solapa con una ventana incierta: no se puede afirmar que esté cerrado.
  if (opening.windows.some((w) => w.uncertain && w.start < end && w.end > start)) {
    return "uncertain";
  }
  return "closed";
}

/**
 * Primera hora ≥ `from` a la que cabe una visita de `duration` minutos sin tocar un horario
 * cerrado; `undefined` si ese día no cabe. Sin horario (o ilegible) vale cualquier hora.
 */
export function earliestStart(
  opening: DayOpening,
  from: number,
  duration: number,
): number | undefined {
  if (opening.kind !== "hours") return from;
  for (const window of opening.windows) {
    const start = Math.max(from, window.start);
    if (start + duration <= window.end) return start;
  }
  return undefined;
}

/** true si el horario confirma que el lugar no abre en todo el día. */
export const closedAllDay = (opening: DayOpening) =>
  opening.kind === "hours" && opening.windows.length === 0;
