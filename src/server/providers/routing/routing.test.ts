import { describe, expect, it, vi } from "vitest";
import { RoutedRouteSchema } from "@/domain/route";
import { MemoryCacheStore } from "../core/cache";
import { createDemoRoutingProvider, DEMO_ROUTING_HOTEL } from "./demo";
import fixture from "./fixtures/routing.json";
import { googleMapsDirectionsUrl, osmDirectionsUrl } from "./links";
import { mapOrsDirections } from "./ors";
import { mapOsrmRoute, OsrmRouteResponseSchema, osrmRouteUrl, osrmTableUrl } from "./osrm";
import { createRealRoutingProvider } from "./real";
import { matrixLocations, RouteNotFoundError } from "./types";

const hotel = DEMO_ROUTING_HOTEL.location;
const recorded = fixture.routes[0]!;
const prado = { lat: 40.4138195, lng: -3.6916199 };
const meta = { retrievedAt: "2026-10-27T10:00:00.000Z", isDemo: false };

describe("OSRM (FOSSGIS)", () => {
  it("usa un servidor por perfil y coordenadas lng,lat", () => {
    expect(osrmRouteUrl({ from: hotel, to: prado, mode: "walk" })).toMatch(
      /^https:\/\/routing\.openstreetmap\.de\/routed-foot\/route\/v1\/driving\/-3\.694324,40\.411433;-3\.691620,40\.413820\?/,
    );
    expect(osrmRouteUrl({ from: hotel, to: prado, mode: "car" })).toContain("/routed-car/");
  });

  it("la matriz envía cada punto una sola vez", () => {
    const points = [hotel, prado];
    expect(matrixLocations({ origins: points, destinations: points })).toEqual({
      locations: points,
      sources: [0, 1],
      destinations: [0, 1],
    });
    const url = osrmTableUrl({ origins: [hotel], destinations: [prado, hotel], mode: "walk" });
    expect(url).toContain("sources=0&destinations=1;0&annotations=duration,distance");
  });

  it("mapea una respuesta real grabada a ruta con fuente, enlaces y geometría", () => {
    const query = { from: recorded.from, to: recorded.to, mode: recorded.mode as "walk" };
    const route = mapOsrmRoute(OsrmRouteResponseSchema.parse(recorded.response), query, meta);
    expect(RoutedRouteSchema.parse(route)).toStrictEqual(route);
    expect(route.durationMinutes).toBeGreaterThan(0);
    expect(route.geometry.length).toBeGreaterThan(2);
    expect(route.source.name).toContain("FOSSGIS");
    expect(route.source.attribution).toContain("OpenStreetMap");
    expect(route.externalLinks.map((link) => link.label)).toEqual(["Google Maps", "OpenStreetMap"]);
  });

  it("sin ruta lanza RouteNotFoundError (no inventa)", () => {
    expect(() =>
      mapOsrmRoute({ code: "NoRoute" }, { from: hotel, to: prado, mode: "walk" }, meta),
    ).toThrow(RouteNotFoundError);
  });
});

describe("openrouteservice", () => {
  it("mapea la respuesta GeoJSON de directions", () => {
    const route = mapOrsDirections(
      {
        features: [
          {
            geometry: {
              coordinates: [
                [hotel.lng, hotel.lat],
                [prado.lng, prado.lat],
              ],
            },
            properties: { summary: { duration: 600, distance: 700.4 } },
          },
        ],
      },
      { from: hotel, to: prado, mode: "walk" },
      meta,
    );
    expect(route).toMatchObject({ durationMinutes: 10, distanceMeters: 700, quality: "routed" });
    expect(route.source.attribution).toContain("HeiGIT");
  });

  it("con clave usa ORS por POST con la clave en cabecera y cachea la respuesta", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({
        features: [
          {
            geometry: {
              coordinates: [
                [hotel.lng, hotel.lat],
                [prado.lng, prado.lat],
              ],
            },
            properties: { summary: { duration: 300, distance: 400 } },
          },
        ],
      }),
    );
    const provider = createRealRoutingProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      orsApiKey: "clave-de-prueba",
      fetch,
    });
    const first = await provider.route({ from: hotel, to: prado, mode: "walk" });
    const second = await provider.route({ from: hotel, to: prado, mode: "walk" });
    expect(provider.id).toBe("openrouteservice");
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openrouteservice.org/v2/directions/foot-walking/geojson");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("clave-de-prueba");
  });
});

describe("demo de rutas", () => {
  const provider = createDemoRoutingProvider();

  it("devuelve las rutas grabadas desde el hotel, marcadas como demo", async () => {
    const { route } = await provider.route({ from: hotel, to: recorded.to, mode: "walk" });
    expect(route.isDemo).toBe(true);
    expect(route.source.retrievedAt).toBe(fixture.recordedAt);
  });

  it("fuera de lo grabado no inventa: no_coverage", async () => {
    await expect(
      provider.route({ from: prado, to: { lat: 40.42, lng: -3.7 }, mode: "walk" }),
    ).rejects.toMatchObject({ name: "RouteNotFoundError", reason: "no_coverage" });
  });

  it("extrae una submatriz de la tabla grabada", async () => {
    const destinations = fixture.tables[0]!.destinations.slice(1, 4);
    const matrix = await provider.matrix({ origins: [hotel], destinations, mode: "walk" });
    expect(matrix.durationsSeconds).toHaveLength(1);
    expect(matrix.durationsSeconds[0]).toHaveLength(3);
    const full = fixture.tables[0]!.response.durations!;
    expect(matrix.durationsSeconds[0]).toEqual(full[0]!.slice(1, 4));
    expect(matrix.isDemo).toBe(true);
  });

  it("rechaza matrices demasiado grandes antes de llamar a nadie", async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ lat: 40 + i / 1000, lng: -3.7 }));
    await expect(
      provider.matrix({ origins: [hotel], destinations: many, mode: "walk" }),
    ).rejects.toMatchObject({ name: "ProviderInputError" });
  });
});

describe("enlaces externos", () => {
  it("ponen origen, destino y modo", () => {
    const google = new URL(googleMapsDirectionsUrl(hotel, prado, "transit"));
    expect(google.searchParams.get("origin")).toBe("40.411433,-3.694324");
    expect(google.searchParams.get("destination")).toBe("40.413820,-3.691620");
    expect(google.searchParams.get("travelmode")).toBe("transit");
    expect(osmDirectionsUrl(hotel, prado, "walk")).toContain("engine=fossgis_osrm_foot");
    expect(osmDirectionsUrl(hotel, prado, "transit")).toBeUndefined();
  });
});
