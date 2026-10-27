import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { FeedbackStatus } from "@/domain/feedback";
import { FeedbackInputSchema } from "@/domain/feedback";
import type { z } from "zod";
import { prisma } from "@/server/db";

type FeedbackData = z.output<typeof FeedbackInputSchema>;

/** Guarda lo que llega del buzón de la app. */
export async function createFeedback(input: FeedbackData) {
  return prisma.feedback.create({
    data: {
      kind: input.kind,
      message: input.message,
      path: input.path,
      tripId: input.tripId ?? null,
      context: input.context,
      images: input.images,
    },
    select: { id: true, createdAt: true },
  });
}

/** Lista sin imágenes (pesan): solo cuántas hay. */
export async function listFeedback(statuses: FeedbackStatus[]) {
  const rows = await prisma.feedback.findMany({
    where: { status: { in: statuses } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(({ images, ...row }) => ({
    ...row,
    imageCount: Array.isArray(images) ? images.length : 0,
  }));
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus) {
  const result = await prisma.feedback.updateMany({ where: { id }, data: { status } });
  return result.count > 0;
}

/**
 * Autoriza la lectura del buzón: cabecera `x-feedback-key` igual a `FEEDBACK_ADMIN_KEY`.
 * Sin la variable (o con menos de 16 caracteres) el acceso está cerrado.
 */
export function isFeedbackAdmin(request: Request, adminKey = process.env.FEEDBACK_ADMIN_KEY) {
  const expected = adminKey?.trim();
  const given = request.headers.get("x-feedback-key")?.trim();
  if (!expected || expected.length < 16 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
