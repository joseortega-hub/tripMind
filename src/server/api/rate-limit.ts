/**
 * Límite de frecuencia sencillo en memoria (ventana fija por clave). En Vercel cada instancia
 * lleva su cuenta: frena abusos puntuales, no ataques distribuidos.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** true si la petición entra; false si la clave ya agotó su cupo en esta ventana. */
    take(key: string, now = Date.now()) {
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= limit;
    },
    reset: () => hits.clear(),
  };
}

/** IP del cliente según el proxy (Vercel pone `x-forwarded-for`). */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Buzón (`POST /api/feedback`): 10 envíos cada 10 minutos por IP. */
export const feedbackLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });
