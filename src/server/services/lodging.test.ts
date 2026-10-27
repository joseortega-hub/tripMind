import { describe, expect, it } from "vitest";
import { DEFAULT_LODGING_WEIGHTS, LodgingFiltersSchema } from "@/domain/lodging";
import type { Place } from "@/domain/place";
import { TripSchema, type Trip } from "@/domain/trip";
import { rankLodging } from "@/lib/lodging/score";
import { getLodgingPriceProvider } from "@/server/providers/lodging";
import { getPlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider } from "@/server/providers/routing";
import { DEMO_ROUTING_HOTEL } from "@/server/providers/routing/demo";
import { ProviderError } from "@/server/providers/core/types";
import { hasItinerary, hotelFromPlace } from "./hotel";
import { computeItinerary } from "./itinerary";
import { LodgingUnavailableError, matchesFilters, MAX_COMPARED, searchLodging } from "./lodging";

const source = { name: "OpenStreetMap", retrievedAt: "2026-10-26T21:33:43.876Z" };

const deps = {
  places: getPlacesProvider({ mode: "demo" }),
  routing: getRoutingProvider({ mode: "demo" }),
  prices: getLodgingPriceProvider(),
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
  endDate: "2026-10-30",
  travelers: { adults: 2 },
  preferences: { interests: { museums: 3, monuments_history: 2 } },
  pace: { level: "balanced", dayStart: "09:30", dayEnd: "20:00" },
  budget: {},
  createdAt: source.retrievedAt,
  updatedAt: source.retrievedAt,
});

const filters = (value: Partial<Parameters<typeof LodgingFiltersSchema.parse>[0]> = {}) =>
  LodgingFiltersSchema.parse(value);

async function demoLodging() {
  const response = await deps.places.provider.searchByBBox({
    bbox: [-3.7, 40.408, -3.688, 40.418],
    categories: ["hotel", "hostel", "apartment", "guest_house"],
    limit: 500,
  });
  return response.places;
}

describe("búsqueda de alojamientos (demo)", () => {
  it("devuelve alojamientos reales de OSM con tiempos a pie a lugares y estaciones, sin precio", async () => {
    const result = await searchLodging(baseTrip, filters(), deps);
    expect(result.found).toBeGreaterThan(50);
    expect(result.candidates.length).toBe(MAX_COMPARED);
    expect(result.keyPoints.basis).toBe("top_places");
    expect(result.keyPoints.points.length).toBeGreaterThan(0);
    expect(result.travel.quality).toBe("routed");
    expect(result.travel.isDemo).toBe(true);
    expect(result.pricing.configured).toBe(false);
    for (const candidate of result.candidates) {
      expect(candidate.place.layer).toBe("lodging");
      expect(candidate.place.source.name).toContain("OpenStreetMap");
      expect(candidate.pricing.status).toBe("not_configured");
      expect(candidate.keyPoints.every((p) => p.walkMinutes !== undefined)).toBe(true);
    }
    expect(result.candidates.some((c) => c.station?.walkMinutes !== undefined)).toBe(true);
  });

  it("aplica los filtros de tipo, estrellas y accesibilidad antes de comparar", async () => {
    const result = await searchLodging(baseTrip, filters({ types: ["hotel"], minStars: 4 }), deps);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.matching).toBe(result.candidates.length);
    for (const { place } of result.candidates) {
      expect(place.category).toBe("hotel");
      expect(place.stars).toBeGreaterThanOrEqual(4);
    }
    const accessible = await searchLodging(baseTrip, filters({ accessibleOnly: true }), deps);
    expect(accessible.candidates.every((c) => c.place.wheelchair === "yes")).toBe(true);
  });

  it("con itinerario compara con sus visitas e incluye siempre el hotel actual", async () => {
    const lodging = await demoLodging();
    const current = lodging.find((place) => place.id === DEMO_ROUTING_HOTEL.id)!;
    const trip = { ...baseTrip, hotel: hotelFromPlace(baseTrip, current) };
    const { days } = await computeItinerary(trip, deps);
    const result = await searchLodging({ ...trip, days }, filters({ types: ["apartment"] }), deps);
    expect(result.keyPoints.basis).toBe("itinerary");
    expect(result.candidates[0]?.isCurrent).toBe(true);
    expect(result.candidates.filter((c) => c.isCurrent)).toHaveLength(1);
    // El hotel actual (un hotel) aparece aunque el filtro pida apartamentos.
    expect(result.candidates.slice(1).every((c) => c.place.category === "apartment")).toBe(true);
  });

  it("ordena por ubicación con los tiempos reales de la demo", async () => {
    const result = await searchLodging(baseTrip, filters(), deps);
    const ranked = rankLodging(result.candidates, "location", {
      weights: DEFAULT_LODGING_WEIGHTS,
      stationRadiusMeters: result.stationRadiusMeters,
    });
    expect(ranked.proximity).toBe("walk");
    const means = ranked.items.map(
      (item) =>
        item.candidate.keyPoints.reduce((sum, p) => sum + (p.walkMinutes ?? 0), 0) /
        item.candidate.keyPoints.length,
    );
    expect([...means].sort((a, b) => a - b)).toEqual(means);
  });

  it("si OSM falla, error con la zona para ofrecer el mapa externo", async () => {
    const failing = {
      ...deps,
      places: {
        ...deps.places,
        provider: {
          ...deps.places.provider,
          searchByBBox: async () => {
            throw new ProviderError("Overpass caído", "overpass");
          },
        },
      },
    };
    await expect(searchLodging(baseTrip, filters(), failing)).rejects.toBeInstanceOf(
      LodgingUnavailableError,
    );
  });

  it("filtros estrictos", () => {
    const hostel = {
      id: "h",
      name: "H",
      category: "hostel",
      layer: "lodging",
      location: { lat: 0, lng: 0 },
      source,
      isDemo: true,
    } satisfies Place;
    expect(matchesFilters(hostel, filters({ types: ["hostel"] }))).toBe(true);
    expect(matchesFilters(hostel, filters({ types: ["hotel"] }))).toBe(false);
    expect(matchesFilters(hostel, filters({ minStars: 1 }))).toBe(false);
    expect(
      matchesFilters({ ...hostel, wheelchair: "limited" }, filters({ accessibleOnly: true })),
    ).toBe(false);
  });
});

