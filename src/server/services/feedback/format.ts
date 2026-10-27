import type { FeedbackImage } from "@/domain/feedback";

/** Fila del buzón tal como la lee el comando `pnpm feedback` (sin depender de Prisma). */
export interface FeedbackRow {
  id: string;
  kind: string;
  message: string;
  path: string;
  tripId: string | null;
  context: Record<string, unknown>;
  images: FeedbackImage[];
  status: string;
  createdAt: Date;
}

const EXT: Record<FeedbackImage["type"], string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
};
const KIND: Record<string, string> = { error: "Error", idea: "Idea", mejora: "Mejora" };

/** Carpeta de cada comentario: fecha UTC y el principio del id ("2026-10-27_1830_cmh1a2b3"). */
export function folderName(row: Pick<FeedbackRow, "id" | "createdAt">) {
  const d = row.createdAt.toISOString();
  return `${d.slice(0, 10)}_${d.slice(11, 13)}${d.slice(14, 16)}_${row.id.slice(0, 8)}`;
}

/** Nombre de archivo de cada imagen ("1.jpg", "2.webp"…). */
export const imageFileName = (image: FeedbackImage, index: number) =>
  `${index + 1}.${EXT[image.type] ?? "bin"}`;

/** Bloque en Markdown de un comentario, con las rutas de sus imágenes ya guardadas. */
export function formatFeedback(row: FeedbackRow, imagePaths: string[]) {
  const context = Object.entries(row.context)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
  return [
    `## ${KIND[row.kind] ?? row.kind}${row.status === "new" ? " · NUEVO" : ""}${row.status === "done" ? " · HECHO" : ""} · ${row.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    `- id: ${row.id}`,
    `- pantalla: ${row.path}${row.tripId ? ` · viaje: ${row.tripId}` : ""}`,
    context ? `- contexto: ${context}` : null,
    "",
    row.message,
    ...(imagePaths.length ? ["", ...imagePaths.map((p) => `- imagen: ${p}`)] : []),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Resumen completo (`pendientes.md`). */
export function formatInbox(blocks: string[], prod: boolean) {
  const where = prod ? "producción" : "local";
  return `# Buzón de TripMind (${where}): ${blocks.length} pendientes\n\n${blocks.join("\n\n---\n\n")}\n`;
}

/** Argumentos del comando: `[--prod] [--done <id o prefijo>] [--keep-new] [--all]`. */
export function parseFeedbackArgs(args: string[]) {
  const doneIndex = args.indexOf("--done");
  const done = doneIndex >= 0 ? args[doneIndex + 1] : undefined;
  if (doneIndex >= 0 && (!done || !/^[a-z0-9]{4,40}$/i.test(done)))
    throw new Error("Uso: pnpm feedback --done <id o principio del id (4+ caracteres)>");
  return {
    prod: args.includes("--prod"),
    done: done?.toLowerCase(),
    keepNew: args.includes("--keep-new"),
    all: args.includes("--all"),
  };
}
