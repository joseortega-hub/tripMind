import { describe, expect, it } from "vitest";
import type { TripCalendar } from "@/domain/calendar";
import type { Place } from "@/domain/place";
import type { ItineraryDay } from "@/domain/trip";
import {
  applyNoticeFilters,
  DEFAULT_NOTICE_FILTERS,
  noticeSources,
  readStoredFilters,
} from "./filters";
import { buildNotices, locatedNotices } from "./notices";
import { dstChanges, formatHours, zoneDifference } from "./time";

describe("cambio de hora (IANA)", () => {
  it("encuentra el día y la hora exactos en Madrid (otoño y primavera)", () => {
    expect(dstChanges("Europe/Madrid", "2026-10-23", "2026-10-28")).toEqual([
      {
        date: "2026-10-25",
        timeZone: "Europe/Madrid",
        from: "03:00",
        to: "02:00",
        direction: "back",
        offsetBefore: "+02:00",
        offsetAfter: "+01:00",
      },
    ]);
    const spring = dstChanges("Europe/Madrid", "2026-03-27", "2026-03-30");
    expect(spring).toHaveLength(1);
    expect(spring[0]).toMatchObject({ date: "2026-03-29", from: "02:00", to: "03:00" });
    expect(spring[0]!.direction).toBe("forward");
  });

  it("no avisa si no hay cambio o la zona no tiene horario de verano", () => {
    expect(dstChanges("Europe/Madrid", "2026-11-01", "2026-11-10")).toEqual([]);
    expect(dstChanges("Asia/Tokyo", "2026-03-01", "2026-11-30")).toEqual([]);
  });

  it("calcula la diferencia con la zona del usuario, que puede cambiar en el viaje", () => {
    expect(zoneDifference("Europe/Madrid", "Europe/London", "2026-10-28")).toBe(60);
    // Nueva York cambia el 1-11-2026, una semana después que Europa.
    expect(zoneDifference("Europe/Madrid", "America/New_York", "2026-10-28")).toBe(300);
    expect(zoneDifference("Europe/Madrid", "America/New_York", "2026-11-02")).toBe(360);
    expect(formatHours(330)).toBe("5 h 30 min");
  });
});

const source = { name: "Fuente", retrievedAt: "2026-10-27T10:00:00.000Z" };
const place = (id: string, category: Place["category"], lat = 40.41, lng = -3.69): Place => ({
  id,
  name: `Lugar ${id}`,
  category,
  layer: "tourism",
  location: { lat, lng },
  source,
  isDemo: true,
});

const calendar: TripCalendar = {
  retrievedAt: "2026-10-27T10:00:00.000Z",
  timeZone: "Europe/Madrid",
  holidays: [
    {
      date: "2026-11-01",
      name: "All Saints Day",
      localName: "Día de todos los Santos",
      regions: [],
      appliesToDestination: "yes",
      types: ["Public"],
      source: { ...source, name: "Nager.Date" },
      isDemo: true,
    },
  ],
  holidaysStatus: { status: "ok", providerName: "Nager.Date", isDemo: true },
  dst: dstChanges("Europe/Madrid", "2026-10-25", "2026-11-02"),
  events: [
    {
      id: "ticketmaster:1",
      name: "Concierto",
      date: "2026-10-31",
      url: "https://www.ticketmaster.es/event/1",
      venue: { name: "Sala", location: { lat: 40.4101, lng: -3.6901 } },
      source: { ...source, name: "Ticketmaster Discovery API" },
      isDemo: false,
    },
  ],
  eventsStatus: { status: "ok", providerName: "Ticketmaster", isDemo: false },
  forecast: [
    {
      date: "2026-10-31",
      precipitationProbability: 80,
      precipitationMm: 6,
      source: { ...source, name: "Open-Meteo" },
      isDemo: true,
    },
    { date: "2026-11-02", precipitationProbability: 10, source, isDemo: true },
  ],
  weatherStatus: { status: "ok", providerName: "Open-Meteo", isDemo: true },
};

const day = (date: string, activities: ItineraryDay["activities"]): ItineraryDay => ({
  id: date,
  date,
  isRestDay: false,
  activities,
  legs: [],
});
const visit = (id: string, p: Place, extra: Partial<ItineraryDay["activities"][number]> = {}) => ({
  id,
  kind: "visit" as const,
  title: p.name,
  place: p,
  startTime: "10:00",
  durationMinutes: 60,
  locked: false,
  bookingRequirement: "unverified" as const,
  bookingLinks: [],
  ...extra,
});

