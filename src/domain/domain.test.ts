import { describe, expect, it } from "vitest";
import {
  BBoxStringSchema,
  CATEGORY_LAYER,
  categoriesForLayers,
  LegSchema,
  PaceSchema,
  PlaceSchema,
  PriceSchema,
  TripInputSchema,
} from ".";

const source = {
  name: "OpenStreetMap (Overpass API)",
  retrievedAt: "2026-10-26T10:00:00.000Z",
  license: "ODbL 1.0",
};

describe("BBoxStringSchema", () => {
  it("parsea oeste,sur,este,norte", () => {
    expect(BBoxStringSchema.parse("-3.7,40.41,-3.69,40.42")).toEqual([-3.7, 40.41, -3.69, 40.42]);
  });

  it("rechaza bbox invertidos o incompletos", () => {
    expect(BBoxStringSchema.safeParse("-3.69,40.41,-3.7,40.42").success).toBe(false);
    expect(BBoxStringSchema.safeParse("1,2,3").success).toBe(false);
    expect(BBoxStringSchema.safeParse("a,b,c,d").success).toBe(false);
  });
});

describe("PlaceSchema", () => {
  it("exige source e isDemo", () => {
    const place = {
      id: "osm:node/1",
      name: "Museo",
      category: "museum",
      layer: "tourism",
      location: { lat: 40.41, lng: -3.69 },
    };
    expect(PlaceSchema.safeParse(place).success).toBe(false);
    expect(PlaceSchema.safeParse({ ...place, source, isDemo: false }).success).toBe(true);
  });

  it("cada categoría pertenece a una capa", () => {
    expect(categoriesForLayers(["food"])).toEqual([
      "restaurant",
      "cafe",
      "bar",
      "fast_food",
      "ice_cream",
      "food_court",
      "marketplace",
    ]);
    expect(Object.values(CATEGORY_LAYER)).not.toContain(undefined);
  });
});

describe("PriceSchema", () => {
  it("un precio de proveedor sin fuente no es válido", () => {
    expect(
      PriceSchema.safeParse({
        certainty: "confirmed",
        amount: 20,
        currency: "EUR",
        origin: "provider",
      }).success,
    ).toBe(false);
  });

  it("un precio desconocido no lleva importe", () => {
    expect(PriceSchema.safeParse({ certainty: "unknown" }).success).toBe(true);
    expect(PriceSchema.safeParse({ certainty: "unknown", amount: 3 }).success).toBe(false);
  });

  it("el usuario puede fijar un precio orientativo", () => {
    expect(
      PriceSchema.safeParse({ certainty: "estimated", amount: 15, currency: "EUR", origin: "user" })
        .success,
    ).toBe(true);
  });
});

describe("LegSchema", () => {
  const base = {
    id: "l1",
    from: { lat: 40.41, lng: -3.7 },
    to: { lat: 40.42, lng: -3.69 },
    mode: "walk",
  };

  it("una ruta real necesita fuente; una aproximada no", () => {
    expect(LegSchema.safeParse({ ...base, quality: "routed" }).success).toBe(false);
    expect(LegSchema.safeParse({ ...base, quality: "routed", source, isDemo: false }).success).toBe(
      true,
    );
    expect(LegSchema.safeParse({ ...base, quality: "approximate" }).success).toBe(true);
  });
});

describe("PaceSchema", () => {
  it("aplica valores por defecto y valida el horario", () => {
    expect(PaceSchema.parse({})).toMatchObject({
      level: "balanced",
      dayStart: "09:30",
      dayEnd: "20:00",
    });
    expect(PaceSchema.safeParse({ dayStart: "21:00", dayEnd: "20:00" }).success).toBe(false);
    expect(PaceSchema.safeParse({ dayStart: "9:00" }).success).toBe(false);
  });
});

describe("TripInputSchema", () => {
  const input = {
    destination: {
      id: "osm:relation/5326784",
      name: "Madrid",
      label: "Madrid, Comunidad de Madrid, España",
      kind: "city",
      location: { lat: 40.416782, lng: -3.703507 },
      source: { name: "Photon (komoot)", retrievedAt: "2026-10-26T10:00:00.000Z" },
      isDemo: true,
    },
    startDate: "2026-11-10",
    endDate: "2026-11-12",
    travelers: { adults: 2 },
    preferences: { interests: { museums: 3, gastronomy: 2 } },
    pace: {},
    budget: { total: 900 },
  };

  it("acepta un viaje mínimo y rellena valores por defecto", () => {
    const trip = TripInputSchema.parse(input);
    expect(trip.travelers.children).toBe(0);
    expect(trip.budget.currency).toBe("EUR");
  });

  it("rechaza fechas invertidas y pesos fuera de rango", () => {
    expect(TripInputSchema.safeParse({ ...input, endDate: "2026-11-01" }).success).toBe(false);
    expect(
      TripInputSchema.safeParse({ ...input, preferences: { interests: { museums: 5 } } }).success,
    ).toBe(false);
  });
});
