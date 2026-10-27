import { describe, expect, it, vi } from "vitest";
import {
  feedbackContext,
  fitWithin,
  onOpenFeedback,
  openFeedback,
  splitDataUrl,
  tripIdFromPath,
} from "./feedback";

describe("fitWithin", () => {
  it("reduce por el lado mayor conservando la proporción", () => {
    expect(fitWithin(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(1080, 2400, 1200)).toEqual({ width: 540, height: 1200 });
  });
  it("nunca amplía ni baja de 1 px", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10_000, 1)).toEqual({ width: 1600, height: 1 });
  });
});

describe("splitDataUrl", () => {
  it("separa tipo y base64 de los formatos admitidos", () => {
    expect(splitDataUrl("data:image/webp;base64,QUJD")).toEqual({
      type: "image/webp",
      data: "QUJD",
    });
    expect(splitDataUrl("data:image/jpeg;base64,QUJD")?.type).toBe("image/jpeg");
    // Un navegador sin WebP devuelve PNG al pedir WebP: se reconoce para probar con JPEG.
    expect(splitDataUrl("data:image/png;base64,QUJD")?.type).toBe("image/png");
  });
  it("rechaza otros tipos", () => {
    expect(splitDataUrl("data:image/gif;base64,QUJD")).toBeNull();
    expect(splitDataUrl("data:,")).toBeNull();
  });
});

describe("tripIdFromPath", () => {
  it("extrae el id del viaje de /trips/<id>", () => {
    expect(tripIdFromPath("/trips/cmh1abcdefghijklmnopqrst")).toBe("cmh1abcdefghijklmnopqrst");
    expect(tripIdFromPath("/trips/cmh1abcdefghijklmnopqrst/print")).toBe(
      "cmh1abcdefghijklmnopqrst",
    );
  });
  it("no inventa viaje en el asistente ni en la portada", () => {
    expect(tripIdFromPath("/trips/new")).toBeUndefined();
    expect(tripIdFromPath("/")).toBeUndefined();
    expect(tripIdFromPath("/trips/abc")).toBeUndefined();
  });
});

describe("feedbackContext", () => {
  it("solo lleva pantalla, modo y navegador", () => {
    const context = feedbackContext();
    expect(Object.keys(context).sort()).toEqual(["browser", "dpr", "mode", "viewport"]);
    expect(context.viewport).toMatch(/^\d+x\d+$/);
    expect(context.mode).toBe("claro");
  });
});

describe("openFeedback", () => {
  it("avisa a quien escucha y deja de hacerlo al desuscribirse", () => {
    const listener = vi.fn();
    const off = onOpenFeedback(listener);
    openFeedback();
    off();
    openFeedback();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