describe("hotel como centro del viaje (recálculo)", () => {
  it("sin hotel se genera el plan y al elegir uno los días salen y vuelven a él", async () => {
    const withoutHotel = await computeItinerary(baseTrip, deps);
    const visits = withoutHotel.days.flatMap((d) => d.activities).filter((a) => a.place);
    expect(visits.length).toBeGreaterThan(0);
    expect(withoutHotel.days.every((d) => d.legs.every((l) => l.fromActivityId))).toBe(true);

    const lodging = await demoLodging();
    const chosen = lodging.find((place) => place.category === "hotel")!;
    const withHotel = await computeItinerary(
      { ...baseTrip, hotel: hotelFromPlace(baseTrip, chosen), days: withoutHotel.days },
      deps,
    );
    const day = withHotel.days.find((d) => d.legs.length > 0)!;
    expect(day.legs[0]!.from).toEqual(chosen.location);
    expect(day.legs.at(-1)!.to).toEqual(chosen.location);
  });

  it("cambiar de hotel recalcula los trayectos desde el nuevo y conserva lo bloqueado", async () => {
    const lodging = await demoLodging();
    const first = lodging.find((place) => place.id === DEMO_ROUTING_HOTEL.id)!;
    const other = lodging.find((place) => place.id !== first.id && place.category === "hotel")!;
    const trip = { ...baseTrip, hotel: hotelFromPlace(baseTrip, first) };
    const generated = await computeItinerary(trip, deps);
    expect(hasItinerary({ days: generated.days })).toBe(true);

    const target = generated.days[1]!.activities.find((a) => a.kind === "visit")!;
    const lockedDays = generated.days.map((day) => ({
      ...day,
      activities: day.activities.map((a) =>
        a.id === target.id ? { ...a, locked: true, startTime: "16:00" } : a,
      ),
    }));

    const moved = { ...trip, hotel: hotelFromPlace(trip, other), days: lockedDays };
    const again = await computeItinerary(moved, deps);
    const kept = again.days[1]!.activities.find((a) => a.id === target.id)!;
    expect(kept.locked).toBe(true);
    expect(kept.startTime).toBe("16:00");

    // El primer tramo de cada día sale del hotel nuevo, con tiempos reales grabados.
    const firstLeg = again.days[0]!.legs[0]!;
    expect(firstLeg.from).toEqual(other.location);
    expect(firstLeg.quality).toBe("routed");
    expect(again.meta?.travel.quality).toBe("routed");
  });

  it("el hotel elegido es un snapshot con fuente, las noches del viaje y sin reserva", () => {
    const place = {
      id: "osm:node/1",
      name: "Hotel",
      category: "hotel",
      layer: "lodging",
      location: { lat: 40.41, lng: -3.69 },
      source,
      isDemo: true,
    } satisfies Place;
    const hotel = hotelFromPlace(baseTrip, place);
    expect(hotel).toMatchObject({
      place,
      checkIn: "2026-10-28",
      checkOut: "2026-10-30",
      bookingStatus: "pending",
    });
    expect(hotel.price).toBeUndefined();
  });
});
