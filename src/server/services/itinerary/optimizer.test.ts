import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/place";
import { PaceSchema, PreferencesSchema, toMinutes } from "@/domain/preferences";
import { TripSchema, type Trip } from "@/domain/trip";
import { getPlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider } from "@/server/providers/routing";
import { DEMO_ROUTING_HOTEL } from "@/server/providers/routing/demo";
import { computeEdit, computeItinerary } from "./index";
import { closedAllDay, dayOpening, earliestStart, statusFor } from "./opening";
import {
  ANCHOR_ID,
  type DayContext,
  generateItinerary,
  planDay,
  scheduleSequence,
  type TravelEstimate,
  type VisitItem,
} from "./optimizer";
import { defaultBlocks, tripDates } from "./plan";
import { estimatedDuration, placeScore } from "./profile";
import { buildTravel } from "./travel";

const source = { name: "Prueba", retrievedAt: "2026-10-27T10:00:00.000Z" };

function place(id: string, lng: number, extra: Partial<Place> = {}): Place {
  return {
    id,
    name: `Lugar ${id}`,
    category: "museum",
    layer: "tourism",
    location: { lat: 40.41, lng },
    source,
    isDemo: false,
    ...extra,
  };
}

/** Puntos en una línea: 10 min a pie por cada 0,001 grados (el hotel en 0). */
const lineTravel =
  (positions: Record<string, number>) =>
  (from: string, to: string): TravelEstimate => ({
    mode: "walk",
    quality: "routed",
    durationMinutes: Math.round(Math.abs((positions[from] ?? 0) - (positions[to] ?? 0)) * 10_000),
    reservedMinutes: 0,
    straightMeters: 0,
    source,
    isDemo: false,
  });

function visit(p: Place, duration = 60, extra: Partial<VisitItem> = {}): VisitItem {
  return {
    type: "visit",
    id: p.id,
    place: p,
    duration,
    durationEstimated: true,
    score: 1,
    ...extra,
  };
}

function ctxFor(
  visits: VisitItem[],
  overrides: Partial<DayContext> = {},
  date = "2026-10-28", // miércoles
): DayContext {
  const positions: Record<string, number> = { [ANCHOR_ID]: 0 };
  for (const v of visits) positions[v.id] = v.place.location.lng;
  return {
    date,
    dayStart: toMinutes("09:00"),
    dayEnd: toMinutes("20:00"),
    slackMinutes: 0,
    hasAnchor: true,
    travel: lineTravel(positions),
    opening: (p) => dayOpening(p.openingHours, date, { countryCode: "ES", location: p.location }),
    ...overrides,
  };
}

const t = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

describe("horarios opening_hours", () => {
  const ctx = { countryCode: "ES", location: { lat: 40.41, lng: -3.69 } };

  it("evalúa ventanas en la hora local del destino", () => {
    // 28-10-2026 es miércoles.
    const opening = dayOpening("Tu-Su 10:00-19:00; Mo off", "2026-10-28", ctx);
    expect(statusFor(opening, toMinutes("10:00"), toMinutes("12:00"))).toBe("open");
    expect(statusFor(opening, toMinutes("18:00"), toMinutes("20:00"))).toBe("closed");
    expect(earliestStart(opening, toMinutes("09:00"), 60)).toBe(toMinutes("10:00"));
    expect(earliestStart(opening, toMinutes("18:30"), 60)).toBeUndefined();
  });

  it("distingue cerrado todo el día, sin horario, ilegible e incierto", () => {
    expect(closedAllDay(dayOpening("Tu-Su 10:00-19:00; Mo off", "2026-10-26", ctx))).toBe(true);
    expect(statusFor(dayOpening(undefined, "2026-10-28", ctx), 600, 660)).toBe("no_hours");
    expect(statusFor(dayOpening("solo con cita previa", "2026-10-28", ctx), 600, 660)).toBe(
      "unparsable",
    );
    expect(statusFor(dayOpening('Mo-Su 10:00-14:00 "por cita"', "2026-10-28", ctx), 600, 660)).toBe(
      "uncertain",
    );
  });
});

