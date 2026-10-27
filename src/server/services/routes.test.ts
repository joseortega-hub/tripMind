import { describe, expect, it, vi } from "vitest";
import { ApproximateRouteSchema } from "@/domain/route";
import type { ProviderSelection } from "@/server/providers/core/registry";
import { ProviderError } from "@/server/providers/core/types";
import { createDemoPlacesProvider } from "@/server/providers/pois/demo";
import { createDemoRoutingProvider, DEMO_ROUTING_HOTEL } from "@/server/providers/routing/demo";
import routingFixture from "@/server/providers/routing/fixtures/routing.json";
import type { RoutingProvider } from "@/server/providers/routing/types";
import { createDemoTransitProvider, type TransitProvider } from "@/server/providers/transit";
import { nearbyStops, walkableFrom } from "./nearby";
import { compareRoutes, travelMatrix } from "./routes";
import { localDateTimeToIso, timeZoneAt } from "./time-zone";

const hotel = DEMO_ROUTING_HOTEL.location;
const prado = { lat: 40.4138195, lng: -3.6916199 };
const departure = "2026-10-28T10:00:00+01:00";

const demo = <T>(provider: T): ProviderSelection<T> => ({ provider, isDemo: true });

function failingRouting(): RoutingProvider {
  const fail = async (): Promise<never> => {
    throw new ProviderError("osrm respondió con estado 503", "osrm", { status: 503 });
  };
  return { id: "osrm", name: "OSRM", isDemo: false, route: fail, matrix: fail };
}

describe("comparador de modos", () => {
  it("con datos demo calcula a pie y en coche desde el hotel", async () => {
    const { results } = await compareRoutes(
      { from: hotel, to: prado, modes: ["walk", "car", "transit"], departure },
      { routing: demo(createDemoRoutingProvider()), transit: demo(createDemoTransitProvider()) },
    );
    expect(results.map((result) => [result.mode, result.quality])).toEqual([
      ["walk", "routed"],
      ["car", "routed"],
      // Del hotel al Prado andar gana: Transitous no propone transporte público.
      ["transit", "approximate"],
    ]);
  });

  it("si un proveedor falla, ese modo pasa a tramo aproximado con enlaces y sin duración", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const transit: TransitProvider = {
      id: "transitous",
      name: "Transitous",
      isDemo: false,
      plan: async () => {
        throw new ProviderError("sin red", "transitous");
      },
    };
    const { results } = await compareRoutes(
      { from: hotel, to: prado, modes: ["walk", "transit"], departure },
      { routing: demo(failingRouting()), transit: demo(transit) },
    );
    for (const result of results) {
      const approximate = ApproximateRouteSchema.parse(result);
      expect(approximate.reason).toBe("provider_failed");
      expect(approximate).not.toHaveProperty("durationMinutes");
      expect(approximate.geometry).toEqual([
        [hotel.lng, hotel.lat],
        [prado.lng, prado.lat],
      ]);
      expect(approximate.straightLineMeters).toBeGreaterThan(300);
      expect(approximate.straightLineMeters).toBeLessThan(400);
      expect(approximate.externalLinks[0]!.url).toContain("google.com/maps/dir/");
    }
    expect(results[1]!.externalLinks[0]!.url).toContain("travelmode=transit");
  });

  it("los errores que no son del proveedor no se esconden", async () => {
    const broken: RoutingProvider = {
      ...failingRouting(),
      route: async () => {
        throw new TypeError("bug");
      },
    };
    await expect(
      compareRoutes(
        { from: hotel, to: prado, modes: ["walk"], departure },
        { routing: demo(broken), transit: demo(createDemoTransitProvider()) },
      ),
    ).rejects.toThrow("bug");
  });
});

describe("matriz de tiempos", () => {
  const points = routingFixture.tables[0]!.origins.slice(0, 4);

  it("devuelve tiempos reales y la distancia en línea recta", async () => {
    const matrix = await travelMatrix(
      { origins: points, destinations: points, mode: "walk" },
      demo(createDemoRoutingProvider()),
    );
    expect(matrix.quality).toBe("routed");
    expect(matrix.durationsSeconds).toHaveLength(4);
    expect(matrix.durationsSeconds![0]![0]).toBe(0);
    expect(matrix.straightLineMeters[0]![0]).toBe(0);
    expect(matrix.straightLineMeters[0]![1]).toBeGreaterThan(0);
    expect(matrix.isDemo).toBe(true);
  });

  it("si el proveedor falla queda 'unavailable' sin tiempos inventados", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const matrix = await travelMatrix(
      { origins: points, destinations: points, mode: "car" },
      demo(failingRouting()),
    );
    expect(matrix.quality).toBe("unavailable");
    expect(matrix.durationsSeconds).toBeUndefined();
    expect(matrix.straightLineMeters).toHaveLength(4);
  });
});

describe("preguntas desde el hotel", () => {
  it("¿hay metro cerca?: estaciones de OSM con tiempo a pie", async () => {
    const result = await nearbyStops(hotel, {
      places: demo(createDemoPlacesProvider()),
      routing: demo(createDemoRoutingProvider()),
    });
    const metro = result.stops.find((stop) => stop.place.category === "metro_station");
    expect(metro?.walk?.durationMinutes).toBeGreaterThan(0);
    expect(metro!.straightLineMeters).toBeLessThanOrEqual(result.radiusMeters);
    // Las paradas de autobús no están en la tabla grabada: solo línea recta y aviso.
    const bus = result.stops.find((stop) => stop.place.category === "bus_stop");
    expect(bus?.walk).toBeUndefined();
    expect(result.walkNotice).toBeTruthy();
  });

  it("¿qué puedo hacer a pie?: solo lo que está a ≤ N min según rutas reales", async () => {
    const targets = routingFixture.tables[0]!.origins.slice(1).map((location, index) => ({
      id: `p${index}`,
      location,
    }));
    const routing = demo(createDemoRoutingProvider());
    const near = await walkableFrom({ origin: hotel, maxMinutes: 5, targets }, routing);
    const far = await walkableFrom({ origin: hotel, maxMinutes: 15, targets }, routing);
    expect(near.quality).toBe("routed");
    expect(near.results.every((result) => result.durationMinutes <= 5)).toBe(true);
    expect(far.results.length).toBeGreaterThan(near.results.length);
  });

  it("sin tiempos reales no responde con suposiciones", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await walkableFrom(
      { origin: hotel, maxMinutes: 15, targets: [{ id: "prado", location: prado }] },
      demo(failingRouting()),
    );
    expect(result).toMatchObject({ quality: "unavailable", results: [] });
  });
});

describe("hora local del destino", () => {
  it("usa la zona IANA y el desfase de ese día (cambio de hora)", () => {
    expect(timeZoneAt(hotel)).toBe("Europe/Madrid");
    expect(localDateTimeToIso("2026-10-28", "10:00", "Europe/Madrid")).toBe(
      "2026-10-28T10:00:00+01:00",
    );
    expect(localDateTimeToIso("2026-07-01", "10:00", "Europe/Madrid")).toBe(
      "2026-07-01T10:00:00+02:00",
    );
    expect(localDateTimeToIso("2026-07-01", "10:00", "America/New_York")).toBe(
      "2026-07-01T10:00:00-04:00",
    );
  });
});
