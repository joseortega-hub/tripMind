// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/trips/[id]/favorites/route";
import type { Place } from "@/domain/place";

const TRIP_ID = "cmh7x0abc0000qwerty123456";
const source = { name: "OpenStreetMap (Overpass API)", retrievedAt: "2026-10-26T21:33:43.876Z" };
const prado: Place = {
  id: "osm:way/28224440",
  name: "Museo del Prado",
  category: "museum",
  layer: "tourism",
  location: { lat: 40.4138, lng: -3.6921 },
  source,
  isDemo: true,
};

const upsert = vi.fn();
const deleteMany = vi.fn();
let rows: { place: unknown }[] | null = [];
/** Simula la BD caída fuera de `vi.fn` (Vitest marca como fallo un mock que rechaza). */
let databaseDown = false;
const guard = () => {
  if (databaseDown) throw new Error("P1001");
};

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  prisma: {
    trip: {
      findUnique: async () => {
        guard();
        return rows ? { favorites: rows } : null;
      },
      count: async () => {
        guard();
        return rows ? 1 : 0;
      },
    },
    favorite: {
      upsert: async (...args: unknown[]) => {
        guard();
        return upsert(...args);
      },
      deleteMany: async (...args: unknown[]) => {
        guard();
        return deleteMany(...args);
      },
    },
  },
}));

const url = (query = "") => `http://localhost/api/trips/${TRIP_ID}/favorites${query}`;
const context = (id = TRIP_ID) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  POST(new Request(url(), { method: "POST", body: JSON.stringify(body) }), context());

beforeEach(() => {
  rows = [];
  databaseDown = false;
  upsert.mockReset();
  deleteMany.mockReset();
});

describe("API de favoritos", () => {
  it("lista los guardados e ignora snapshots inválidos", async () => {
    rows = [{ place: prado }, { place: { id: "roto" } }];
    const response = await GET(new Request(url()), context());
    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([prado]);
  });

  it("responde 404 si el viaje no existe o el id no es válido", async () => {
    rows = null;
    expect((await GET(new Request(url()), context())).status).toBe(404);
    expect((await GET(new Request(url()), context("../etc"))).status).toBe(404);
    expect((await post({ place: prado })).status).toBe(404);
  });

  it("guarda el snapshot del lugar con su fuente", async () => {
    const response = await post({ place: prado });
    expect(response.status).toBe(201);
    expect(upsert).toHaveBeenCalledWith({
      where: { tripId_placeId: { tripId: TRIP_ID, placeId: prado.id } },
      create: { tripId: TRIP_ID, placeId: prado.id, place: prado },
      update: { place: prado },
    });
  });

  it("rechaza lugares sin fuente", async () => {
    expect((await post({ place: { ...prado, source: undefined } })).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("borra por placeId en la query", async () => {
    const response = await DELETE(
      new Request(url(`?placeId=${encodeURIComponent(prado.id)}`), { method: "DELETE" }),
      context(),
    );
    expect(response.status).toBe(204);
    expect(deleteMany).toHaveBeenCalledWith({ where: { tripId: TRIP_ID, placeId: prado.id } });
  });

  it("indica 503 si la BD falla", async () => {
    databaseDown = true;
    expect((await GET(new Request(url()), context())).status).toBe(503);
    expect((await post({ place: prado })).status).toBe(503);
  });
});
