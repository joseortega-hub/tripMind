import { describe, expect, it, vi } from "vitest";
import type { BBox } from "@/domain/geo";
import { categoriesForLayers, PlaceCategorySchema, PlaceSchema } from "@/domain/place";
import { MemoryCacheStore } from "../core/cache";
import { classifyOsmTags } from "./categories";
import { createDemoPlacesProvider, DEMO_BBOX, DEMO_COVERAGE_WARNING } from "./demo";
import commonsFixture from "./fixtures/commons.json";
import overpassFixture from "./fixtures/overpass.json";
import wikidataFixture from "./fixtures/wikidata.json";
import { getPlacesProvider } from "./index";
import {
  buildOverpassQuery,
  mapOverpassResponse,
  OverpassResponseSchema,
  snapBBox,
} from "./overpass";
import { createRealPlacesProvider, ENRICHMENT_WARNING } from "./real";
import {
  applyEnrichment,
  CommonsImageInfoSchema,
  htmlToText,
  parseCommonsImageInfo,
  parseWikidataEntities,
  WikidataEntitiesSchema,
} from "./wikidata";

const meta = { retrievedAt: "2026-10-26T10:00:00.000Z", isDemo: false };
const allCategories = PlaceCategorySchema.options;

describe("categorías OSM", () => {
  it.each([
    [{ tourism: "museum", historic: "palace" }, "museum"],
    [{ amenity: "pub" }, "bar"],
    [{ railway: "station", station: "subway" }, "metro_station"],
    [{ railway: "station" }, "train_station"],
    [{ historic: "memorial", memorial: "statue" }, "monument"],
    [{ historic: "memorial", memorial: "plaque" }, undefined],
    [{ amenity: "place_of_worship" }, undefined],
    [{ leisure: "garden", access: "private" }, undefined],
    [{ shop: "bakery" }, undefined],
  ])("%j → %s", (tags, expected) => {
    expect(classifyOsmTags(tags)).toBe(expected);
  });
});

describe("consulta Overpass", () => {
  it("usa (sur,oeste,norte,este), exige nombre y limita resultados", () => {
    const query = buildOverpassQuery({
      bbox: [-3.7, 40.41, -3.69, 40.42],
      categories: ["museum", "restaurant"],
      limit: 50,
    });
    expect(query).toContain('nwr["tourism"="museum"]["name"](40.41,-3.7,40.42,-3.69);');
    expect(query).toContain('nwr["amenity"="restaurant"]["name"]');
    expect(query).toContain("out center tags qt 50;");
    expect(query).not.toContain("hotel");
  });

  it("ajusta el bbox a una rejilla que lo contiene", () => {
    const original: BBox = [-3.6987, 40.4113, -3.6912, 40.4161];
    const [w, s, e, n] = snapBBox(original);
    expect(w).toBeLessThanOrEqual(original[0]);
    expect(s).toBeLessThanOrEqual(original[1]);
    expect(e).toBeGreaterThanOrEqual(original[2]);
    expect(n).toBeGreaterThanOrEqual(original[3]);
    expect(snapBBox([-3.6986, 40.4114, -3.6913, 40.416])).toEqual([w, s, e, n]);
  });
});

describe("mapeo Overpass", () => {
  const places = mapOverpassResponse(OverpassResponseSchema.parse(overpassFixture.response), meta);

  it("todos los lugares grabados cumplen el esquema y tienen fuente OSM", () => {
    expect(places.length).toBeGreaterThan(100);
    for (const place of places) {
      expect(PlaceSchema.safeParse(place).success).toBe(true);
      expect(place.source.url).toMatch(
        /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/,
      );
    }
  });

  it("encuentra el Museo del Prado con su Wikidata", () => {
    const prado = places.find((p) => p.name === "Museo del Prado");
    expect(prado).toMatchObject({ category: "museum", layer: "tourism", wikidataId: "Q160112" });
  });

  it("cubre las capas de turismo, gastronomía, alojamiento y transporte", () => {
    expect(new Set(places.map((p) => p.layer))).toEqual(
      new Set(["tourism", "food", "lodging", "transport"]),
    );
  });

  it("descarta webs no http y elementos sin nombre o categoría", () => {
    const result = mapOverpassResponse(
      {
        elements: [
          {
            type: "node",
            id: 1,
            lat: 40.4,
            lon: -3.7,
            tags: { name: "A", amenity: "cafe", website: "javascript:alert(1)" },
          },
          { type: "node", id: 2, lat: 40.4, lon: -3.7, tags: { amenity: "cafe" } },
          { type: "node", id: 3, lat: 40.4, lon: -3.7, tags: { name: "C", shop: "bakery" } },
          {
            type: "way",
            id: 4,
            center: { lat: 40.41, lon: -3.69 },
            tags: { name: "D", tourism: "hotel", stars: "4" },
          },
        ],
      },
      meta,
    );
    expect(result.map((p) => p.id)).toEqual(["osm:node/1", "osm:way/4"]);
    expect(result[0]?.website).toBeUndefined();
    expect(result[1]).toMatchObject({ location: { lat: 40.41, lng: -3.69 }, stars: 4 });
  });
});

