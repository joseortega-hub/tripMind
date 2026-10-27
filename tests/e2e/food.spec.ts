import { expect, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

function isoInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const osm = { name: "OpenStreetMap (Overpass API)", retrievedAt: "2026-10-26T21:33:43.876Z" };

/** Dos días en Madrid centro con el hotel de los trayectos demo y el plan ya generado. */
async function createTripWithPlan(page: Page): Promise<string> {
  const start = isoInDays(30);
  const end = isoInDays(31);
  const location = { lat: 40.4114334, lng: -3.6943236 };
  const response = await page.request.post("/api/trips", {
    data: {
      title: "Madrid para comer",
      destination: {
        id: "osm:relation/5326784",
        name: "Madrid",
        label: "Madrid, Comunidad de Madrid, España",
        kind: "city",
        location: { lat: 40.4125, lng: -3.6945 },
        countryCode: "ES",
        source: { name: "Photon (komoot)", retrievedAt: "2026-10-26T10:00:00.000Z" },
        isDemo: true,
      },
      startDate: start,
      endDate: end,
      travelers: { adults: 2, children: 0 },
      hotel: {
        id: "osm:node/167302201",
        name: "Hotel México",
        location,
        checkIn: start,
        checkOut: end,
        place: {
          id: "osm:node/167302201",
          name: "Hotel México",
          category: "hotel",
          layer: "lodging",
          location,
          source: { ...osm, url: "https://www.openstreetmap.org/node/167302201" },
          isDemo: true,
        },
      },
      preferences: { interests: { museums: 3, monuments_history: 2 } },
      pace: {
        level: "balanced",
        dayStart: "09:30",
        dayEnd: "22:30",
        lunchMinutes: 90,
        freeTimeMinutes: 0,
        restDays: [],
        reducedMobility: false,
      },
      budget: { currency: "EUR", categories: {} },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const id = (await response.json()).id as string;
  const plan = await page.request.post(`/api/trips/${id}/itinerary`);
  expect(plan.status(), await plan.text()).toBe(200);
  return id;
}

test.describe.configure({ timeout: 150_000 });

async function openItinerary(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Itinerario" })
      .click();
  } else {
    await page.getByRole("tab", { name: "Itinerario" }).click();
  }
}

test("API: valida el día y el momento", async ({ page }) => {
  const id = await createTripWithPlan(page);
  const bad = await page.request.get(`/api/trips/${id}/food?date=2020-01-01&moment=lunch`);
  expect(bad.status()).toBe(400);
  const wrong = await page.request.get(`/api/trips/${id}/food?date=${isoInDays(30)}&moment=tea`);
  expect(wrong.status()).toBe(400);
  const ok = await page.request.get(`/api/trips/${id}/food?date=${isoInDays(30)}&moment=lunch`);
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.ratings.status).toBe("not_configured");
  expect(body.results.length).toBeGreaterThan(0);
  expect(body.results[0].place.isDemo).toBe(true);
});

test("buscar dónde comer desde la franja y añadir el sitio al itinerario", async ({
  page,
  isMobile,
}) => {
  const id = await createTripWithPlan(page);
  await page.goto(`/trips/${id}`);
  await openItinerary(page, isMobile);

  await page.getByRole("button", { name: "Buscar dónde comer (comida)" }).first().click();
  const finder = page.getByTestId("food-finder");
  await expect(finder).toBeVisible();
  await expect(finder.getByRole("heading", { name: /Dónde comer/ })).toBeVisible();
  const results = finder.getByTestId("food-result");
  await expect(results.first()).toBeVisible();
  await expect(finder.getByText("Sin valoraciones ni menús")).toBeVisible();

  // Comparar: cerca de la siguiente actividad o del hotel.
  await expect(finder.getByTestId("food-near-next")).toContainText("Siguiente actividad");
  await finder.getByTestId("food-near-hotel").click();
  await expect(finder.getByRole("radio", { name: /Tu hotel/ })).toBeChecked();
  await expect(results.first()).toContainText("desde Hotel México");

  // Filtros.
  await finder.getByRole("button", { name: /^Filtros/ }).click();
  await finder.getByRole("switch", { name: /Solo con terraza/ }).click();
  await expect(finder.getByRole("button", { name: /^Filtros/ })).toContainText("terraza");
  await expect(results.first()).toContainText("Terraza");
  await expectNoSeriousA11yViolations(page);

  // Elegir el primero: la franja lo muestra y se recalculan los tramos.
  const name = (await results.first().getByRole("heading").textContent())!.trim();
  await results
    .first()
    .getByRole("button", { name: /Elegir para esta comida/ })
    .click();
  await expect(finder.getByText(/Añadido a la comida/)).toBeVisible();
  await expect(finder.getByText("Sitio elegido:")).toBeVisible();

  await finder.getByRole("button", { name: "Volver al día" }).click();
  // El nombre de la parada (no el botón "Anotar reserva de Comida: …").
  await expect(
    page.getByRole("button", { name: new RegExp(`^Parada [0-9]+: Comida: ${name}`) }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test("merienda sin franja y momento del día", async ({ page, isMobile }) => {
  const id = await createTripWithPlan(page);
  await page.goto(`/trips/${id}`);
  await openItinerary(page, isMobile);
  await page.getByRole("button", { name: "Dónde comer este día" }).click();
  const finder = page.getByTestId("food-finder");
  await finder.getByText("Merienda", { exact: true }).click();
  await expect(finder.getByText(/La merienda no tiene franja/)).toBeVisible();
  await expect(finder.getByTestId("food-result").first()).toBeVisible();
  await expect(
    finder
      .getByTestId("food-result")
      .first()
      .getByRole("button", { name: /Elegir/ }),
  ).toHaveCount(0);
});
