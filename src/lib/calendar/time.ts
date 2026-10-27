import type { DstChange } from "@/domain/calendar";

/** Desfase de una zona IANA respecto a UTC (minutos) en un instante; incluye el horario de verano. */
export function offsetMinutes(timeZone: string, instant: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(instant))
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

export const formatOffset = (minutes: number) => {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};

const MINUTE = 60_000;

/** Instante UTC de una hora de pared local (dos pasadas: el desfase depende del instante). */
export function wallClockInstant(date: string, minutes: number, timeZone: string): number {
  const naive = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE;
  let offset = offsetMinutes(timeZone, naive);
  offset = offsetMinutes(timeZone, naive - offset * MINUTE);
  return naive - offset * MINUTE;
}

const hhmm = (minutes: number) => {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};

/** Días entre dos fechas ISO (incluidas). */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (
    let day = new Date(`${start}T00:00:00Z`);
    day <= new Date(`${end}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Cambios de hora de la zona IANA en los días del viaje, con la hora de pared exacta:
 * en Madrid, el 25-10-2026 los relojes pasan de las 03:00 a las 02:00 (`back`).
 */
export function dstChanges(timeZone: string, startDate: string, endDate: string): DstChange[] {
  const changes: DstChange[] = [];
  for (const date of datesBetween(startDate, endDate)) {
    // De 00:00 UTC del día anterior a 00:00 UTC del siguiente cubre el día local en cualquier zona.
    let low = Date.parse(`${date}T00:00:00Z`) - 24 * 60 * MINUTE;
    let high = Date.parse(`${date}T00:00:00Z`) + 48 * 60 * MINUTE;
    const before = offsetMinutes(timeZone, low);
    const after = offsetMinutes(timeZone, high);
    if (before === after) continue;
    // Búsqueda binaria del primer minuto con el desfase nuevo.
    while (high - low > MINUTE) {
      const mid = low + Math.floor((high - low) / 2 / MINUTE) * MINUTE;
      if (offsetMinutes(timeZone, mid) === before) low = mid;
      else high = mid;
    }
    const localDate = new Date(high + before * MINUTE).toISOString().slice(0, 10);
    if (localDate !== date) continue;
    const utcMinutes = new Date(high).getUTCHours() * 60 + new Date(high).getUTCMinutes();
    changes.push({
      date,
      timeZone,
      from: hhmm(utcMinutes + before),
      to: hhmm(utcMinutes + after),
      direction: after < before ? "back" : "forward",
      offsetBefore: formatOffset(before),
      offsetAfter: formatOffset(after),
    });
  }
  return changes;
}

/**
 * Diferencia horaria del destino respecto a la zona del usuario en un día (minutos; positivo =
 * el destino va por delante). Se mide a mediodía local para no caer en el momento del cambio.
 */
export function zoneDifference(destinationZone: string, userZone: string, date: string): number {
  const instant = Date.parse(`${date}T12:00:00Z`);
  return offsetMinutes(destinationZone, instant) - offsetMinutes(userZone, instant);
}

/** "1 h", "5 h 30 min". */
export function formatHours(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 h";
}
