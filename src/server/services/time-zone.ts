import tzlookup from "@photostructure/tz-lookup";
import type { LatLng } from "@/domain/geo";

/** Zona horaria IANA de un punto (tabla local de fronteras horarias, sin llamadas externas). */
export function timeZoneAt({ lat, lng }: LatLng): string {
  return tzlookup(lat, lng);
}

/** Desfase "+01:00" de una zona en un instante (incluye el horario de verano). */
export function offsetAt(timeZone: string, instant: number): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(instant))
    .find((p) => p.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return match ? `${match[1]}:${match[2] ?? "00"}` : "+00:00";
}

const toMs = (offset: string) => {
  const [, sign, h, m] = offset.match(/([+-])(\d{2}):(\d{2})/)!;
  return (sign === "-" ? -1 : 1) * (Number(h) * 60 + Number(m)) * 60_000;
};

/**
 * Fecha y hora locales del destino ("2026-10-28", "10:00") → ISO 8601 con su desfase real ese día
 * (p. ej. "2026-10-28T10:00:00+01:00" en Madrid tras el cambio de hora).
 */
export function localDateTimeToIso(date: string, time: string, timeZone: string): string {
  const naive = Date.parse(`${date}T${time}:00Z`);
  // Dos pasadas: el desfase depende del instante, que depende del desfase.
  let offset = offsetAt(timeZone, naive);
  offset = offsetAt(timeZone, naive - toMs(offset));
  return `${date}T${time}:00${offset}`;
}
