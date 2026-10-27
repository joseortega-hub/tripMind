import { expect, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

function isoInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Madrid centro sin hotel, con las preferencias de alojamiento del paso 2. */
async function createTrip(page: Page): Promise<{ id: string; start: string; end: string }> {
  const start = isoInDays(30);
  const end = isoInDays(32);
  const response = await page.request.post("/api/trips", {
    data: {
      title: "Madrid sin hotel",
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
      travelers: { adults: 2, children: 1 },
      accommodationPreferences: { types: ["hotel"], zone: "central", rooms: 1, accessible: false },
      preferences: { interests: { museums: 3, monuments_history: 2 } },
      pace: {
        level: "balanced",
        dayStart: "09:30",
        dayEnd: "20:30",
        lunchMinutes: 90,
        freeTimeMinutes: 0,
        restDays: [],
        reducedMobility: false,
      },
      budget: { currency: "EUR", categories: {} },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { id: (await response.json()).id as string, start, end };
}

test.describe.configure({ timeout: 150_000 });

async function openLodging(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Hotel" })
      .click();
  } else {
    await page.getByRole("tab", { name: "Hotel" }).click();
  }
}

const rows = (page: Page) => page.getByTestId("lodging-row");

test("compara alojamientos reales sin precios inventados y ajusta la puntuación", async ({
  page,
  isMobile,
}) => {
  const trip = await createTrip(page);
  await page.goto(`/trips/${trip.id}`);
  // La distribución definitiva aparece tras hidratar (el servidor pinta la de móvil).
  if (!isMobile) await expect(page.getByRole("tab", { name: "Hotel" })).toBeVisible();
  await openLodging(page, isMobile);

  await expect(page.getByTestId("lodging-no-hotel")).toBeVisible();
  await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/comparados con los \d+ lugares más relevantes/)).toBeVisible();
  await expect(rows(page).first()).toContainText("Sin precio disponible");
  await expect(rows(page).first()).toContainText(/min a pie de media al plan/);
  await expect(rows(page).first()).toContainText(/de 100/);
  // Filtro del paso 2 (solo hoteles) aplicado desde el principio.
  await expect(page.getByRole("button", { name: /^Filtros/ })).toContainText("Hotel");

  // Desglose, servicios de OSM y enlaces de búsqueda con fechas y viajeros (no reservas).
  const first = rows(page).first();
  await first.getByRole("button", { name: /^Detalles/ }).click();
  await expect(first.getByText("Desglose de la puntuación")).toBeVisible();
  await expect(first.getByText("Sin precio disponible", { exact: true }).first()).toBeVisible();
  const booking = first.getByRole("link", { name: /Buscar en Booking\.com/ });
  await expect(booking).toHaveAttribute("href", new RegExp(`checkin=${trip.start}`));
  await expect(booking).toHaveAttribute("href", /group_adults=2&group_children=1/);
  await expect(first.getByRole("link", { name: /Buscar en Google Hotels/ })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Ordenar por acceso a transporte: tiempos a la estación de menor a mayor.
  await page.getByLabel("Ordenar por").selectOption("transport");
  const stationMinutes = await rows(page)
    .locator("li", { hasText: /: \d+ min a pie$/ })
    .evaluateAll((items) =>
      items.slice(0, 6).map((item) => Number(/(\d+) min a pie$/.exec(item.textContent ?? "")?.[1])),
    );
  expect(stationMinutes.length).toBeGreaterThan(2);
  expect([...stationMinutes].sort((a, b) => a - b)).toEqual(stationMinutes);

  // Pesos ajustables: solo transporte.
  await page.getByRole("button", { name: /^Ajustar la puntuación/ }).click();
  for (const label of ["Presupuesto", "Cerca del itinerario", "Tus preferencias"]) {
    await page.getByRole("slider", { name: label }).fill("0");
  }
  await page.getByRole("slider", { name: "Transporte" }).fill("5");
  await expect(page.getByRole("button", { name: /^Ajustar la puntuación/ })).toContainText(
    "Personalizada",
  );
  // La fila que queda primera puede ser otra: se abren sus detalles si están cerrados.
  const top = rows(page).first();
  const closed = top.getByRole("button", { name: /^Detalles/ });
  if (await closed.count()) await closed.click();
  await expect(top.getByText("(peso 5)")).toBeVisible();
  await expect(top.getByText("no cuenta").first()).toBeVisible();
});

test("elegir hotel lo convierte en el centro del viaje y recalcula el itinerario", async ({
  page,
  isMobile,
}) => {
  const trip = await createTrip(page);
  // Plan previo (sin hotel, desde el centro del destino).
  const generated = await page.request.post(`/api/trips/${trip.id}/itinerary`);
  expect(generated.status()).toBe(200);

  await page.goto(`/trips/${trip.id}`);
  if (!isMobile) await expect(page.getByRole("tab", { name: "Hotel" })).toBeVisible();
  await openLodging(page, isMobile);
  await expect(page.getByText(/comparados con \d+ visitas de tu itinerario/)).toBeVisible({
    timeout: 60_000,
  });

  const name = (await rows(page).first().getByRole("heading").textContent())!
    .replace(/^\d+\.\s*/, "")
    .trim();
  await rows(page)
    .first()
    .getByRole("button", { name: /^Usar como mi hotel/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "El itinerario se ha recalculado" }),
  ).toBeVisible({ timeout: 60_000 });
  const current = page.getByTestId("current-hotel");
  await expect(current.getByRole("heading", { name })).toBeVisible();
  await expect(current).toContainText(/Puntuación\s*\d+ de 100/);

  // Los trayectos del plan salen ahora del hotel elegido.
  const lodging = await (
    await page.request.get(`/api/trips/${trip.id}/lodging?types=hotel`)
  ).json();
  const chosen = lodging.candidates.find((c: { isCurrent: boolean }) => c.isCurrent);
  expect(chosen.place.name).toBe(name);
  const itinerary = await (await page.request.get(`/api/trips/${trip.id}/itinerary`)).json();
  const firstDay = itinerary.days.find((day: { legs: unknown[] }) => day.legs.length > 0);
  expect(firstDay.legs[0].from).toEqual(chosen.place.location);
  await expectNoSeriousA11yViolations(page);

  // "Desde tu hotel" en la vista Viaje usa el hotel nuevo.
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Viaje" })
      .click();
  } else {
    await page.getByRole("tab", { name: "Viaje" }).click();
  }
  await expect(
    page.getByText(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\. Abre`)),
  ).toBeVisible();
});
