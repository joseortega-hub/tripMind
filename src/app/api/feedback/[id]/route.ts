import { FeedbackStatusUpdateSchema } from "@/domain/feedback";
import { invalidRequest } from "@/server/api/responses";
import { isFeedbackAdmin, setFeedbackStatus } from "@/server/services/feedback";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const error = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

/** PATCH /api/feedback/[id] `{ status }` — protegido con `x-feedback-key`. */
export async function PATCH(request: Request, { params }: Context) {
  if (!isFeedbackAdmin(request))
    return error(401, "unauthorized", "Hace falta la clave del buzón (cabecera x-feedback-key).");
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "invalid_request", "El cuerpo debe ser JSON");
  }
  const parsed = FeedbackStatusUpdateSchema.safeParse(body);
  if (!parsed.success) return invalidRequest(parsed.error);
  if (!/^[a-z0-9]{20,40}$/.test(id) || !(await setFeedbackStatus(id, parsed.data.status)))
    return error(404, "not_found", "Ese comentario no existe.");
  return Response.json({ id, status: parsed.data.status });
}
