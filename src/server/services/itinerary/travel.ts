import type { LatLng } from "@/domain/geo";
import { straightLineMeters, type TravelMatrix } from "@/domain/route";
import type { TravelEstimate, TravelFn } from "./optimizer";

export interface TravelPoint {
  id: string;
  location: LatLng;
}

/** A partir de estos minutos a pie se pasa a taxi/coche si hay tiempo calculado. */
export const MAX_WALK_MINUTES = 25;
export const MAX_WALK_MINUTES_REDUCED = 12;
/** Margen para tomar un taxi o aparcar (estimación de TripMind). */
export const CAR_MARGIN_MINUTES = 10;

const ceil5 = (minutes: number) => Math.max(5, Math.ceil(minutes / 5) * 5);

/**
 * Tiempos entre puntos a partir de las matrices a pie y en coche (Fase 4). Sin tiempo calculado
 * el tramo queda `approximate`, sin duración, y se reserva un margen prudente (línea recta × 1,4
 * a 4,5 km/h, o 3 km/h con movilidad reducida) solo para que el plan no sea imposible; la UI lo
 * presenta como margen estimado, no como duración del trayecto.
 */
export function buildTravel(
  points: readonly TravelPoint[],
  matrices: { walk: TravelMatrix; car?: TravelMatrix },
  { reducedMobility }: { reducedMobility: boolean },
): TravelFn {
  const index = new Map(points.map((point, i) => [point.id, i]));
  const maxWalk = reducedMobility ? MAX_WALK_MINUTES_REDUCED : MAX_WALK_MINUTES;
  const cache = new Map<string, TravelEstimate>();

  const compute = (from: number, to: number): TravelEstimate => {
    const straight = Math.round(
      matrices.walk.straightLineMeters[from]?.[to] ??
        straightLineMeters(points[from]!.location, points[to]!.location),
    );
    if (from === to) {
      return {
        mode: "walk",
        quality: "routed",
        durationMinutes: 0,
        reservedMinutes: 0,
        straightMeters: 0,
        source: matrices.walk.source,
        isDemo: matrices.walk.isDemo,
      };
    }
    const walkSeconds = matrices.walk.durationsSeconds?.[from]?.[to] ?? null;
    const carSeconds = matrices.car?.durationsSeconds?.[from]?.[to] ?? null;
    const walkMinutes = walkSeconds === null ? undefined : Math.ceil(walkSeconds / 60);
    if (walkMinutes !== undefined && (walkMinutes <= maxWalk || carSeconds === null)) {
      return {
        mode: "walk",
        quality: "routed",
        durationMinutes: walkMinutes,
        distanceMeters: matrices.walk.distancesMeters?.[from]?.[to] ?? undefined,
        // Los tiempos a pie de OSRM son a paso normal: con movilidad reducida se reserva un 50 % más.
        reservedMinutes: reducedMobility ? Math.ceil(walkMinutes * 0.5) : 0,
        straightMeters: straight,
        source: matrices.walk.source,
        isDemo: matrices.walk.isDemo,
      };
    }
    if (carSeconds !== null && matrices.car) {
      return {
        mode: "car",
        quality: "routed",
        durationMinutes: Math.ceil(carSeconds / 60),
        distanceMeters: matrices.car.distancesMeters?.[from]?.[to] ?? undefined,
        reservedMinutes: CAR_MARGIN_MINUTES,
        straightMeters: straight,
        source: matrices.car.source,
        isDemo: matrices.car.isDemo,
      };
    }
    const walkable = straight <= (reducedMobility ? 800 : 2000);
    const metersPerMinute = walkable ? (reducedMobility ? 50 : 75) : 250;
    return {
      mode: walkable ? "walk" : "car",
      quality: "approximate",
      reservedMinutes: ceil5(
        (straight * 1.4) / metersPerMinute + (walkable ? 0 : CAR_MARGIN_MINUTES),
      ),
      straightMeters: straight,
    };
  };

  return (fromId, toId) => {
    const key = `${fromId}|${toId}`;
    let estimate = cache.get(key);
    if (!estimate) {
      const from = index.get(fromId);
      const to = index.get(toId);
      if (from === undefined || to === undefined) throw new Error(`Punto desconocido: ${key}`);
      estimate = compute(from, to);
      cache.set(key, estimate);
    }
    return estimate;
  };
}

/** Matriz sin tiempos (proveedor caído o sin cobertura): todo queda aproximado. */
export function straightOnlyMatrix(points: readonly TravelPoint[], message: string): TravelMatrix {
  return {
    mode: "walk",
    quality: "unavailable",
    straightLineMeters: points.map((a) =>
      points.map((b) => Math.round(straightLineMeters(a.location, b.location))),
    ),
    message,
  };
}
