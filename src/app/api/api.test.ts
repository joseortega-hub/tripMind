// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeocodeResultSchema } from "@/domain/geocoding";
import { PlaceSchema } from "@/domain/place";
import { RouteResultSchema } from "@/domain/route";
import type { ProvidersConfig } from "@/server/providers/core/config";
import { GET as geocode } from "./geocode/route";
import { GET as places } from "./places/route";
import { GET as routes } from "./routes/route";

const config: ProvidersConfig = { mode: "demo" };
vi.mock("@/server/providers/core/config", () => ({ getProvidersConfig: () => config }));

const call = async (handler: (r: Request) => Promise<Response>, path: string) => {
  const response = await handler(new Request(`http://localhost${path}`));
  return { status: response.status, body: await response.json() };
};

afterEach(() => {
  config.mode = "demo";
  config.contactEmail = undefined;
  vi.unstubAllGlobals();
});

describe("GET /api/geocode", () => {
  it("devuelve resultados válidos con metadatos del proveedor demo", async () => {
    const { status, body } = await call(geocode, "/api/geocode?q=madrid&limit=3");
    expect(status).toBe(200);
    expect(body.provider).toMatchObject({ id: "demo-geocoding", isDemo: true });
    expect(body.provider.notice).toContain("PROVIDERS_MODE=demo");
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.length).toBeLessThanOrEqual(3);
    for (const result of body.results) expect(GeocodeResultSchema.parse(result).isDemo).toBe(true);
  });

  it.each([
    ["/api/geocode", "q"],
    ["/api/geocode?q=a", "q"],
    ["/api/geocode?q=madrid&limit=50", "limit"],
    ["/api/geocode?q=madrid&mode=reverse", "mode"],
    ["/api/geocode?q=madrid&lat=40.4", "lat"],
  ])("%s → 400 (%s)", async (path, field) => {
    const { status, body } = await call(geocode, path);
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.issues).toHaveProperty(field);
  });

  it("si el proveedor real falla responde 502 con enlace externo", async () => {
    config.mode = "auto";
    config.contactEmail = "test@example.org";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { status, body } = await call(geocode, "/api/geocode?q=madrid");
    expect(status).toBe(502);
    expect(body.error).toMatchObject({
      code: "provider_unavailable",
      provider: "photon",
      externalUrl: "https://www.openstreetmap.org/search?query=madrid",
    });
  });
});

describe("GET /api/places", () => {
  const bbox = "-3.6965,40.4115,-3.6905,40.4155";

  it("filtra por capas y devuelve lugares válidos", async () => {
    const { status, body } = await call(places, `/api/places?bbox=${bbox}&layers=tourism&limit=20`);
    expect(status).toBe(200);
    expect(body.provider).toMatchObject({ id: "demo-places", isDemo: true });
    expect(body.results.length).toBeGreaterThan(0);
    for (const place of body.results) expect(PlaceSchema.parse(place).layer).toBe("tourism");
  });

  it("combina capas y categorías", async () => {
    const { body } = await call(
      places,
      `/api/places?bbox=${bbox}&layers=lodging&categories=museum`,
    );
    const categories = new Set(body.results.map((p: { category: string }) => p.category));
    expect(categories.has("museum")).toBe(true);
    expect(
      [...categories].every(
        (c) =>
          c === "museum" || ["hotel", "hostel", "apartment", "guest_house"].includes(c as string),
      ),
    ).toBe(true);
  });

  it.each([
    ["/api/places", "bbox"],
    ["/api/places?bbox=1,2,3", "bbox"],
    [`/api/places?bbox=${bbox}&layers=beaches`, "layers"],
    [`/api/places?bbox=${bbox}&categories=casino`, "categories"],
    [`/api/places?bbox=${bbox}&limit=0`, "limit"],
  ])("%s → 400 (%s)", async (path, field) => {
    const { status, body } = await call(places, path);
    expect(status).toBe(400);
    expect(body.error.issues).toHaveProperty(field);
  });

  it("rechaza zonas demasiado grandes", async () => {
    const { status, body } = await call(places, "/api/places?bbox=-4,40,-3,41");
    expect(status).toBe(400);
    expect(body.error.message).toContain("demasiado grande");
  });

  it("si Overpass falla responde 502 con mapa de OSM como alternativa", async () => {
    config.mode = "auto";
    config.contactEmail = "test@example.org";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 504 })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { status, body } = await call(places, `/api/places?bbox=${bbox}`);
    expect(status).toBe(502);
    expect(body.error.provider).toBe("overpass");
    expect(body.error.externalUrl).toMatch(
      /^https:\/\/www\.openstreetmap\.org\/#map=17\/40\.41350\/-3\.69350$/,
    );
  });
});

describe("GET /api/routes", () => {
  const hotel = "40.4114334,-3.6943236";

  it("devuelve un resultado por modo, con la salida en hora local del destino", async () => {
    const { status, body } = await call(
      routes,
      `/api/routes?from=${hotel}&to=40.416938,-3.7033901&date=2026-10-28&time=10:00`,
    );
    expect(status).toBe(200);
    expect(body.departure).toBe("2026-10-28T10:00:00+01:00");
    expect(body.timeZone).toBe("Europe/Madrid");
    expect(body.results.map((r: { mode: string }) => r.mode)).toEqual(["transit", "walk", "car"]);
    for (const result of body.results)
      expect(RouteResultSchema.parse(result).quality).toBe("routed");
    expect(body.providers.transit).toMatchObject({ id: "demo-transit", isDemo: true });
  });

  it("fuera de la demo devuelve tramos aproximados con enlaces externos", async () => {
    const { status, body } = await call(
      routes,
      "/api/routes?from=41.3870,2.1700&to=41.4036,2.1744&modes=walk",
    );
    expect(status).toBe(200);
    expect(body.results[0]).toMatchObject({ quality: "approximate", reason: "no_coverage" });
  });

  it.each([
    ["/api/routes?to=40.4,-3.7", "from"],
    ["/api/routes?from=40.4,-3.7&to=400,-3.7", "to"],
    ["/api/routes?from=40.4,-3.7&to=40.41,-3.7&modes=plane", "modes"],
    ["/api/routes?from=40.4,-3.7&to=40.41,-3.7&time=25:00", "time"],
  ])("%s → 400 (%s)", async (path, field) => {
    const { status, body } = await call(routes, path);
    expect(status).toBe(400);
    expect(body.error.issues).toHaveProperty(field);
  });
});
