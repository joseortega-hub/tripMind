import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/place";
import { TripSchema, type Activity, type Trip } from "@/domain/trip";
import { deviationOf, summarizeBudget } from "./budget";

const retrievedAt = "2026-10-26T21:33:43.876Z";
const osmSource = {
  name: "OpenStreetMap (Overpass API)",
  url: "https://www.openstreetmap.org/way/1",
  retrievedAt,
  license: "ODbL 1.0",
};

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "osm:way/1",
    name: "Museo del Prado",
    category: "museum",
    layer: "tourism",
    location: { lat: 40.4138, lng: -3.6921 },
    source: osmSource,
    isDemo: true,
    ...overrides,
  };
}

describe("deviationOf", () => {
  it.each([
    [undefined, 10, 0, "no_plan", undefined],
    [100, 20, 30, "ok", 50],
    [100, 50, 45, "near", 5],
    [100, 60, 50, "at_risk", -10],
    [100, 120, 0, "over", -20],
  ] as const)("plan %s, conf %s, orient %s → %s", (planned, confirmed, estimated, level, rest) => {
    expect(deviationOf(planned, confirmed, estimated)).toEqual(
      level === "no_plan" ? { level } : { level, remaining: rest },
    );
  });
});

describe("summarizeBudget", () => {
  const activity = (overrides: Partial<Activity>): Activity => ({
    id: "a",
    kind: "visit",
    title: "Visita",
    durationMinutes: 60,
    locked: false,
    bookingRequirement: "unverified",
    bookingLinks: [],
    ...overrides,
  });

  function trip(days: Trip["days"], extra: Partial<Trip> = {}): Trip {
    return TripSchema.parse({
      id: "trip1234567890abcdefgh",
      destination: {
        id: "osm:relation/5326784",
        name: "Madrid",
        label: "Madrid, España",
        kind: "city",
        location: { lat: 40.4167, lng: -3.7033 },
        source: osmSource,
        isDemo: true,
      },
      startDate: "2026-10-28",
      endDate: "2026-10-29",
      travelers: { adults: 2, children: 0 },
      preferences: { interests: {} },
      pace: {
        level: "balanced",
        dayStart: "09:00",
        dayEnd: "21:00",
        mealMinutes: 60,
        freeMinutes: 0,
        reducedMobility: false,
        restDays: [],
      },
      budget: { currency: "EUR", total: 300, categories: { activities: 40, food: 100 } },
      days,
      createdAt: retrievedAt,
      updatedAt: retrievedAt,
      ...extra,
    });
  }

  it("distingue confirmado, orientativo y sin precio sin inventar importes", () => {
    const summary = summarizeBudget(
      trip([
        {
          id: "d1",
          date: "2026-10-28",
          isRestDay: false,
          activities: [
            activity({
              id: "prado",
              place: place({ tickets: { fee: "yes" } }),
              paidPrice: { amount: 30, currency: "EUR" },
              bookingStatus: "ticket_purchased",
            }),
            activity({ id: "naval", place: place({ id: "n", tickets: { charge: "6 EUR" } }) }),
            activity({ id: "lope", place: place({ id: "l", tickets: { fee: "no" } }) }),
            activity({ id: "retiro", place: place({ id: "r" }) }),
            activity({ id: "cancel", place: place({ id: "c" }), bookingStatus: "cancelled" }),
            activity({ id: "lunch", kind: "meal", title: "Comida" }),
            activity({ id: "free", kind: "free_time", title: "Tiempo libre" }),
          ],
          legs: [
            {
              id: "leg1",
              from: { lat: 40.41, lng: -3.69 },
              to: { lat: 40.42, lng: -3.7 },
              mode: "car",
              quality: "approximate",
            },
          ],
        },
      ]),
    );

    const activities = summary.parts.find((part) => part.category === "activities")!;
    expect(activities).toMatchObject({
      planned: 40,
      confirmed: 30,
      estimated: 12,
      unknownCount: 1,
    });
    expect(activities.deviation).toEqual({ level: "at_risk", remaining: -2 });
    const byId = Object.fromEntries(activities.lines.map((line) => [line.id, line]));
    expect(byId.naval).toMatchObject({ certainty: "estimated", amount: 12 });
    expect(byId.naval!.basis).toContain("por persona × 2");
    expect(byId.lope).toMatchObject({ certainty: "estimated", amount: 0 });
    expect(byId.retiro).toMatchObject({ certainty: "unknown" });
    expect(byId.retiro!.amount).toBeUndefined();
    expect(byId.cancel!.cancelled).toBe(true);

    const food = summary.parts.find((part) => part.category === "food")!;
    expect(food).toMatchObject({ confirmed: 0, estimated: 0, unknownCount: 1 });
    expect(food.deviation.level).toBe("ok");
    const transport = summary.parts.find((part) => part.category === "transport")!;
    expect(transport).toMatchObject({ unknownCount: 1, planned: undefined });
    expect(transport.deviation.level).toBe("no_plan");

    expect(summary).toMatchObject({
      planned: 300,
      plannedBasis: "total",
      confirmed: 30,
      estimated: 12,
      unknownCount: 3,
    });
    expect(summary.deviation).toEqual({ level: "ok", remaining: 258 });
  });

  it("el hotel pagado cuenta como confirmado; en otra moneda queda sin precio", () => {
    const hotel = {
      id: "h",
      name: "Hotel México",
      location: { lat: 40.41, lng: -3.69 },
      checkIn: "2026-10-28",
      checkOut: "2026-10-29",
      bookingStatus: "booked" as const,
      paidPrice: { amount: 180, currency: "EUR" },
    };
    const paid = summarizeBudget(trip([], { hotel }));
    expect(paid.parts[0]).toMatchObject({ category: "accommodation", confirmed: 180 });
    const usd = summarizeBudget(
      trip([], { hotel: { ...hotel, paidPrice: { amount: 200, currency: "USD" } } }),
    );
    expect(usd.parts[0]).toMatchObject({ confirmed: 0, unknownCount: 1 });
    expect(usd.parts[0]!.lines[0]!.basis).toContain("otra moneda");
  });

  it("sin total usa la suma de partidas; sin nada, no hay presupuesto", () => {
    const sumOnly = summarizeBudget(
      trip([], { budget: { currency: "EUR", categories: { food: 50, transport: 20 } } }),
    );
    expect(sumOnly).toMatchObject({ planned: 70, plannedBasis: "categories" });
    const none = summarizeBudget(trip([], { budget: { currency: "EUR", categories: {} } }));
    expect(none).toMatchObject({ planned: undefined, plannedBasis: "none" });
    expect(none.deviation.level).toBe("no_plan");
  });
});
