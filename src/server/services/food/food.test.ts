import { describe, expect, it } from "vitest";
import { FoodQuerySchema, type FoodQueryInput, type FoodResult } from "@/domain/food";
import type { Place } from "@/domain/place";
import { TripSchema, type Trip } from "@/domain/trip";
import { ProviderError } from "@/server/providers/core/types";
import { getFoodRatingsProvider } from "@/server/providers/food";
import { foodOf, priceOf } from "@/server/providers/pois/overpass";
import { getPlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider } from "@/server/providers/routing";
import { DEMO_ROUTING_HOTEL } from "@/server/providers/routing/demo";
import { computeEdit, computeItinerary } from "../itinerary";
import { mealContext } from "./context";
import { cuisineFacets, isLocalCuisine, isQuick, matchesDiet, matchesFoodFilters } from "./filters";
import { compareReferences, rankFood, withinMinutes } from "./ranking";
import { FoodUnavailableError, searchFood } from "./index";

const source = { name: "OpenStreetMap", retrievedAt: "2026-10-26T21:33:43.876Z" };

const deps = {
  places: getPlacesProvider({ mode: "demo" }),
  routing: getRoutingProvider({ mode: "demo" }),
  ratings: getFoodRatingsProvider(),
};

const baseTrip: Trip = TripSchema.parse({
  id: "trip1234567890abcdefghij",
  destination: {
    id: "osm:relation/5326784",
    name: "Madrid",
    label: "Madrid, España",
    kind: "city",
    location: DEMO_ROUTING_HOTEL.location,
    countryCode: "ES",
    source,
    isDemo: true,
  },
  startDate: "2026-10-28",
  endDate: "2026-10-29",
  travelers: { adults: 2 },
  hotel: {
    id: "hotel-1",
    name: DEMO_ROUTING_HOTEL.name,
    location: DEMO_ROUTING_HOTEL.location,
    checkIn: "2026-10-28",
    checkOut: "2026-10-29",
  },
  preferences: { interests: { museums: 3, monuments_history: 2 } },
  pace: { level: "balanced", dayStart: "09:00", dayEnd: "22:30" },
  budget: {},
  createdAt: source.retrievedAt,
  updatedAt: source.retrievedAt,
});

function food(id: string, extra: Partial<Place> = {}): Place {
  return {
    id,
    name: `Sitio ${id}`,
    category: "restaurant",
    layer: "food",
    location: { lat: 40.41, lng: -3.69 },
    source,
    isDemo: false,
    ...extra,
  };
}

const query = (input: Partial<FoodQueryInput> = {}) =>
  FoodQuerySchema.parse({ date: "2026-10-28", moment: "lunch", ...input });

function result(id: string, distances: FoodResult["distances"], open = true): FoodResult {
  return {
    place: food(id),
    opening: { status: open ? "open" : "no_hours" },
    distances,
    local: false,
    quick: false,
  };
}

describe("etiquetas gastronómicas de OSM", () => {
  it("lee dietas, terraza, reservas y enlaces solo si están en la fuente", () => {
    expect(
      foodOf({
        "diet:vegetarian": "only",
        "diet:vegan": "yes",
        outdoor_seating: "sidewalk",
        takeaway: "only",
        reservation: "recommended",
        "website:menu": "https://example.org/carta",
        "reservation:website": "no es una url",
      }),
    ).toEqual({
      vegetarian: "only",
      vegan: "yes",
      outdoorSeating: true,
      takeaway: "only",
      reservation: "recommended",
      menuUrl: "https://example.org/carta",
    });
    expect(foodOf({ outdoor_seating: "no" })).toEqual({ outdoorSeating: false });
    expect(foodOf({ cuisine: "spanish" })).toBeUndefined();
  });

  it("el precio solo sale de un rango de 1 a 4 símbolos de moneda", () => {
    expect(priceOf({ price_range: "€" })).toEqual({ category: "budget", raw: "€" });
    expect(priceOf({ "price:range": "$$$$" })).toEqual({ category: "luxury", raw: "$$$$" });
    expect(priceOf({ price_range: "10-20 €" })).toBeUndefined();
    expect(priceOf({ price_range: "€€€€€" })).toBeUndefined();
    expect(priceOf({})).toBeUndefined();
  });
});

