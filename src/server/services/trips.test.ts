// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hotel as HotelRow, Trip as TripRow } from "@/generated/prisma/client";
import { buildTripInput, createEmptyDraft } from "@/domain/wizard";
import type { TripInput } from "@/domain/trip";
import { POST } from "@/app/api/trips/route";
import { createTrip, fromTripRow, toTripCreateData } from "./trips";

const create = vi.fn();
/** Simula la BD caída fuera de `vi.fn` (Vitest marca como fallo un mock que rechaza). */
let databaseDown = false;
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  prisma: {
    trip: {
      create: async (...args: unknown[]) => {
        if (databaseDown) throw new Error("P1001");
        return create(...args);
      },
    },
  },
}));

const source = { name: "Photon", retrievedAt: "2026-10-26T10:00:00.000Z" };

function input(withHotel: boolean): TripInput {
  const result = buildTripInput({
    ...createEmptyDraft(),
    title: "Escapada",
    destination: {
      id: "osm:relation/5326784",
      name: "Madrid",
      label: "Madrid, España",
      kind: "city",
      location: { lat: 40.4168, lng: -3.7035 },
      source,
      isDemo: true,
    },
    startDate: "2026-11-10",
    endDate: "2026-11-12",
    travelers: { adults: 2, children: 1 },
    hasHotel: withHotel,
    hotelPlace: withHotel
      ? {
          id: "osm:node/42",
          name: "Hotel Mediodía",
          category: "hotel",
          layer: "lodging",
          location: { lat: 40.4075, lng: -3.6915 },
          address: { street: "Plaza del Emperador Carlos V" },
          source: { ...source, name: "OpenStreetMap (Overpass API)" },
          isDemo: true,
        }
      : undefined,
    interests: { museums: 3 },
    budget: { currency: "EUR", total: 900, categories: { food: 200 } },
  });
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

/** Simula lo que devolvería Prisma tras guardar `toTripCreateData(input)`. */
function rowFrom(data: ReturnType<typeof toTripCreateData>): TripRow & { hotel: HotelRow | null } {
  const now = new Date("2026-10-26T12:00:00.000Z");
  const hotel = data.hotel?.create;
  return {
    id: "trip_1",
    title: data.title ?? null,
    destination: data.destination,
    destinationName: data.destinationName,
    startDate: data.startDate as Date,
    endDate: data.endDate as Date,
    adults: data.adults,
    children: data.children ?? 0,
    preferences: data.preferences,
    pace: data.pace,
    budget: data.budget,
    accommodationPreferences:
      (data.accommodationPreferences as TripRow["accommodationPreferences"]) ?? null,
    createdAt: now,
    updatedAt: now,
    hotel:
      hotel && !Array.isArray(hotel)
        ? ({
            id: "hotel_1",
            tripId: "trip_1",
            placeId: hotel.placeId ?? null,
            place: hotel.place ?? null,
            name: hotel.name,
            lat: hotel.lat,
            lng: hotel.lng,
            address: hotel.address ?? null,
            checkIn: hotel.checkIn as Date,
            checkOut: hotel.checkOut as Date,
            price: null,
            bookingStatus: hotel.bookingStatus ?? "pending",
            bookingUrl: null,
          } as HotelRow)
        : null,
  } as TripRow & { hotel: HotelRow | null };
}

describe("mapeo viaje ↔ Prisma", () => {
  it("guarda fechas como Date UTC y el nombre del destino aparte", () => {
    const data = toTripCreateData(input(false));
    expect(data.startDate).toEqual(new Date("2026-11-10T00:00:00.000Z"));
    expect(data.destinationName).toBe("Madrid");
    expect(data.hotel).toBeUndefined();
    expect(data.accommodationPreferences).toMatchObject({ rooms: 1 });
  });

  it("ida y vuelta sin pérdida (sin hotel y con hotel)", () => {
    for (const withHotel of [false, true]) {
      const original = input(withHotel);
      const trip = fromTripRow(rowFrom(toTripCreateData(original)));
      expect(trip).toMatchObject({
        id: "trip_1",
        title: original.title,
        destination: original.destination,
        startDate: "2026-11-10",
        endDate: "2026-11-12",
        travelers: { adults: 2, children: 1 },
        preferences: original.preferences,
        pace: original.pace,
        budget: original.budget,
        days: [],
      });
      if (withHotel) {
        expect(trip.hotel).toMatchObject({
          id: "hotel_1",
          name: "Hotel Mediodía",
          checkIn: "2026-11-10",
          place: { id: "osm:node/42", isDemo: true },
        });
        expect(trip.accommodationPreferences).toBeUndefined();
      } else {
        expect(trip.hotel).toBeUndefined();
      }
    }
  });

  it("rechaza JSON guardado que no cumple el dominio", () => {
    const row = rowFrom(toTripCreateData(input(false)));
    expect(() => fromTripRow({ ...row, destination: { name: "sin fuente" } })).toThrow();
  });
});

describe("POST /api/trips", () => {
  beforeEach(() => {
    create.mockReset();
    databaseDown = false;
  });

  const post = async (body: unknown) => {
    const response = await POST(
      new Request("http://localhost/api/trips", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await response.json() };
  };

  it("crea el viaje y devuelve su id", async () => {
    create.mockResolvedValue({ id: "trip_9" });
    const { status, body } = await post(input(true));
    expect(status).toBe(201);
    expect(body).toEqual({ id: "trip_9" });
    expect(create).toHaveBeenCalledOnce();
  });

  it("400 si los datos no son válidos o no es JSON", async () => {
    expect((await post({ ...input(false), destination: undefined })).status).toBe(400);
    expect((await post("{no json")).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("503 si la base de datos falla", async () => {
    databaseDown = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await post(input(false));
    expect(status).toBe(503);
    expect(body.error.code).toBe("storage_unavailable");
  });

  it("createTrip solo pide el id", async () => {
    create.mockResolvedValue({ id: "trip_2" });
    await createTrip(input(false));
    expect(create.mock.calls[0]?.[0]).toMatchObject({ select: { id: true } });
  });
});
