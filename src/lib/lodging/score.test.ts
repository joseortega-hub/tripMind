import { describe, expect, it } from "vitest";
import {
  DEFAULT_LODGING_WEIGHTS,
  type LodgingCandidate,
  type LodgingWeights,
} from "@/domain/lodging";
import type { Place } from "@/domain/place";
import { AccommodationPreferencesSchema } from "@/domain/preferences";
import { availabilityLinks } from "./links";
import { linearScore, proximityBasis, rankLodging, scoreLodging } from "./score";

const source = { name: "OpenStreetMap", retrievedAt: "2026-10-26T21:33:43.876Z" };

function place(id: string, extra: Partial<Place> = {}): Place {
  return {
    id,
    name: id,
    category: "hotel",
    layer: "lodging",
    location: { lat: 40.41, lng: -3.69 },
    source,
    isDemo: true,
    ...extra,
  };
}

const station = place("Estación", { category: "metro_station", layer: "transport" });
const notConfigured = { status: "not_configured", message: "Sin precio" } as const;

function candidate(
  id: string,
  options: {
    walk?: number[];
    straight?: number[];
    stationWalk?: number;
    stationMeters?: number;
    centerMeters?: number;
    place?: Partial<Place>;
    price?: number;
  } = {},
): LodgingCandidate {
  const straight = options.straight ?? options.walk?.map((m) => m * 80) ?? [500];
  return {
    place: place(id, options.place),
    isCurrent: false,
    centerMeters: options.centerMeters ?? 800,
    keyPoints: straight.map((meters, index) => ({
      straightLineMeters: meters,
      walkMinutes: options.walk?.[index],
    })),
    station:
      options.stationMeters === undefined
        ? undefined
        : {
            place: station,
            straightLineMeters: options.stationMeters,
            walkMinutes: options.stationWalk,
          },
    pricing:
      options.price === undefined
        ? notConfigured
        : {
            status: "available",
            amountPerNight: options.price,
            currency: "EUR",
            source: { name: "Proveedor autorizado", retrievedAt: source.retrievedAt },
            isDemo: false,
          },
  };
}

const prefs = (value: Partial<Parameters<typeof AccommodationPreferencesSchema.parse>[0]> = {}) =>
  AccommodationPreferencesSchema.parse(value);

const context = (weights: LodgingWeights = DEFAULT_LODGING_WEIGHTS, preferences = prefs()) => ({
  weights,
  preferences,
  stationRadiusMeters: 1500,
});

describe("puntuación de alojamientos", () => {
  it("escala lineal entre el mejor y el peor valor", () => {
    expect(linearScore(5, 8, 35)).toBe(100);
    expect(linearScore(40, 8, 35)).toBe(0);
    expect(linearScore(21.5, 8, 35)).toBe(50);
  });

  it("sin precio el presupuesto no cuenta (ni resta ni suma)", () => {
    const score = scoreLodging(candidate("A", { walk: [8], stationWalk: 3, stationMeters: 200 }), {
      ...context(DEFAULT_LODGING_WEIGHTS, prefs({ budgetPerNight: 100 })),
      proximity: "walk",
      station: "walk",
    });
    const budget = score.components.find((c) => c.key === "budget");
    expect(budget?.score).toBeNull();
    expect(budget?.reason).toBe("Sin precio disponible");
    // Proximidad 100 y transporte 100; sin preferencias: total 100 aunque el presupuesto pese 3.
    expect(score.total).toBe(100);
  });

  it("con precio de un proveedor puntúa según el presupuesto por noche", () => {
    const within = candidate("A", { walk: [8], price: 90 });
    const above = candidate("B", { walk: [8], price: 150 });
    const ctx = {
      ...context(
        { budget: 1, proximity: 0, transport: 0, preferences: 0 },
        prefs({ budgetPerNight: 100 }),
      ),
      proximity: "walk" as const,
      station: "walk" as const,
    };
    expect(scoreLodging(within, ctx).total).toBe(100);
    expect(scoreLodging(above, ctx).total).toBe(0);
  });

  it("los pesos cambian el total y un peso 0 excluye el componente", () => {
    const item = candidate("A", { walk: [35], stationWalk: 3, stationMeters: 200 });
    const base = { proximity: "walk" as const, station: "walk" as const };
    const onlyTransport = scoreLodging(item, {
      ...context({ budget: 0, proximity: 0, transport: 5, preferences: 0 }),
      ...base,
    });
    const onlyLocation = scoreLodging(item, {
      ...context({ budget: 0, proximity: 5, transport: 0, preferences: 0 }),
      ...base,
    });
    expect(onlyTransport.total).toBe(100);
    expect(onlyLocation.total).toBe(0);
    const none = scoreLodging(item, {
      ...context({ budget: 0, proximity: 0, transport: 0, preferences: 0 }),
      ...base,
    });
    expect(none.total).toBeNull();
  });

  it("sin estación cercana el transporte puntúa 0 y lo explica", () => {
    const score = scoreLodging(candidate("A"), {
      ...context(),
      proximity: "straight",
      station: "straight",
    });
    const transport = score.components.find((c) => c.key === "transport");
    expect(transport?.score).toBe(0);
    expect(transport?.reason).toContain("Sin estación a menos de 1,5 km");
  });

  it("las preferencias combinan tipo, estrellas, accesibilidad y zona", () => {
    const ctx = {
      ...context(
        { budget: 0, proximity: 0, transport: 0, preferences: 1 },
        prefs({ types: ["hotel"], minStars: 4, accessible: true, zone: "central" }),
      ),
      proximity: "straight" as const,
      station: "straight" as const,
    };
    const ideal = candidate("A", {
      centerMeters: 300,
      place: { stars: 4, wheelchair: "yes" },
    });
    const poor = candidate("B", {
      centerMeters: 3000,
      place: { category: "hostel", stars: 2, wheelchair: "no" },
    });
    const unknown = candidate("C", { centerMeters: 300 });
    expect(scoreLodging(ideal, ctx).total).toBe(100);
    expect(scoreLodging(poor, ctx).total).toBe(0);
    // Tipo 100, estrellas desconocidas 50, accesibilidad sin datos 25, centro 100.
    expect(scoreLodging(unknown, ctx).total).toBe(69);
  });
});

