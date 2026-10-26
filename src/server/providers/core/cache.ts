import { createHash } from "node:crypto";
import type { z } from "zod";

/** Almacén clave → JSON con caducidad. En producción, tabla `ProviderCache` de Postgres. */
export interface CacheStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, provider: string, value: unknown, ttlMs: number): Promise<void>;
}

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, _provider: string, value: unknown, ttlMs: number) {
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }
}

/** Subconjunto del cliente Prisma que usa la caché (facilita los tests). */
export interface ProviderCacheDelegate {
  findUnique(args: { where: { key: string } }): Promise<{ value: unknown; expiresAt: Date } | null>;
  upsert(args: {
    where: { key: string };
    create: { key: string; provider: string; value: never; expiresAt: Date };
    update: { provider: string; value: never; expiresAt: Date; createdAt: Date };
  }): Promise<unknown>;
  deleteMany(args: { where: { key: string } | { expiresAt: { lt: Date } } }): Promise<unknown>;
}

export class PrismaCacheStore implements CacheStore {
  constructor(
    private readonly table: ProviderCacheDelegate,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string) {
    const row = await this.table.findUnique({ where: { key } });
    if (!row) return undefined;
    if (row.expiresAt.getTime() <= this.now()) {
      await this.table.deleteMany({ where: { key } });
      return undefined;
    }
    return row.value;
  }

  async set(key: string, provider: string, value: unknown, ttlMs: number) {
    const expiresAt = new Date(this.now() + ttlMs);
    // El valor ya es JSON serializable (resultado validado por Zod).
    const json = value as never;
    await this.table.upsert({
      where: { key },
      create: { key, provider, value: json, expiresAt },
      update: { provider, value: json, expiresAt, createdAt: new Date(this.now()) },
    });
  }
}

/** Clave de caché estable: prefijo legible + hash de las partes. */
export function cacheKey(provider: string, ...parts: unknown[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
  return `${provider}:${hash}`;
}

export interface CachedOptions<T> {
  key: string;
  provider: string;
  ttlMs: number;
  /** Se valida lo leído de caché; si no encaja (cambio de esquema), se vuelve a pedir. */
  schema: z.ZodType<T>;
  onError?: (error: unknown) => void;
}

/**
 * Devuelve el valor en caché o ejecuta `load` y lo guarda. Un fallo de la caché (p. ej. BD caída)
 * nunca rompe la petición: se registra y se llama al proveedor directamente.
 */
export async function cached<T>(
  store: CacheStore,
  options: CachedOptions<T>,
  load: () => Promise<T>,
): Promise<{ value: T; fromCache: boolean }> {
  const report = options.onError ?? ((error) => console.warn("[cache]", error));
  try {
    const hit = await store.get(options.key);
    if (hit !== undefined) {
      const parsed = options.schema.safeParse(hit);
      if (parsed.success) return { value: parsed.data, fromCache: true };
    }
  } catch (error) {
    report(error);
  }

  const value = await load();
  try {
    await store.set(options.key, options.provider, value, options.ttlMs);
  } catch (error) {
    report(error);
  }
  return { value, fromCache: false };
}