describe("filtros", () => {
  it("dieta: vegano también cuenta como vegetariano; 'no' nunca pasa", () => {
    expect(matchesDiet(food("a", { food: { vegan: "only" } }), "vegetarian")).toBe(true);
    expect(matchesDiet(food("b", { food: { vegetarian: "yes" } }), "vegan")).toBe(false);
    expect(matchesDiet(food("c", { food: { vegetarian: "limited" } }), "vegetarian")).toBe(true);
    expect(matchesDiet(food("d", { food: { vegetarian: "no" } }), "vegetarian")).toBe(false);
    expect(matchesDiet(food("e"), "vegetarian")).toBe(false);
  });

  it("cocina local según el país y comida rápida según OSM", () => {
    const tapas = food("t", { cuisine: ["Tapas", "wine"] });
    expect(isLocalCuisine(tapas, "ES")).toBe(true);
    expect(isLocalCuisine(tapas, "FR")).toBe(false);
    expect(isLocalCuisine(food("r", { cuisine: ["regional"] }), undefined)).toBe(true);
    expect(isLocalCuisine(food("x"), "ES")).toBe(false);
    expect(isQuick(food("f", { category: "fast_food" }))).toBe(true);
    expect(isQuick(food("g", { food: { takeaway: "only" } }))).toBe(true);
    expect(isQuick(food("h", { food: { takeaway: "yes" } }))).toBe(false);
  });

  it("combina cocina, dieta, terraza y estilo", () => {
    const place = food("p", {
      cuisine: ["spanish"],
      food: { vegetarian: "yes", outdoorSeating: true },
    });
    const ok = (input: Partial<FoodQueryInput>) => matchesFoodFilters(place, query(input), "ES");
    expect(ok({ cuisine: "spanish", diet: "vegetarian", terrace: true, style: "local" })).toBe(
      true,
    );
    expect(ok({ cuisine: "italian" })).toBe(false);
    expect(ok({ diet: "vegan" })).toBe(false);
    expect(ok({ style: "quick" })).toBe(false);
    expect(matchesFoodFilters(food("q"), query({ terrace: true }), "ES")).toBe(false);
  });

  it("cuenta las cocinas sin repetir por sitio", () => {
    const facets = cuisineFacets([
      food("1", { cuisine: ["spanish", "tapas"] }),
      food("2", { cuisine: ["tapas", "Tapas"] }),
      food("3"),
    ]);
    expect(facets).toEqual([
      { value: "tapas", count: 2 },
      { value: "spanish", count: 1 },
    ]);
  });
});

describe("ranking", () => {
  it("primero con tiempo calculado (penalizando el horario pendiente), luego en línea recta", () => {
    const ranked = rankFood(
      [
        result("lejos", { next: { straightMeters: 300, minutes: 9 } }),
        result("sin-tiempo", { next: { straightMeters: 50 } }),
        result("pendiente", { next: { straightMeters: 200, minutes: 5 } }, false),
        result("cerca", { next: { straightMeters: 250, minutes: 7 } }),
      ],
      "next",
    );
    // pendiente: 5 + 5 = 10 > 9.
    expect(ranked.map((r) => r.place.id)).toEqual(["cerca", "lejos", "pendiente", "sin-tiempo"]);
  });

  it("el tiempo máximo usa minutos o, sin ellos, una línea recta prudente", () => {
    const quick = result("a", { hotel: { straightMeters: 900, minutes: 10 } });
    const straight = result("b", { hotel: { straightMeters: 700 } });
    expect(withinMinutes(quick, "hotel", 10)).toBe(true);
    expect(withinMinutes(straight, "hotel", 10)).toBe(false);
    expect(withinMinutes(straight, "hotel", 12)).toBe(true);
    expect(withinMinutes(quick, "next", 30)).toBe(false);
  });

  it("compara la siguiente actividad con el hotel", () => {
    const results = [
      result("a", {
        next: { straightMeters: 100, minutes: 2 },
        hotel: { straightMeters: 900, minutes: 14 },
      }),
      result("b", {
        next: { straightMeters: 400, minutes: 6 },
        hotel: { straightMeters: 200, minutes: 3 },
      }),
    ];
    const [next, hotel] = compareReferences(results, [
      { key: "next", name: "Prado", location: { lat: 0, lng: 0 } },
      { key: "hotel", name: "Hotel", location: { lat: 0, lng: 0 } },
    ]);
    expect(next).toMatchObject({ count: 2, closest: { placeId: "a", minutes: 2 } });
    expect(hotel).toMatchObject({ count: 1, closest: { placeId: "b", minutes: 3 } });
  });
});

describe("contexto de la comida", () => {
  it("sin itinerario usa la hora típica y el hotel", () => {
    const context = mealContext(baseTrip, "2026-10-28", "snack");
    expect(context.start).toBe(17 * 60 + 30);
    expect(context.references.map((r) => r.key)).toEqual(["hotel"]);
  });

  it("con itinerario toma la franja y las actividades de antes y después", async () => {
    const itinerary = await computeItinerary(baseTrip, deps);
    const trip = { ...baseTrip, days: itinerary.days };
    const day = itinerary.days[0]!;
    const lunch = day.activities.find((a) => a.planning?.slot === "lunch")!;
    const context = mealContext(trip, day.date, "lunch");
    expect(context.meal?.id).toBe(lunch.id);
    expect(context.start).toBe(
      Number(lunch.startTime!.slice(0, 2)) * 60 + Number(lunch.startTime!.slice(3)),
    );
    const index = day.activities.indexOf(lunch);
    const before = day.activities
      .slice(0, index)
      .filter((a) => a.place)
      .at(-1);
    const after = day.activities.slice(index + 1).find((a) => a.place);
    expect(context.references.find((r) => r.key === "previous")?.activityId).toBe(before?.id);
    expect(context.references.find((r) => r.key === "next")?.activityId).toBe(after?.id);
    expect(context.references.at(-1)?.key).toBe("hotel");
  });
});

