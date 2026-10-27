/**
 * Buzón de ideas, mejoras y errores desde el PC (Fase 8b).
 *
 * Uso: pnpm feedback [--prod] [--done <id o principio del id>] [--keep-new] [--all]
 * - Lista los pendientes (nuevos y leídos, no hechos) en Markdown y guarda sus imágenes en
 *   data/privado/buzon/<fecha>_<id>/ (ignorado por Git), más el resumen en pendientes.md.
 * - Los nuevos pasan a «leído» al listarlos (salvo --keep-new). --all incluye los hechos.
 * - --done <id> marca un comentario como hecho.
 * Lee la BD directamente: DATABASE_URL, o PROD_DATABASE_URL (Neon) con --prod.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  folderName,
  formatFeedback,
  formatInbox,
  imageFileName,
  parseFeedbackArgs,
  type FeedbackRow,
} from "../src/server/services/feedback/format";

let args: ReturnType<typeof parseFeedbackArgs>;
try {
  args = parseFeedbackArgs(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
const url = (args.prod ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL)?.trim();
if (!url) {
  console.error(
    args.prod
      ? "Falta PROD_DATABASE_URL en el .env (cadena de conexión de Neon)."
      : "Falta DATABASE_URL en el .env.",
  );
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inbox = join(root, "data/privado/buzon");
/** Rutas con «/» también en Windows. */
const posix = (path: string) => path.split(sep).join("/");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const command = `pnpm feedback${args.prod ? " --prod" : ""}`;
console.log(args.prod ? "Buzón: producción (Neon)" : "Buzón: local");

try {
  if (args.done) {
    const matches = await prisma.feedback.findMany({
      where: { id: { startsWith: args.done } },
      select: { id: true },
    });
    if (matches.length === 0) console.log("No hay ningún comentario con ese id.");
    else if (matches.length > 1)
      console.log(
        `Ese principio coincide con ${matches.length} comentarios; usa más caracteres del id.`,
      );
    else {
      await prisma.feedback.update({ where: { id: matches[0]!.id }, data: { status: "done" } });
      console.log(`Hecho: ${matches[0]!.id}`);
    }
  } else {
    const rows = await prisma.feedback.findMany({
      where: { status: { in: args.all ? ["new", "read", "done"] : ["new", "read"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    if (!rows.length) console.log("No hay comentarios pendientes.");
    const blocks: string[] = [];
    for (const row of rows) {
      const feedback = row as unknown as FeedbackRow;
      const images = Array.isArray(feedback.images) ? feedback.images : [];
      const dir = join(inbox, folderName(feedback));
      const paths = images.map((image, index) => {
        mkdirSync(dir, { recursive: true });
        const file = join(dir, imageFileName(image, index));
        writeFileSync(file, Buffer.from(image.data, "base64"));
        return posix(relative(root, file));
      });
      blocks.push(formatFeedback({ ...feedback, images }, paths));
    }
    if (rows.length) {
      const summary = formatInbox(blocks, args.prod);
      mkdirSync(inbox, { recursive: true });
      writeFileSync(join(inbox, "pendientes.md"), summary);
      console.log(`\n${summary}`);
      console.log(`Resumen e imágenes en ${posix(relative(root, inbox))}/`);
      const fresh = rows.filter((row) => row.status === "new").map((row) => row.id);
      if (fresh.length && !args.keepNew) {
        await prisma.feedback.updateMany({
          where: { id: { in: fresh }, status: "new" },
          data: { status: "read" },
        });
        console.log(
          `${fresh.length} nuevos marcados como leídos. Al resolver uno: ${command} --done <id>`,
        );
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