describe("ordenación de alojamientos", () => {
  const near = candidate("Cerca", { walk: [5, 7], stationWalk: 12, stationMeters: 900 });
  const connected = candidate("Conectado", { walk: [20, 25], stationWalk: 2, stationMeters: 150 });
  const balanced = candidate("Equilibrado", { walk: [9, 10], stationWalk: 4, stationMeters: 300 });
  const all = [connected, near, balanced];

  const order = (sort: Parameters<typeof rankLodging>[1], weights = DEFAULT_LODGING_WEIGHTS) =>
    rankLodging(all, sort, context(weights)).items.map((item) => item.candidate.place.name);

  it("por ubicación, transporte, ambos y puntuación", () => {
    expect(order("location")).toEqual(["Cerca", "Equilibrado", "Conectado"]);
    expect(order("transport")).toEqual(["Conectado", "Equilibrado", "Cerca"]);
    expect(order("location_transport")).toEqual(["Equilibrado", "Conectado", "Cerca"]);
    expect(order("score")).toEqual(["Equilibrado", "Cerca", "Conectado"]);
    expect(order("score", { budget: 0, proximity: 0, transport: 5, preferences: 0 })[0]).toBe(
      "Conectado",
    );
  });

  it("si a algún alojamiento le faltan tiempos, todos se comparan en línea recta", () => {
    const straightOnly = candidate("Sin tiempos", { straight: [100, 100] });
    expect(proximityBasis([near, connected])).toBe("walk");
    expect(proximityBasis([near, straightOnly])).toBe("straight");
    const ranked = rankLodging([near, straightOnly], "location", context());
    expect(ranked.proximity).toBe("straight");
    expect(ranked.items[0]?.candidate.place.name).toBe("Sin tiempos");
  });

  it("empates por nombre y los que no tienen estación van al final", () => {
    const a = candidate("Beta", { walk: [10] });
    const b = candidate("Alfa", { walk: [10] });
    const c = candidate("Gamma", { walk: [10], stationWalk: 9, stationMeters: 700 });
    const names = rankLodging([a, b, c], "transport", context()).items.map(
      (item) => item.candidate.place.name,
    );
    expect(names).toEqual(["Gamma", "Alfa", "Beta"]);
  });
});

describe("enlaces de disponibilidad", () => {
  it("Booking lleva fechas, viajeros y habitaciones; Google solo el nombre", () => {
    const [booking, google] = availabilityLinks({
      place: { name: "Hotel México", address: { city: "Madrid" } },
      checkIn: "2026-10-28",
      checkOut: "2026-10-31",
      adults: 2,
      children: 1,
      rooms: 1,
    });
    const url = new URL(booking!.url);
    expect(url.hostname).toBe("www.booking.com");
    expect(url.searchParams.get("ss")).toBe("Hotel México, Madrid");
    expect(url.searchParams.get("checkin")).toBe("2026-10-28");
    expect(url.searchParams.get("checkout")).toBe("2026-10-31");
    expect(url.searchParams.get("group_adults")).toBe("2");
    expect(url.searchParams.get("group_children")).toBe("1");
    expect(booking!.carries).toBe("dates_and_travelers");
    expect(new URL(google!.url).searchParams.get("q")).toBe("Hotel México, Madrid");
    expect(google!.carries).toBe("name_only");
  });
});
