import { describe, expect, it } from "vitest";
import {
  FEEDBACK_MAX_IMAGE_CHARS,
  FEEDBACK_MAX_MESSAGE,
  FeedbackInputSchema,
  feedbackProblem,
} from "./feedback";

const image = (chars: number) => ({ type: "image/webp" as const, data: "A".repeat(chars) });
const base = { kind: "idea", message: "Una idea estupenda", path: "/" };

describe("FeedbackInputSchema", () => {
  it("acepta lo mínimo y rellena contexto e imágenes", () => {
    const parsed = FeedbackInputSchema.parse(base);
    expect(parsed).toMatchObject({ kind: "idea", context: {}, images: [] });
  });

  it("recorta el texto y exige 3–2000 caracteres", () => {
    expect(FeedbackInputSchema.parse({ ...base, message: "  hola  " }).message).toBe("hola");
    expect(FeedbackInputSchema.safeParse({ ...base, message: " ab " }).success).toBe(false);
    const long = "x".repeat(FEEDBACK_MAX_MESSAGE + 1);
    expect(FeedbackInputSchema.safeParse({ ...base, message: long }).success).toBe(false);
  });

  it.each([
    ["tipo desconocido", { kind: "queja" }],
    ["ruta sin barra", { path: "trips" }],
    ["viaje con formato raro", { tripId: "../etc" }],
    ["contexto con tipos erróneos", { context: { dpr: "dos" } }],
    ["más de 3 imágenes", { images: [image(8), image(8), image(8), image(8)] }],
    ["imagen demasiado grande", { images: [image(FEEDBACK_MAX_IMAGE_CHARS + 4)] }],
    ["imagen que no es base64", { images: [{ type: "image/png", data: "ab$=" }] }],
    ["tipo de imagen no permitido", { images: [{ type: "image/gif", data: "AAAA" }] }],
    [
      "imágenes que entre todas pasan del total",
      { images: [image(296_000), image(296_000), image(296_000)] },
    ],
  ])("rechaza %s", (_, patch) => {
    expect(FeedbackInputSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });

  it("acepta un viaje, contexto y hasta 3 imágenes válidas", () => {
    const parsed = FeedbackInputSchema.parse({
      ...base,
      tripId: "cmh1abcdefghijklmnopqrst",
      images: [image(8), image(8), image(8)],
      context: { viewport: "412x915", dpr: 2.63, mode: "claro", browser: "Chrome" },
    });
    expect(parsed.images).toHaveLength(3);
  });
});

describe("feedbackProblem", () => {
  it("explica qué falta o sobra antes de enviar", () => {
    const four = [image(4), image(4), image(4), image(4)];
    const heavy = [image(296_000), image(296_000), image(296_000)];
    expect(feedbackProblem({ message: "ok", images: [] })).toMatch(/al menos/);
    expect(feedbackProblem({ message: "x".repeat(2001), images: [] })).toMatch(/2000/);
    expect(feedbackProblem({ message: "Bien", images: four })).toMatch(/3 imágenes/);
    expect(
      feedbackProblem({ message: "Bien", images: [image(FEEDBACK_MAX_IMAGE_CHARS + 4)] }),
    ).toMatch(/demasiado grande/);
    expect(feedbackProblem({ message: "Bien", images: heavy })).toMatch(/entre todas/);
    expect(feedbackProblem({ message: "Todo bien", images: [image(8)] })).toBeNull();
  });
});