describe("búsqueda de sitios para comer (demo)", () => {
  it("devuelve sitios reales de OSM abiertos a esa hora, con tiempos a pie y sin valoraciones", async () => {
    const search = await searchFood(baseTrip, query({ near: "hotel" }), deps);
    expect(search.context.near).toBe("hotel");
    expect(search.results.length).toBeGreaterThan(5);
    expect(search.totals.zone).toBeGreaterThanOrEqual(search.totals.matching);
    expect(search.ratings.status).toBe("not_configured");
    for (const item of search.results) {
      expect(item.place.layer).toBe("food");
      expect(item.place.isDemo).toBe(true);
      expect(item.place.source.url).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
      expect(item.opening.status).not.toBe("closed");
    }
    const timed = search.results.filter((r) => r.distances.hotel?.minutes !== undefined);
    expect(timed.length).toBeGreaterThan(5);
    expect(search.travel.isDemo).toBe(true);
    const minutes = timed.map((r) => r.distances.hotel!.minutes!);
    expect(minutes[0]).toBeLessThanOrEqual(minutes.at(-1)!);
  });

  it("a las 9:00 descarta los que el horario de OSM da por cerrados", async () => {
    const lunch = await searchFood(baseTrip, query({ moment: "lunch" }), deps);
    const breakfast = await searchFood(baseTrip, query({ moment: "breakfast" }), deps);
    expect(breakfast.totals.closed).toBeGreaterThan(lunch.totals.closed);
  });

  it("aplica dieta y tiempo máximo", async () => {
    const vegan = await searchFood(baseTrip, query({ diet: "vegan" }), deps);
    expect(vegan.results.every((r) => matchesDiet(r.place, "vegan"))).toBe(true);
    const close = await searchFood(baseTrip, query({ near: "hotel", maxMinutes: 5 }), deps);
    expect(close.results.every((r) => withinMinutes(r, "hotel", 5))).toBe(true);
  });

  it("si OSM falla, error con la zona para ofrecer el mapa externo", async () => {
    const failing = {
      ...deps,
      places: {
        ...deps.places,
        provider: {
          ...deps.places.provider,
          searchByBBox: () => Promise.reject(new ProviderError("caído", "overpass")),
        },
      },
    };
    await expect(searchFood(baseTrip, query(), failing)).rejects.toBeInstanceOf(
      FoodUnavailableError,
    );
  });
});

describe("restaurante en la franja de comida", () => {
  it("lo añade a la comida, recalcula los tramos y lo conserva al regenerar", async () => {
    const itinerary = await computeItinerary(baseTrip, deps);
    const trip = { ...baseTrip, days: itinerary.days };
    const day = itinerary.days[0]!;
    const lunch = day.activities.find((a) => a.planning?.slot === "lunch")!;
    const search = await searchFood(trip, query({ near: "next" }), deps);
    const chosen = search.results[0]!.place;

    const [edited] = await computeEdit(
      trip,
      { op: "set_meal_place", activityId: lunch.id, place: chosen },
      deps,
    );
    const meal = edited!.activities.find((a) => a.id === lunch.id)!;
    expect(meal.kind).toBe("meal");
    expect(meal.place?.id).toBe(chosen.id);
    expect(meal.planning?.slot).toBe("lunch");
    expect(edited!.legs.some((leg) => leg.toActivityId === lunch.id)).toBe(true);
    expect(edited!.legs.some((leg) => leg.fromActivityId === lunch.id)).toBe(true);

    const withMeal = { ...trip, days: trip.days.map((d) => (d.id === edited!.id ? edited! : d)) };
    const regenerated = await computeItinerary(withMeal, deps);
    const kept = regenerated.days[0]!.activities.find((a) => a.id === lunch.id);
    expect(kept?.place?.id).toBe(chosen.id);

    const [cleared] = await computeEdit(
      withMeal,
      { op: "set_meal_place", activityId: lunch.id, place: null },
      deps,
    );
    expect(cleared!.activities.find((a) => a.id === lunch.id)?.place).toBeUndefined();
  });

  it("solo una comida admite restaurante", async () => {
    const itinerary = await computeItinerary(baseTrip, deps);
    const trip = { ...baseTrip, days: itinerary.days };
    const visit = itinerary.days[0]!.activities.find((a) => a.kind === "visit")!;
    await expect(
      computeEdit(trip, { op: "set_meal_place", activityId: visit.id, place: food("x") }, deps),
    ).rejects.toThrow("Solo se puede elegir un sitio para una comida.");
  });
});
