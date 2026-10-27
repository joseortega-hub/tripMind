import type { RouteMode, TransitVehicle } from "@/domain/route";

export const MODE_LABELS: Record<RouteMode, string> = {
  transit: "Transporte público",
  walk: "A pie",
  car: "Taxi o coche",
};

export const VEHICLE_LABELS: Record<TransitVehicle, string> = {
  walk: "A pie",
  bus: "Autobús",
  subway: "Metro",
  tram: "Tranvía",
  rail: "Tren",
  ferry: "Barco",
  other: "Transporte",
};

/** Minutos redondeados hacia arriba ("1 min" como mínimo): nunca se promete menos de lo calculado. */
export function formatDuration(minutes: number) {
  const total = Math.max(1, Math.ceil(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const kmFormat = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${kmFormat.format(meters / 1000)} km`;
}

/** Hora "10:04" de un instante en la zona del destino. */
export function formatClock(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** Fecha "mié, 28 oct 2026" de un instante (fecha de los datos o de los horarios). */
export function formatDataDate(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

export const transfersText = (transfers: number) =>
  transfers === 0
    ? "sin transbordos"
    : transfers === 1
      ? "1 transbordo"
      : `${transfers} transbordos`;
