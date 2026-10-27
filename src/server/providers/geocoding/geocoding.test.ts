import { describe, expect, it, vi } from "vitest";
import { GeocodeResultSchema } from "@/domain/geocoding";
import { MemoryCacheStore } from "../core/cache";
import { RateLimiter } from "../core/rate-limit";
import { createDemoGeocodingProvider } from "./demo";
import nominatimFixture from "./fixtures/nominatim.json";
import photonFixture from "./fixtures/photon.json";
import { getGeocodingProvider } from "./index";
import { mapNominatimResponse, NominatimResponseSchema, nominatimUrl } from "./nominatim";
import { mapPhotonResponse, PhotonResponseSchema, photonUrl } from "./photon";
import { createRealGeocodingProvider } from "./real";

const meta = { retrievedAt: "2026-10-26T10:00:00.000Z", isDemo: false };
const photonEntry = (query: string) => {
  const entry = photonFixture.entries.find((e) => e.query === query);
  if (!entry) throw new Error(`Falta fixture ${query}`);
  return PhotonResponseSchema.parse(entry.response);
};
const nominatimEntry = (query: string) => {
  const entry = nominatimFixture.entries.find((e) => e.query === query);
  if (!entry) throw new Error(`Falta fixture ${query}`);
  return NominatimResponseSchema.parse(entry.response);
};

describe("Photon", () => {
  it("construye la URL con sesgo opcional", () => {
    expect(photonUrl({ q: "prado", limit: 5 })).toBe(
      "https://photon.komoot.io/api/?q=prado&limit=15&lang=en",
    );
    expect(photonUrl({ q: "prado", limit: 5, near: { lat: 40.4, lng: -3.7 } })).toContain(
      "lat=40.4&lon=-3.7",
    );
  });

  it("pone el país en español y las ciudades por delante de los pueblos", () => {
    // Forma real de Photon para "Varsovia" y "Sofia" con lang=en (oct. 2026).
    const feature = (props: Record<string, unknown>, lng: number, lat: number) => ({
      geometry: { coordinates: [lng, lat] },
      properties: { osm_type: "R", osm_key: "place", type: "city", ...props },
    });
    const response = PhotonResponseSchema.parse({
      features: [
        feature(
          {
            osm_type: "N",
            osm_id: 703222864,
            osm_value: "village",
            name: "Varsovia",
            state: "Tolima",
            country: "Colombia",
            countrycode: "CO",
          },
          -74.599,
          4.077,
        ),
        feature(
          {
            osm_id: 336075,
            osm_value: "city",
            name: "Warsaw",
            state: "Masovian Voivodeship",
            country: "Poland",
            countrycode: "PL",
          },
          21.012,
          52.229,
        ),
        feature(
          {
            osm_id: 4283101,
            osm_value: "city",
            name: "Sofia",
            state: "Sofia-City",
            country: "Bulgaria",
            countrycode: "BG",
          },
          23.321,
          42.697,
        ),
      ],
    });
    const results = mapPhotonResponse(response, { ...meta, limit: 2 });
    expect(results.map((r) => r.label)).toEqual([
      "Warsaw, Masovian Voivodeship, Polonia",
      "Sofia, Sofia-City, Bulgaria",
    ]);
  });

  it("mapea la respuesta grabada de Madrid", () => {
    const [madrid] = mapPhotonResponse(photonEntry("madrid"), meta);
    expect(madrid).toMatchObject({
      id: "osm:relation/5326784",
      name: "Madrid",
      kind: "city",
      countryCode: "ES",
      isDemo: false,
      source: {
        name: "Photon (komoot) · OpenStreetMap",
        url: "https://www.openstreetmap.org/relation/5326784",
        license: "ODbL 1.0",
      },
    });
    // extent de Photon [oeste, norte, este, sur] → bbox [oeste, sur, este, norte]
    const [w, s, e, n] = madrid!.bbox!;
    expect(w).toBeLessThan(e);
    expect(s).toBeLessThan(n);
  });

  it("clasifica museos como POI y todos los resultados cumplen el esquema", () => {
    const results = mapPhotonResponse(photonEntry("museo del prado"), meta);
    expect(results[0]).toMatchObject({ name: "Museo del Prado", kind: "poi" });
    for (const result of photonFixture.entries.flatMap((e) =>
      mapPhotonResponse(PhotonResponseSchema.parse(e.response), meta),
    )) {
      expect(GeocodeResultSchema.safeParse(result).success).toBe(true);
    }
  });

  it("descarta elementos sin nombre ni calle", () => {
    const results = mapPhotonResponse(
      {
        features: [
          {
            geometry: { coordinates: [-3.7, 40.4] },
            properties: { osm_type: "N", osm_id: 1, type: "other" },
          },
        ],
      },
      meta,
    );
    expect(results).toEqual([]);
  });
});