const days = [
  day("2026-10-25", [visit("a", place("p1", "museum"))]),
  day("2026-10-31", [visit("b", place("p2", "park"))]),
  day("2026-11-01", [
    visit("c", place("p3", "museum"), {
      planning: {
        slot: "morning",
        durationEstimated: true,
        openingStatus: "uncertain",
        warnings: [],
      },
    }),
    visit("d", place("p4", "gallery"), {
      bookingStatus: "booked",
      planning: { slot: "afternoon", durationEstimated: true, openingStatus: "open", warnings: [] },
    }),
  ]),
  day("2026-11-02", [
    visit("e", place("p5", "museum"), {
      planning: {
        slot: "morning",
        durationEstimated: true,
        openingStatus: "closed",
        warnings: ["closed_at_time"],
      },
    }),
  ]),
];

describe("avisos del viaje", () => {
  const notices = buildNotices(calendar, days);
  const byKind = (kind: string) => notices.filter((n) => n.kind === kind);

  it("genera un aviso por tipo con fuente y si afecta al itinerario", () => {
    expect(byKind("holiday")[0]).toMatchObject({
      date: "2026-11-01",
      title: "Festivo: Día de todos los Santos",
      affectsItinerary: true,
    });
    expect(byKind("dst")[0]!.title).toBe("Cambio de hora: a las 03:00 se atrasan a las 02:00");
    expect(byKind("event")[0]).toMatchObject({ impact: "opportunity", affectsItinerary: true });
    // Solo los días con mal tiempo; afecta porque hay un parque ese día.
    expect(byKind("weather")).toHaveLength(1);
    expect(byKind("weather")[0]).toMatchObject({ date: "2026-10-31", affectsItinerary: true });
    expect(byKind("closure").map((n) => n.title)).toEqual([
      "Horario de festivo sin confirmar: Lugar p3",
      "Cerrado a esa hora: Lugar p5",
    ]);
    expect(byKind("booking")[0]!.title).toBe("Reserva anotada: Lugar p4 a las 10:00");
    expect(byKind("transport")).toEqual([]);
    for (const notice of notices) expect(notice.source.name).toBeTruthy();
  });

  it("filtra igual para calendario, lista y mapa", () => {
    expect(applyNoticeFilters(notices, DEFAULT_NOTICE_FILTERS)).toHaveLength(notices.length);
    const filters = { ...DEFAULT_NOTICE_FILTERS, kinds: ["holiday" as const, "event" as const] };
    expect(applyNoticeFilters(notices, filters).map((n) => n.kind)).toEqual(["event", "holiday"]);
    expect(
      applyNoticeFilters(notices, { ...DEFAULT_NOTICE_FILTERS, impact: "opportunity" }),
    ).toHaveLength(1);
    expect(
      applyNoticeFilters(notices, { ...DEFAULT_NOTICE_FILTERS, date: "2026-11-02" }).map(
        (n) => n.kind,
      ),
    ).toEqual(["closure"]);
    expect(
      applyNoticeFilters(notices, { ...DEFAULT_NOTICE_FILTERS, source: "Nager.Date" }),
    ).toHaveLength(1);
    expect(noticeSources(notices)).toContain("Open-Meteo");
    // Con ubicación: evento, cierres y reserva (los que pinta el mapa).
    expect(
      locatedNotices(notices)
        .map((n) => n.kind)
        .sort(),
    ).toEqual(["booking", "closure", "closure", "event"]);
  });

  it("solo lo que afecta al itinerario", () => {
    const empty = buildNotices(calendar, []);
    expect(applyNoticeFilters(empty, { ...DEFAULT_NOTICE_FILTERS, onlyItinerary: true })).toEqual(
      [],
    );
  });

  it("los filtros guardados ilegibles vuelven a los de por defecto", () => {
    expect(readStoredFilters("{")).toEqual(DEFAULT_NOTICE_FILTERS);
    expect(readStoredFilters(JSON.stringify({ kinds: ["zzz"] }))).toEqual(DEFAULT_NOTICE_FILTERS);
    expect(readStoredFilters(JSON.stringify({ kinds: ["holiday"], onlyItinerary: true }))).toEqual({
      ...DEFAULT_NOTICE_FILTERS,
      kinds: ["holiday"],
      onlyItinerary: true,
    });
  });
});
