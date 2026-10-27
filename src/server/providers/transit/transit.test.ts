import { describe, expect, it, vi } from "vitest";
import { RoutedRouteSchema } from "@/domain/route";
import { MemoryCacheStore } from "../core/cache";
import { RouteNotFoundError } from "../routing/types";
import fixture from "./fixtures/transitous.json";
import { createDemoTransitProvider, createRealTransitProvider, roundDeparture } from "./index";
import {
  decodePolyline,
  mapTransitousPlan,
  TransitousPlanSchema,
  transitousPlanUrl,
} from "./transitous";

const meta = { retrievedAt: "2026-10-27T10:00:00.000Z", isDemo: false };
const withTransit = fixture.plans.find((plan) =>
  plan.response.itineraries.some((itinerary) =>
    itinerary.legs.some((leg: { mode: string }) => leg.mode !== "WALK"),
  ),
)!;
const walkOnly = fixture.plans.find((plan) => plan.response.itineraries.length === 0)!;

describe("Transitous (MOTIS)", () => {
  it("decodifica polilíneas (ejemplo de la especificación de Google, precisión 5)", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5)).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("pide el plan con origen, destino, hora y margen frente a ir andando", () => {
    const url = new URL(
      transitousPlanUrl({
        from: { lat: 40.4114334, lng: -3.6943236 },
        to: { lat: 40.416938, lng: -3.7033901 },
        departure: "2026-10-28T10:00:00+01:00",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://api.transitous.org/api/v1/plan");
    expect(url.searchParams.get("fromPlace")).toBe("40.411433,-3.694324");
    expect(url.searchParams.get("time")).toBe("2026-10-28T10:00:00+01:00");
    expect(url.searchParams.get("fastestDirectFactor")).toBe("1.5");
  });

  it("mapea un plan real grabado: líneas, horas, transbordos y paradas del feed", () => {
    const route = mapTransitousPlan(
      TransitousPlanSchema.parse(withTransit.response),
      withTransit,
      meta,
    );
    expect(RoutedRouteSchema.parse(route)).toBeTruthy();
    expect(route.mode).toBe("transit");
    expect(route.transfers).toBeGreaterThanOrEqual(0);
    expect(route.departure && route.arrival).toBeTruthy();
    expect(route.timeZone).toBe("Europe/Madrid");
    const ride = route.steps!.find((step) => step.vehicle !== "walk")!;
    expect(ride.line?.name).toMatch(/^C\d/);
    expect(ride.line?.agency).toContain("Renfe");
    // Los nombres de relleno de MOTIS se traducen.
    expect(route.steps![0]!.from.name).toBe("Origen");
    expect(route.source.url).toBe("https://transitous.org/sources/");
  });

  it("si solo hay que andar, no inventa transporte público", () => {
    expect(() =>
      mapTransitousPlan(TransitousPlanSchema.parse(walkOnly.response), walkOnly, meta),
    ).toThrow(/andando se llega antes/);
    expect(() => mapTransitousPlan({ itineraries: [] }, walkOnly, meta)).toThrow(
      RouteNotFoundError,
    );
  });

  it("cachea por trayecto y salida redondeada a 5 minutos", async () => {
    const fetch = vi.fn(async () => Response.json(withTransit.response));
    const provider = createRealTransitProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch,
    });
    const query = { from: withTransit.from, to: withTransit.to };
    await provider.plan({ ...query, departure: "2026-10-28T10:01:00+01:00" });
    const again = await provider.plan({ ...query, departure: "2026-10-28T10:02:00+01:00" });
    expect(again.fromCache).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(roundDeparture("2026-10-28T10:02:00+01:00")).toBe("2026-10-28T09:00:00.000Z");
  });
});

describe("demo de transporte público", () => {
  const provider = createDemoTransitProvider();

  it("devuelve el plan grabado con sus horas reales y marcado como demo", async () => {
    const { route } = await provider.plan({
      from: withTransit.from,
      to: withTransit.to,
      departure: "2026-12-01T18:00:00+01:00",
    });
    expect(route.isDemo).toBe(true);
    expect(route.departure!.slice(0, 10)).toBe("2026-10-28");
  });

  it("sin plan grabado responde no_coverage", async () => {
    await expect(
      provider.plan({
        from: { lat: 41.38, lng: 2.17 },
        to: { lat: 41.4, lng: 2.18 },
        departure: "2026-10-28T10:00:00+01:00",
      }),
    ).rejects.toMatchObject({ reason: "no_coverage" });
  });
});
