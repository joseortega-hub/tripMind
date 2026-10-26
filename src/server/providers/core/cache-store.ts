import { type CacheStore, MemoryCacheStore, PrismaCacheStore } from "./cache";

let store: CacheStore | undefined;

/**
 * Caché compartida por los proveedores: tabla `ProviderCache` si hay `DATABASE_URL`, memoria si no.
 * Prisma se importa de forma diferida para no abrir conexión hasta la primera consulta real.
 */
export function getCacheStore(): CacheStore {
  if (store) return store;
  if (!process.env.DATABASE_URL) {
    store = new MemoryCacheStore();
    return store;
  }
  let prismaStore: Promise<PrismaCacheStore> | undefined;
  const resolve = () =>
    (prismaStore ??= import("@/server/db").then(
      ({ prisma }) => new PrismaCacheStore(prisma.providerCache),
    ));
  store = {
    get: async (key) => (await resolve()).get(key),
    set: async (key, provider, value, ttlMs) => (await resolve()).set(key, provider, value, ttlMs),
  };
  return store;
}