describe("Nominatim", () => {
  it("pide jsonv2 con detalles de dirección", () => {
    const url = new URL(nominatimUrl({ q: "madrid", limit: 3 }));
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("addressdetails")).toBe("1");
  });

  it("mapea la respuesta grabada (coordenadas y bbox como cadenas)", () => {
    const [prado] = mapNominatimResponse(nominatimEntry("museo del prado"), meta);
    expect(prado).toMatchObject({
      name: "Museo del Prado",
      kind: "poi",
      countryCode: "ES",
      source: { name: "Nominatim · OpenStreetMap" },
    });
    expect(typeof prado!.location.lat).toBe("number");
    expect(GeocodeResultSchema.safeParse(prado).success).toBe(true);
  });
});

describe("adaptador real de geocodificación", () => {
  const photonBody = photonFixture.entries[0]!.response;
  const nominatimBody = nominatimFixture.entries[0]!.response;
  const instantLimiter = new RateLimiter(0);

  it("autocompleta con Photon y cachea la respuesta", async () => {
    const fetchMock = vi.fn(async () => Response.json(photonBody));
    const provider = createRealGeocodingProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: fetchMock,
    });
    const first = await provider.autocomplete({ q: "Madrid", limit: 5 });
    const second = await provider.autocomplete({ q: "madrid", limit: 5 });
    expect(first.results[0]?.name).toBe("Madrid");
    expect(first).toMatchObject({ providerId: "photon", fromCache: false });
    expect(second.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0])).toContain("photon.komoot.io");
  });

  it("la búsqueda completa usa primero Nominatim (nombres en español)", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("photon") ? Response.json(photonBody) : Response.json(nominatimBody),
    );
    const provider = createRealGeocodingProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: fetchMock,
      nominatimLimiter: instantLimiter,
    });
    const response = await provider.search({ q: "madrid", limit: 5 });
    expect(response.providerId).toBe("nominatim");
    expect(response.results[0]?.source.name).toContain("Nominatim");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("busca en Photon si Nominatim falla", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("nominatim") ? new Response("", { status: 502 }) : Response.json(photonBody),
    );
    const provider = createRealGeocodingProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: fetchMock,
      nominatimLimiter: instantLimiter,
    });
    const response = await provider.search({ q: "madrid", limit: 5 });
    expect(response.providerId).toBe("photon");
  });

  it("nunca usa Nominatim para autocompletar", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 502 }));
    const provider = createRealGeocodingProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: fetchMock,
      nominatimLimiter: instantLimiter,
    });
    await expect(provider.autocomplete({ q: "madrid", limit: 5 })).rejects.toMatchObject({
      name: "ProviderError",
      providerId: "photon",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si fallan ambos, propaga el error de Nominatim", async () => {
    const provider = createRealGeocodingProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: async () => new Response("", { status: 503 }),
      nominatimLimiter: instantLimiter,
    });
    await expect(provider.search({ q: "madrid", limit: 5 })).rejects.toMatchObject({
      providerId: "nominatim",
    });
  });
});

describe("adaptador demo de geocodificación", () => {
  const demo = createDemoGeocodingProvider();

  it("devuelve resultados grabados marcados como demo", async () => {
    const { results } = await demo.autocomplete({ q: "Mad", limit: 5 });
    expect(results[0]).toMatchObject({ name: "Madrid", isDemo: true });
    expect(results.every((r) => r.isDemo)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("busca sin tildes ni mayúsculas en las etiquetas", async () => {
    const { results } = await demo.search({ q: "SAGRADA", limit: 3 });
    expect(results.some((r) => r.label.includes("Sagrada"))).toBe(true);
  });

  it("no inventa nada para consultas sin datos grabados", async () => {
    expect((await demo.autocomplete({ q: "Kioto", limit: 5 })).results).toEqual([]);
  });
});

describe("registro de geocodificación", () => {
  it("elige demo sin CONTACT_EMAIL y real con él en modo auto", () => {
    expect(getGeocodingProvider({ mode: "auto" })).toMatchObject({ isDemo: true });
    expect(getGeocodingProvider({ mode: "auto", contactEmail: "a@b.c" })).toMatchObject({
      isDemo: false,
      provider: { id: "photon" },
    });
    expect(getGeocodingProvider({ mode: "demo", contactEmail: "a@b.c" }).provider.id).toBe(
      "demo-geocoding",
    );
  });
});
