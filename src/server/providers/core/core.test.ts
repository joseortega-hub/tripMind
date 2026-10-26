import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  cached,
  cacheKey,
  MemoryCacheStore,
  PrismaCacheStore,
  type ProviderCacheDelegate,
} from "./cache";
import { fetchJson, userAgent } from "./http";
import { RateLimiter } from "./rate-limit";
import { selectProvider } from "./registry";
import { ProviderError } from "./types";

describe("RateLimiter", () => {
  it("espacia el inicio de las llamadas al menos el intervalo", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      1000,
      () => clock,
      async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    );
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => limiter.schedule(async () => starts.push(clock))));
    expect(starts).toEqual([0, 1000, 2000]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("un fallo no bloquea la cola", async () => {
    const limiter = new RateLimiter(0);
    await expect(limiter.schedule(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(limiter.schedule(async () => "ok")).resolves.toBe("ok");
  });
});

describe("cached", () => {
  const schema = z.array(z.string());

  it("guarda y reutiliza respetando el TTL", async () => {
    let now = 0;
    const store = new MemoryCacheStore(() => now);
    const load = vi.fn(async () => ["a"]);
    const options = { key: "k", provider: "p", ttlMs: 1000, schema };

    expect(await cached(store, options, load)).toEqual({ value: ["a"], fromCache: false });
    expect(await cached(store, options, load)).toEqual({ value: ["a"], fromCache: true });
    now = 1000;
    expect((await cached(store, options, load)).fromCache).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("ignora entradas que ya no cumplen el esquema", async () => {
    const store = new MemoryCacheStore();
    await store.set("k", "p", { old: true }, 1000);
    const result = await cached(
      store,
      { key: "k", provider: "p", ttlMs: 1000, schema },
      async () => ["new"],
    );
    expect(result).toEqual({ value: ["new"], fromCache: false });
  });

  it("si la caché falla, llama al proveedor igualmente", async () => {
    const broken = {
      get: () => Promise.reject(new Error("bd caída")),
      set: () => Promise.reject(new Error("bd caída")),
    };
    const onError = vi.fn();
    const result = await cached(
      broken,
      { key: "k", provider: "p", ttlMs: 1, schema, onError },
      async () => ["x"],
    );
    expect(result.value).toEqual(["x"]);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("cacheKey es estable y distingue parámetros", () => {
    expect(cacheKey("photon", "madrid", 5)).toBe(cacheKey("photon", "madrid", 5));
    expect(cacheKey("photon", "madrid", 5)).not.toBe(cacheKey("photon", "madrid", 6));
    expect(cacheKey("photon", "x")).toMatch(/^photon:[0-9a-f]{32}$/);
  });
});

describe("PrismaCacheStore", () => {
  function fakeTable(row: { value: unknown; expiresAt: Date } | null) {
    return {
      findUnique: vi.fn(async () => row),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({})),
    } satisfies ProviderCacheDelegate;
  }

  it("devuelve filas vigentes y borra las caducadas", async () => {
    const fresh = fakeTable({ value: [1], expiresAt: new Date(2000) });
    expect(await new PrismaCacheStore(fresh, () => 1000).get("k")).toEqual([1]);

    const stale = fakeTable({ value: [1], expiresAt: new Date(500) });
    expect(await new PrismaCacheStore(stale, () => 1000).get("k")).toBeUndefined();
    expect(stale.deleteMany).toHaveBeenCalledWith({ where: { key: "k" } });
  });

  it("hace upsert con la caducidad calculada", async () => {
    const table = fakeTable(null);
    await new PrismaCacheStore(table, () => 1000).set("k", "photon", ["v"], 500);
    expect(table.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "k" },
        create: { key: "k", provider: "photon", value: ["v"], expiresAt: new Date(1500) },
      }),
    );
  });
});

describe("selectProvider", () => {
  const candidates = (missingConfig: string[] = []) => ({
    real: () => "real",
    demo: () => "demo",
    missingConfig,
  });

  it("modo demo siempre usa fixtures", () => {
    expect(selectProvider("demo", candidates())).toMatchObject({ provider: "demo", isDemo: true });
  });

  it("modo auto usa el real si está configurado", () => {
    expect(selectProvider("auto", candidates())).toEqual({ provider: "real", isDemo: false });
  });

  it("modo auto cae a demo e indica qué falta", () => {
    const selection = selectProvider("auto", candidates(["CONTACT_EMAIL"]));
    expect(selection).toMatchObject({ provider: "demo", isDemo: true });
    expect(selection.notice).toContain("CONTACT_EMAIL");
  });
});

describe("fetchJson", () => {
  it("envía User-Agent con contacto y cuerpo de formulario", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    await fetchJson("https://example.org/api", {
      providerId: "overpass",
      userAgent: userAgent("yo@example.org"),
      fetch: fetchMock,
      form: { data: "[out:json];" },
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("yo@example.org");
    expect(init.body).toBe("data=%5Bout%3Ajson%5D%3B");
  });

  it("convierte errores HTTP y de red en ProviderError", async () => {
    const opts = { providerId: "photon", userAgent: "t" };
    await expect(
      fetchJson("https://e.org", { ...opts, fetch: async () => new Response("", { status: 503 }) }),
    ).rejects.toMatchObject({ name: "ProviderError", options: { status: 503 } });
    await expect(
      fetchJson("https://e.org", { ...opts, fetch: () => Promise.reject(new TypeError("red")) }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
