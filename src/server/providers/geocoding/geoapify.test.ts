import { describe, expect, it, vi } from "vitest";
import { GeocodeResultSchema } from "@/domain/geocoding";
import { MemoryCacheStore } from "../core/cache";
import photonFixture from "./fixtures/photon.json";
import { GeoapifyResponseSchema, geoapifyUrl, mapGeoapifyResponse } from "./geoapify";
import { createRealGeocodingProvider } from "./real";

const meta = { retrievedAt: "2026-10-27T10:00:00.000Z", isDemo: false };

// Forma documentada de /v1/geocode/autocomplete con format=json (campos que usamos).
const warsaw = {
  results: [
    {
      name: "Varsovia",
      country: "Polonia",
      country_code: "pl",
      state: "Voivodato de Mazovia",
      city: "Varsovia",
      lon: 21.0067,
      lat: 52.2319,
      result_type: "city",
      place_id: "51abc",
      bbox: { lon1: 20.85, lat1: 52.09, lon2: 21.27, lat2: 52.36 },
      datasource: { sourcename: "openstreetmap", raw: { osm_id: 336075, osm_type: "r" } },
    },
  ],
};

describe("Geoapify", () => {
  it("pide español, con sesgo opcional y la clave solo en la URL del servidor", () => {
    const url = new URL(
      geoapifyUrl({ q: "Varsovia", limit: 5, near: { lat: 40.4, lng: -3.7 } }, "k"),
    );
    expect(url.searchParams.get("lang")).toBe("es");
    expect(url.searchParams.get("text")).toBe("Varsovia");
    expect(url.searchParams.get("bias")).toBe("proximity:-3.7,40.4");
    expect(url.searchParams.get("apiKey")).toBe("k");
  });

  it("mapea a un resultado con id y fuente de OpenStreetMap", () => {
    const [result] = mapGeoapifyResponse(GeoapifyResponseSchema.parse(warsaw), meta);
    expect(result).toMatchObject({
      id: "osm:relation/336075",
      name: "Varsovia",
      label: "Varsovia, Voivodato de Mazovia, Polonia",
      kind: "city",
      countryCode: "PL",
      source: { url: "https://www.openstreetmap.org/relation/336075" },
    });
    expect(GeocodeResultSchema.safeParse(result).success).toBe(true);
  });

  it("autocompleta con Geoapify cuando hay clave", async () => {
    const fetchMock = vi.fn(async () => Response.json(warsaw));
    const provider = createRealGeocodingProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: fetchMock,
      geoapifyApiKey: "k",
    });
    const response = await provider.autocomplete({ q: "Varsovia", limit: 5 });
    expect(response.providerId).toBe("geoapify");
    expect(response.results[0]?.label).toContain("Polonia");
    expect(String(fetchMock.mock.calls[0])).toContain("api.geoapify.com");
  });

  it("si Geoapify falla (créditos, clave) sigue con Photon", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("geoapify")
        ? new Response("", { status: 429 })
        : Response.json(photonFixture.entries[0]!.response),
    );
    const provider = createRealGeocodingProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: fetchMock,
      geoapifyApiKey: "k",
    });
    const response = await provider.autocomplete({ q: "Madrid", limit: 5 });
    expect(response.providerId).toBe("photon");
  });
});
