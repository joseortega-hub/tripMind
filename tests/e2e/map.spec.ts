import { expect, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

/** Fecha "YYYY-MM-DD" a `days` días de hoy. */
function isoInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const source = { name: "Photon (komoot)", retrievedAt: "2026-10-26T10:00:00.000Z" };

/** Crea un viaje a Madrid centro (zona de los fixtures demo) directamente por la API. */
async function createTrip(page: Page): Promise<string> {
  const response = await page.request.post("/api/trips", {
    data: {
      title: "Madrid en el mapa",
      destination: {
        id: "osm:relation/5326784",
        name: "Madrid",
        label: "Madrid, Comunidad de Madrid, España",
        kind: "city",
        location: { lat: 40.4125, lng: -3.6945 },
        source,
        isDemo: true,
      },
      startDate: isoInDays(20),
      endDate: isoInDays(22),
      travelers: { adults: 2, children: 0 },
      preferences: { interests: { museums: 3 } },
      pace: {
        level: "balanced",
        dayStart: "09:00",
        dayEnd: "21:00",
        lunchMinutes: 60,
        freeTimeMinutes: 0,
        restDays: [],
        reducedMobility: false,
      },
      budget: { currency: "EUR", categories: {} },
      accommodationPreferences: { rooms: 1, types: [], zone: "any", accessible: false },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).id as string;
}

test("explora lugares en el mapa y la lista, abre una ficha y guarda un favorito", async ({
  page,
  isMobile,
}) => {
  const id = await createTrip(page);
  await page.goto(`/trips/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Madrid en el mapa" })).toBeVisible();

  // El mapa de MapLibre se carga de forma diferida y muestra la atribución de OSM.
  await expect(page.getByRole("region", { name: "Mapa del viaje" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: /OpenStreetMap/ }).first()).toBeVisible();
  await expect(
    page.getByTestId("map-marker").or(page.getByTestId("map-cluster")).first(),
  ).toBeVisible();

  const layers = page.getByRole("group", { name: "Capas del mapa" });
  const food = layers.getByRole("button", { name: /Gastronomía/ });
  await expect(food).toHaveAttribute("aria-pressed", "true");

  // Lista accesible equivalente.
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Lista" })
      .click();
  await expect(page.locator("section[aria-labelledby='list-tourism']")).toBeVisible();
  await expect(page.getByText("Datos de demostración").first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Desactivar una capa la quita de la lista.
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Mapa" })
      .click();
  await food.click();
  await expect(food).toHaveAttribute("aria-pressed", "false");
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Lista" })
      .click();
  await expect(page.locator("section[aria-labelledby='list-food']")).toHaveCount(0);

  // Elegir en la lista abre la ficha y resalta el marcador.
  const first = page.locator("section[aria-labelledby='list-tourism'] button").first();
  const name = (await first.locator("span.truncate").first().textContent())!.trim();
  await first.click();
  const detail = page.getByRole("article", { name });
  await expect(detail).toBeVisible();
  await expect(detail.getByText(/Fuente:/)).toBeVisible();
  await expect(page.locator("[data-testid='map-marker'][data-selected]")).toHaveCount(1, {
    timeout: 15_000,
  });
  await expectNoSeriousA11yViolations(page);

  // Guardar persiste en Postgres: tras recargar sigue guardado y aparece en "Guardados".
  await detail.getByRole("button", { name: "Guardar" }).click();
  await expect(detail.getByRole("button", { name: "Guardado" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/trips/${id}/favorites`);
      return (await response.json()).results.map((place: { name: string }) => place.name);
    })
    .toContain(name);

  await page.reload();
  const saved = page
    .getByRole("group", { name: "Capas del mapa" })
    .getByRole("button", { name: /Guardados/ });
  await expect(saved).toContainText("1");
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Lista" })
      .click();
  await expect(page.locator("section[aria-labelledby='list-saved']").getByText(name)).toBeVisible();
});

test("si el proveedor de lugares falla, lo indica y ofrece un enlace externo", async ({
  page,
  isMobile,
}) => {
  const id = await createTrip(page);
  await page.route(/\/api\/places\?/, (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "provider_unavailable",
          message: "El proveedor de datos no está disponible ahora mismo.",
          externalUrl: "https://www.openstreetmap.org/#map=17/40.41250/-3.69450",
        },
      }),
    }),
  );
  await page.goto(`/trips/${id}`);
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Lista" })
      .click();
  await expect(page.getByText("No se pueden cargar los lugares")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ver la zona en OpenStreetMap/ })).toHaveAttribute(
    "href",
    /openstreetmap\.org/,
  );
  await expectNoSeriousA11yViolations(page);
});
