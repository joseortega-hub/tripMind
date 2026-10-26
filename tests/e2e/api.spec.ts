import { expect, test } from "@playwright/test";

// El servidor E2E corre con PROVIDERS_MODE=demo: datos grabados, sin red externa.
test.describe("APIs de proveedores (modo demo)", () => {
  test("geocode devuelve resultados marcados como demo", async ({ request }) => {
    const response = await request.get("/api/geocode?q=prado");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.provider.isDemo).toBe(true);
    expect(body.results[0]).toMatchObject({ isDemo: true, source: { license: "ODbL 1.0" } });
  });

  test("places devuelve lugares de Madrid centro con fuente", async ({ request }) => {
    const response = await request.get(
      "/api/places?bbox=-3.6965,40.4115,-3.6905,40.4155&layers=tourism",
    );
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((p: { isDemo: boolean }) => p.isDemo)).toBe(true);
  });

  test("valida los parámetros", async ({ request }) => {
    const response = await request.get("/api/places?bbox=nope");
    expect(response.status()).toBe(400);
  });
});