describe("Wikidata y Commons", () => {
  const facts = Object.assign(
    {},
    ...wikidataFixture.entries.map((e) =>
      parseWikidataEntities(WikidataEntitiesSchema.parse(e.response)),
    ),
  );
  const images = Object.assign(
    {},
    ...commonsFixture.entries.map((e) =>
      parseCommonsImageInfo(CommonsImageInfoSchema.parse(e.response)),
    ),
  );

  it("extrae P18 y P856 del Museo del Prado", () => {
    expect(facts.Q160112).toMatchObject({
      imageFile: expect.any(String),
      website: expect.stringMatching(/^https?:\/\//),
    });
  });

  it("solo acepta imágenes con licencia", () => {
    const values = Object.values(images) as { license: string }[];
    expect(values.length).toBeGreaterThan(0);
    for (const image of values) expect(image.license).toBeTruthy();
  });

  it("da prioridad a la web oficial de Wikidata y añade imagen con autor y licencia", () => {
    const places = mapOverpassResponse(
      OverpassResponseSchema.parse(overpassFixture.response),
      meta,
    );
    const enriched = applyEnrichment(places, { retrievedAt: meta.retrievedAt, facts, images });
    const prado = enriched.find((p) => p.wikidataId === "Q160112");
    expect(prado).toMatchObject({ websiteSource: "wikidata", website: facts.Q160112.website });
    expect(prado?.image).toMatchObject({
      license: expect.any(String),
      source: { name: "Wikimedia Commons", url: expect.stringContaining("commons.wikimedia.org") },
    });
    expect(enriched.filter((p) => !p.wikidataId)).toEqual(places.filter((p) => !p.wikidataId));
  });

  it("convierte el HTML del autor en texto", () => {
    expect(htmlToText('<a href="//commons.wikimedia.org/wiki/User:X">Ana &amp; Luis</a>')).toBe(
      "Ana & Luis",
    );
  });
});

describe("adaptador real de lugares", () => {
  const bbox: BBox = [-3.696, 40.412, -3.69, 40.416];
  const overpassBody = overpassFixture.response;

  function mockFetch({ wikidataFails = false } = {}) {
    return vi.fn(async (url: string) => {
      if (url.includes("overpass")) return Response.json(overpassBody);
      if (wikidataFails) return new Response("", { status: 500 });
      if (url.includes("wikidata")) return Response.json(wikidataFixture.entries[0]!.response);
      return Response.json(commonsFixture.entries[0]!.response);
    });
  }

  it("filtra al bbox pedido, enriquece y cachea", async () => {
    const fetchMock = mockFetch();
    const provider = createRealPlacesProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: fetchMock,
    });
    const query = { bbox, categories: categoriesForLayers(["tourism"]), limit: 200 };
    const first = await provider.searchByBBox(query);
    expect(first.places.length).toBeGreaterThan(0);
    expect(first.places.every((p) => p.layer === "tourism")).toBe(true);
    expect(first.places.every((p) => p.location.lng >= bbox[0] && p.location.lng <= bbox[2])).toBe(
      true,
    );
    expect(first.warnings).toEqual([]);
    expect(first.places.some((p) => p.image)).toBe(true);

    const calls = fetchMock.mock.calls.length;
    const second = await provider.searchByBBox(query);
    expect(second.fromCache).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("si Wikidata falla devuelve los lugares de OSM con aviso", async () => {
    const provider = createRealPlacesProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: mockFetch({ wikidataFails: true }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await provider.searchByBBox({ bbox, categories: allCategories, limit: 200 });
    expect(result.places.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([ENRICHMENT_WARNING]);
  });

  it("rechaza zonas demasiado grandes sin llamar a Overpass", async () => {
    const fetchMock = mockFetch();
    const provider = createRealPlacesProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: fetchMock,
    });
    await expect(
      provider.searchByBBox({ bbox: [-4, 40, -3, 41], categories: allCategories, limit: 10 }),
    ).rejects.toMatchObject({ name: "ProviderInputError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un fallo de Overpass es un ProviderError", async () => {
    const provider = createRealPlacesProvider({
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: async () => new Response("", { status: 429 }),
    });
    await expect(
      provider.searchByBBox({ bbox, categories: allCategories, limit: 10 }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      providerId: "overpass",
    });
  });
});

describe("adaptador demo de lugares", () => {
  const demo = createDemoPlacesProvider();

  it("filtra por bbox y categorías y marca isDemo", async () => {
    const { places, warnings } = await demo.searchByBBox({
      bbox: DEMO_BBOX,
      categories: ["museum"],
      limit: 50,
    });
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((p) => p.category === "museum" && p.isDemo)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("respeta el límite", async () => {
    const { places } = await demo.searchByBBox({
      bbox: DEMO_BBOX,
      categories: allCategories,
      limit: 7,
    });
    expect(places).toHaveLength(7);
  });

  it("fuera de la zona grabada no inventa lugares y lo indica", async () => {
    const result = await demo.searchByBBox({
      bbox: [2.17, 41.38, 2.18, 41.39],
      categories: allCategories,
      limit: 50,
    });
    expect(result.places).toEqual([]);
    expect(result.warnings).toEqual([DEMO_COVERAGE_WARNING]);
  });
});

describe("registro de lugares", () => {
  it("elige demo o Overpass según modo y configuración", () => {
    expect(getPlacesProvider({ mode: "auto" }).provider.id).toBe("demo-places");
    expect(getPlacesProvider({ mode: "auto", contactEmail: "a@b.c" }).provider.id).toBe("overpass");
    expect(getPlacesProvider({ mode: "demo", contactEmail: "a@b.c" }).provider.id).toBe(
      "demo-places",
    );
  });
});
