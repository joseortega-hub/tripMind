import {
  FEEDBACK_MAX_BODY_BYTES,
  FeedbackInputSchema,
  FeedbackStatusSchema,
  type FeedbackStatus,
} from "@/domain/feedback";
import { clientIp, feedbackLimiter } from "@/server/api/rate-limit";
import { invalidRequest } from "@/server/api/responses";
import { createFeedback, isFeedbackAdmin, listFeedback } from "@/server/services/feedback";

export const runtime = "nodejs";

const error = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

const unauthorized = () =>
  error(401, "unauthorized", "Hace falta la clave del buzón (cabecera x-feedback-key).");

/**
 * POST /api/feedback `{ kind, message, path, tripId?, context?, images? }` — público.
 * Cuerpo ≤ 1 MB y límite de frecuencia por IP. Responde `{ id }`.
 */
export async function POST(request: Request) {
  if (!feedbackLimiter.take(clientIp(request))) {
    return error(
      429,
      "rate_limited",
      "Has enviado muchos comentarios seguidos. Espera unos minutos y vuelve a probar.",
    );
  }
  const tooLarge = () =>
    error(413, "payload_too_large", "El envío ocupa demasiado. Quita alguna imagen.");
  if (Number(request.headers.get("content-length") ?? 0) > FEEDBACK_MAX_BODY_BYTES)
    return tooLarge();
  const raw = await request.text();
  if (Buffer.byteLength(raw) > FEEDBACK_MAX_BODY_BYTES) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "invalid_request", "El cuerpo debe ser JSON");
  }
  const parsed = FeedbackInputSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);

  try {
    const row = await createFeedback(parsed.data);
    return Response.json({ id: row.id }, { status: 201 });
  } catch (cause) {
    console.error("[api] no se pudo guardar el comentario:", cause);
    return error(
      503,
      "storage_unavailable",
      "No se ha podido guardar ahora mismo. Inténtalo de nuevo en unos segundos.",
    );
  }
}

/** GET /api/feedback?status=new,read — protegido con `x-feedback-key`. Sin imágenes. */
export async function GET(request: Request) {
  if (!isFeedbackAdmin(request)) return unauthorized();
  const param = new URL(request.url).searchParams.get("status");
  const statuses: FeedbackStatus[] = [];
  for (const value of (param ?? "new,read").split(",")) {
    const status = FeedbackStatusSchema.safeParse(value.trim());
    if (!status.success) return error(400, "invalid_request", `Estado no válido: ${value}`);
    statuses.push(status.data);
  }
  return Response.json({ items: await listFeedback(statuses) });
}