describe("programación de un día", () => {
  it("espera a que abra y nunca programa en horario cerrado", () => {
    const museum = visit(place("m", 0.001, { openingHours: "Mo-Su 11:00-14:00" }), 120);
    const ctx = ctxFor([museum]);
    const schedule = scheduleSequence([museum], ctx);
    expect(t(schedule.items[0]!.start)).toBe("11:00");
    expect(schedule.items[0]!.status).toBe("open");
    expect(schedule.violations).toBe(0);
  });

  it("marca como pendiente de confirmar lo que no tiene horario", () => {
    const statue = visit(place("s", 0.001), 20);
    const schedule = scheduleSequence([statue], ctxFor([statue]));
    expect(schedule.items[0]!.status).toBe("no_hours");
  });

  it("cuenta el desplazamiento: la hora de llegada respeta el tiempo de trayecto", () => {
    const a = visit(place("a", 0.002), 60);
    const b = visit(place("b", 0.005), 60);
    const schedule = scheduleSequence([a, b], ctxFor([a, b]));
    // Hotel→a 20 min, a→b 30 min, b→hotel 50 min.
    expect(t(schedule.items[0]!.start)).toBe("09:20");
    expect(t(schedule.items[1]!.start)).toBe("10:50");
    expect(schedule.legs.map((l) => l.estimate.durationMinutes)).toEqual([20, 30, 50]);
    expect(t(schedule.endTime)).toBe("12:40");
  });

  it("una actividad bloqueada mantiene su hora y el resto se organiza alrededor", () => {
    const locked = visit(place("l", 0.001), 60, { lockedStart: toMinutes("12:00") });
    const options = [1, 2, 3, 4].map((i) => visit(place(`v${i}`, 0.001 + i * 0.0005), 90));
    const ctx = ctxFor([locked, ...options]);
    const { schedule } = planDay([locked], options, ctx, 5);
    const lockedItem = schedule.items.find((s) => s.item.id === "l")!;
    expect(t(lockedItem.start)).toBe("12:00");
    expect(schedule.violations).toBe(0);
    // Ninguna visita se solapa con la bloqueada.
    for (const s of schedule.items) {
      if (s.item.id === "l") continue;
      expect(s.end <= lockedItem.start || s.start >= lockedItem.end).toBe(true);
    }
  });

  it("descarta lo que haría el día imposible en vez de forzarlo", () => {
    const far = visit(place("far", 0.05), 60); // 500 min de ida
    const near = visit(place("near", 0.001), 60);
    const ctx = ctxFor([far, near]);
    const { schedule, rejected } = planDay([], [far, near], ctx, 5);
    expect(schedule.items.map((s) => s.item.id)).toEqual(["near"]);
    expect(rejected).toEqual([expect.objectContaining({ reason: "no_time" })]);
    expect(schedule.violations).toBe(0);
  });

  it("rechaza un lugar cerrado todo ese día", () => {
    const closed = visit(place("c", 0.001, { openingHours: "Tu-Su 10:00-19:00; Mo off" }));
    // 26-10-2026 es lunes.
    const ctx = ctxFor([closed], {}, "2026-10-26");
    const { rejected } = planDay([], [closed], ctx, 5);
    expect(rejected[0]?.reason).toBe("closed");
  });

  it("reserva la comida en su franja", () => {
    const pace = PaceSchema.parse({
      dayStart: "09:00",
      dayEnd: "20:00",
      lunchMinutes: 90,
      freeTimeMinutes: 0,
    });
    const visits = [1, 2, 3].map((i) => visit(place(`v${i}`, i * 0.001), 90));
    const ctx = ctxFor(visits);
    const { schedule } = planDay(defaultBlocks(pace), visits, ctx, 5);
    const lunch = schedule.items.find((s) => s.item.type === "block" && s.item.slot === "lunch")!;
    expect(lunch.start).toBeGreaterThanOrEqual(toMinutes("13:00"));
    expect(lunch.start).toBeLessThanOrEqual(toMinutes("15:00"));
    expect(schedule.violations).toBe(0);
  });
});

describe("itinerario completo", () => {
  const places = Array.from({ length: 12 }, (_, i) =>
    place(`p${i}`, (i % 2 === 0 ? 1 : -1) * 0.001 * (1 + (i % 3)), {
      location: { lat: 40.41 + 0.001 * Math.sin(i), lng: -3.69 + 0.001 * Math.cos(i) },
    }),
  );
  const visits = places.map((p, i) => visit(p, 60, { score: 12 - i }));

  function run(restDays: string[] = []) {
    const dates = ["2026-10-28", "2026-10-29", "2026-10-30"];
    const positions: Record<string, number> = { [ANCHOR_ID]: 0 };
    visits.forEach((v, i) => (positions[v.id] = (i + 1) * 0.0005));
    return generateItinerary({
      days: dates.map((date) => ({
        ctx: ctxFor([], { travel: lineTravel(positions) }, date),
        isRestDay: restDays.includes(date),
        fixed: [],
      })),
      candidates: visits,
      maxVisitsPerDay: 3,
      center: { lat: 40.41, lng: -3.69 },
    });
  }

  it("respeta el máximo por día y no repite lugares", () => {
    const { days } = run();
    const ids = days.flatMap((d) => d.schedule!.items.map((s) => s.item.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const day of days) expect(day.schedule!.items.length).toBeLessThanOrEqual(3);
    expect(ids.length).toBe(9);
  });

  it("deja vacíos los días libres", () => {
    const { days } = run(["2026-10-29"]);
    const rest = days.find((d) => d.date === "2026-10-29")!;
    expect(rest.isRestDay).toBe(true);
    expect(rest.schedule).toBeUndefined();
    expect(days.filter((d) => !d.isRestDay).every((d) => d.schedule!.items.length > 0)).toBe(true);
  });
});

describe("perfil", () => {
  it("las duraciones son estimaciones por categoría y ritmo", () => {
    const relaxed = PaceSchema.parse({ level: "relaxed" });
    const intensive = PaceSchema.parse({ level: "intensive" });
    const museum = place("m", 0);
    expect(estimatedDuration(museum, relaxed)).toBeGreaterThan(
      estimatedDuration(museum, intensive),
    );
  });

  it("puntúa según los intereses con peso", () => {
    const prefs = PreferencesSchema.parse({ interests: { nature: 3, museums: 1 } });
    const park = place("park", 0, { category: "park" });
    const museum = place("museum", 0);
    expect(placeScore(park, prefs, true)).toBeGreaterThan(placeScore(museum, prefs, true));
    expect(placeScore(place("t", 0, { category: "theatre" }), prefs, true)).toBe(0);
  });
});

describe("tramos", () => {
  const points = [
    { id: "a", location: { lat: 40.41, lng: -3.69 } },
    { id: "b", location: { lat: 40.42, lng: -3.69 } },
  ];
  const straight = [
    [0, 1112],
    [1112, 0],
  ];

  it("sin tiempos calculados reserva un margen y no inventa duración", () => {
    const travel = buildTravel(
      points,
      { walk: { mode: "walk", quality: "unavailable", straightLineMeters: straight } },
      { reducedMobility: false },
    );
    const leg = travel("a", "b");
    expect(leg.quality).toBe("approximate");
    expect(leg.durationMinutes).toBeUndefined();
    expect(leg.reservedMinutes).toBeGreaterThan(15);
  });

  it("pasa a taxi/coche si a pie es demasiado lejos", () => {
    const travel = buildTravel(
      points,
      {
        walk: {
          mode: "walk",
          quality: "routed",
          durationsSeconds: [
            [0, 3600],
            [3600, 0],
          ],
          straightLineMeters: straight,
          source,
          isDemo: false,
        },
        car: {
          mode: "car",
          quality: "routed",
          durationsSeconds: [
            [0, 600],
            [600, 0],
          ],
          straightLineMeters: straight,
          source,
          isDemo: false,
        },
      },
      { reducedMobility: false },
    );
    expect(travel("a", "b")).toMatchObject({
      mode: "car",
      durationMinutes: 10,
      reservedMinutes: 10,
    });
  });
});

describe("servicio con datos de demostración", () => {
  const deps = {
    places: getPlacesProvider({ mode: "demo" }),
    routing: getRoutingProvider({ mode: "demo" }),
  };

  const trip: Trip = TripSchema.parse({
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
    endDate: "2026-10-30",
    travelers: { adults: 2 },
    hotel: {
      id: "hotel",
      name: DEMO_ROUTING_HOTEL.name,
      location: DEMO_ROUTING_HOTEL.location,
      checkIn: "2026-10-28",
      checkOut: "2026-10-30",
    },
    preferences: { interests: { museums: 3, monuments_history: 2 } },
    pace: { level: "balanced", dayStart: "09:30", dayEnd: "20:00", restDays: ["2026-10-29"] },
    budget: {},
    createdAt: source.retrievedAt,
    updatedAt: source.retrievedAt,
  });

  it("genera días realizables con tiempos de la matriz, comidas y el Prado", async () => {
    const { days, meta } = await computeItinerary(trip, deps);
    expect(days.map((d) => d.date)).toEqual(tripDates("2026-10-28", "2026-10-30"));
    expect(days[1]!.isRestDay).toBe(true);
    expect(days[1]!.activities).toEqual([]);
    expect(meta?.travel.quality).toBe("routed");
    const all = days.flatMap((d) => d.activities);
    expect(all.some((a) => a.title === "Museo del Prado")).toBe(true);
    for (const day of days.filter((d) => !d.isRestDay)) {
      expect(day.activities.some((a) => a.planning?.slot === "lunch")).toBe(true);
      expect(day.activities.every((a) => a.planning?.warnings.length === 0)).toBe(true);
      expect(day.activities.every((a) => a.planning?.openingStatus !== "closed")).toBe(true);
      // Cada tramo routed lleva fuente; la vuelta al hotel cierra el día.
      expect(day.legs.every((l) => l.quality === "approximate" || l.source)).toBe(true);
      expect(day.legs.at(-1)?.toActivityId).toBeUndefined();
      const times = day.activities.map((a) => toMinutes(a.startTime!));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it("fijar una hora bloquea la actividad y recalcula solo ese día", async () => {
    const generated = await computeItinerary(trip, deps);
    const withDays = { ...trip, days: generated.days };
    const day = generated.days[0]!;
    const target = day.activities.find((a) => a.kind === "visit")!;
    const [updated] = await computeEdit(
      withDays,
      { op: "set_time", activityId: target.id, time: "17:00" },
      deps,
    );
    const edited = updated!.activities.find((a) => a.id === target.id)!;
    expect(edited.locked).toBe(true);
    expect(edited.startTime).toBe("17:00");
  });

  it("mover de día recalcula los dos días afectados", async () => {
    const generated = await computeItinerary(trip, deps);
    const withDays = { ...trip, days: generated.days };
    const target = generated.days[0]!.activities.find((a) => a.kind === "visit")!;
    const updated = await computeEdit(
      withDays,
      { op: "move", activityId: target.id, date: "2026-10-30", position: 0 },
      deps,
    );
    expect(updated.map((d) => d.date)).toEqual(["2026-10-28", "2026-10-30"]);
    expect(updated[1]!.activities[0]!.id).toBe(target.id);
    expect(updated[0]!.activities.some((a) => a.id === target.id)).toBe(false);
  });

  it("al regenerar conserva lo bloqueado en su día y hora", async () => {
    const generated = await computeItinerary(trip, deps);
    const target = generated.days[2]!.activities.find((a) => a.kind === "visit")!;
    const lockedDays = generated.days.map((d) => ({
      ...d,
      activities: d.activities.map((a) =>
        a.id === target.id ? { ...a, locked: true, startTime: "16:00" } : a,
      ),
    }));
    const again = await computeItinerary({ ...trip, days: lockedDays }, deps);
    const kept = again.days[2]!.activities.find((a) => a.id === target.id)!;
    expect(kept.startTime).toBe("16:00");
    expect(kept.locked).toBe(true);
    const others = again.days
      .flatMap((d) => d.activities)
      .filter((a) => a.place?.id === target.place!.id);
    expect(others).toHaveLength(1);
  });

  it("deriva el estado de entradas y los enlaces de la fuente (Prado: de pago, web oficial)", async () => {
    const { days } = await computeItinerary(trip, deps);
    const prado = days.flatMap((d) => d.activities).find((a) => a.title === "Museo del Prado")!;
    expect(prado.bookingRequirement).toBe("ticket_required");
    expect(prado.bookingLinks[0]).toMatchObject({ kind: "official", isGeneralWebsite: true });
  });

  it("al regenerar, lo reservado sigue en su día y la anotación sigue al lugar", async () => {
    const generated = await computeItinerary(trip, deps);
    const visits = generated.days[2]!.activities.filter((a) => a.kind === "visit");
    const [bought, noted] = [visits[0]!, visits[1]!];
    const days = generated.days.map((d) => ({
      ...d,
      activities: d.activities.map((a) =>
        a.id === bought.id
          ? {
              ...a,
              bookingStatus: "ticket_purchased" as const,
              bookingNote: "Localizador 123",
              paidPrice: { amount: 30, currency: "EUR" },
            }
          : a.id === noted.id
            ? { ...a, bookingStatus: "cancelled" as const, bookingNote: "No abre" }
            : a,
      ),
    }));
    const again = await computeItinerary({ ...trip, days }, deps);
    const all = again.days.flatMap((d) => d.activities);
    const kept = again.days[2]!.activities.find((a) => a.place?.id === bought.place!.id)!;
    expect(kept).toMatchObject({
      bookingStatus: "ticket_purchased",
      bookingNote: "Localizador 123",
      paidPrice: { amount: 30, currency: "EUR" },
    });
    const other = all.find((a) => a.place?.id === noted.place!.id);
    if (other) expect(other).toMatchObject({ bookingStatus: "cancelled", bookingNote: "No abre" });
  });
});
