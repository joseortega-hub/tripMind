import { describe, expect, it } from "vitest";
import {
  folderName,
  formatFeedback,
  formatInbox,
  imageFileName,
  parseFeedbackArgs,
  type FeedbackRow,
} from "./format";

const row: FeedbackRow = {
  id: "cmh1abcdefghijklmnopqrst",
  kind: "error",
  message: "El mapa no carga en el móvil",
  path: "/trips/cmh1abcdefghijklmnopqrst",
  tripId: "cmh1abcdefghijklmnopqrst",
  context: { viewport: "412x915", dpr: 2.63, mode: "claro", browser: "" },
  images: [{ type: "image/webp", data: "QUJD" }],
  status: "new",
  createdAt: new Date("2026-10-27T18:30:12Z"),
};

describe("formato del buzón", () => {
  it("nombra carpetas e imágenes de forma estable", () => {
    expect(folderName(row)).toBe("2026-10-27_1830_cmh1abcd");
    expect(imageFileName(row.images[0]!, 0)).toBe("1.webp");
    expect(imageFileName({ type: "image/jpeg", data: "" }, 2)).toBe("3.jpg");
  });

  it("imprime un bloque Markdown con tipo, id, pantalla, contexto e imágenes", () => {
    expect(formatFeedback(row, ["data/privado/buzon/x/1.webp"])).toBe(
      [
        "## Error · NUEVO · 2026-10-27 18:30 UTC",
        "- id: cmh1abcdefghijklmnopqrst",
        "- pantalla: /trips/cmh1abcdefghijklmnopqrst · viaje: cmh1abcdefghijklmnopqrst",
        "- contexto: viewport: 412x915 · dpr: 2.63 · mode: claro",
        "",
        "El mapa no carga en el móvil",
        "",
        "- imagen: data/privado/buzon/x/1.webp",
      ].join("\n"),
    );
  });

  it("sin contexto ni imágenes omite esas líneas; marca los hechos", () => {
    const text = formatFeedback(
      { ...row, status: "done", tripId: null, context: {}, images: [] },
      [],
    );
    expect(text).toContain("## Error · HECHO");
    expect(text).not.toContain("contexto");
    expect(text).not.toContain("imagen");
    expect(text).toContain("- pantalla: /trips/cmh1abcdefghijklmnopqrst\n");
  });

  it("junta los bloques en pendientes.md", () => {
    expect(formatInbox(["a", "b"], true)).toBe(
      "# Buzón de TripMind (producción): 2 pendientes\n\na\n\n---\n\nb\n",
    );
  });
});

describe("parseFeedbackArgs", () => {
  it("lee las opciones", () => {
    expect(parseFeedbackArgs([])).toEqual({
      prod: false,
      done: undefined,
      keepNew: false,
      all: false,
    });
    expect(parseFeedbackArgs(["--prod", "--done", "CMH1AB", "--keep-new", "--all"])).toEqual({
      prod: true,
      done: "cmh1ab",
      keepNew: true,
      all: true,
    });
  });
  it("exige un id o prefijo válido con --done", () => {
    expect(() => parseFeedbackArgs(["--done"])).toThrow(/Uso/);
    expect(() => parseFeedbackArgs(["--done", "abc"])).toThrow(/Uso/);
    expect(() => parseFeedbackArgs(["--done", "a%b_c"])).toThrow(/Uso/);
  });
});
