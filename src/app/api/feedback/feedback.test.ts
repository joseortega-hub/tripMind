// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedbackLimiter } from "@/server/api/rate-limit";

const db = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "cmh1abcdefghijklmnopqrst", createdAt: new Date() })),
  findMany: vi.fn(async () => [
    {
      id: "cmh1abcdefghijklmnopqrst",
      status: "new",
      images: [{ type: "image/webp", data: "QUJD" }],
    },
  ]),
  updateMany: vi.fn(async () => ({ count: 1 })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ prisma: { feedback: db } }));

const { GET, POST } = await import("./route");
const { PATCH } = await import("./[id]/route");

const KEY = "clave-de-prueba-larga-123";
const ID = "cmh1abcdefghijklmnopqrst";
const body = { kind: "idea", message: "Poder exportar a PDF", path: "/trips/new" };
type Headers = Record<string, string>;

const post = (payload: unknown, headers: Headers = {}) =>
  POST(
    new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
const list = (headers: Headers = {}, query = "") =>
  GET(new Request(`http://localhost/api/feedback${query}`, { headers }));
const patch = (headers: Headers, payload: unknown = { status: "done" }) =>
  PATCH(
    new Request(`http://localhost/api/feedback/${ID}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ id: ID }) },
  );

beforeEach(() => {
  feedbackLimiter.reset();
  vi.stubEnv("FEEDBACK_ADMIN_KEY", KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/feedback", () => {
  it("guarda un comentario válido y responde 201", async () => {
    const response = await post({ ...body, context: { viewport: "412x915", mode: "claro" } });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: ID });
    expect(db.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "idea", path: "/trips/new", tripId: null }),
      }),
    );
  });

  it("valida con Zod (400) y rechaza JSON roto", async () => {
    const invalid = await post({ ...body, message: "a" });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.issues).toHaveProperty("message");
    expect((await post("{no-json")).status).toBe(400);
  });

  it("rechaza cuerpos de más de 1 MB (413)", async () => {
    expect((await post({ ...body, message: "x".repeat(1_000_100) })).status).toBe(413);
    expect((await post(body, { "content-length": "5000000" })).status).toBe(413);
    expect(db.create).not.toHaveBeenCalled();
  });

  it("limita la frecuencia por IP (429)", async () => {
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 10; i++) expect((await post(body, ip)).status).toBe(201);
    expect((await post(body, ip)).status).toBe(429);
    expect((await post(body, { "x-forwarded-for": "203.0.113.8" })).status).toBe(201);
  });

  it("si la BD falla responde 503 con el formato de error", async () => {
    db.create.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post(body);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("storage_unavailable");
  });
});

describe("lectura protegida del buzón", () => {
  it("GET sin clave, con clave errónea o sin la variable: 401", async () => {
    expect((await list()).status).toBe(401);
    expect((await list({ "x-feedback-key": "otra-clave-cualquiera-12" })).status).toBe(401);
    vi.stubEnv("FEEDBACK_ADMIN_KEY", "");
    expect((await list({ "x-feedback-key": KEY })).status).toBe(401);
    vi.stubEnv("FEEDBACK_ADMIN_KEY", "corta");
    expect((await list({ "x-feedback-key": "corta" })).status).toBe(401);
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it("GET con clave lista sin imágenes y filtra por estado", async () => {
    const response = await list({ "x-feedback-key": KEY }, "?status=new");
    expect(response.status).toBe(200);
    const { items } = await response.json();
    expect(items[0]).toMatchObject({ imageCount: 1 });
    expect(items[0]).not.toHaveProperty("images");
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["new"] } } }),
    );
    expect((await list({ "x-feedback-key": KEY }, "?status=todo")).status).toBe(400);
  });

  it("PATCH exige la clave, valida el estado y avisa si no existe", async () => {
    expect((await patch({})).status).toBe(401);
    expect((await patch({ "x-feedback-key": KEY }, { status: "borrado" })).status).toBe(400);
    const ok = await patch({ "x-feedback-key": KEY });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: ID, status: "done" });
    db.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await patch({ "x-feedback-key": KEY })).status).toBe(404);
  });
});
