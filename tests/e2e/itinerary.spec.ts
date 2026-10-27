import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

function isoInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const osm = { name: "OpenStreetMap (Overpass API)", retrievedAt: "2026-10-26T21:33:43.876Z" };

/** Tres días en Madrid centro con el hotel de los trayectos demo; el segundo, libre. */
async function createTrip(page: Page): Promise<string> {
  const start = isoInDays(20);
  const end = isoInDays(22);
  const location = { lat: 40.4114334, lng: -3.6943236 };
  const response = await page.request.post("/api/trips", {
    data: {
      title: "Madrid paso a paso",
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
        dayEnd: "20:30",
        lunchMinutes: 90,
        freeTimeMinutes: 0,
        restDays: [isoInDays(21)],
        reducedMobility: false,
      },
      budget: { currency: "EUR", categories: {} },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).id as string;
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

const activities = (page: Page) => page.getByTestId("itinerary-activity");
const stop = (page: Page, n: number) =>
  activities(page).filter({ has: page.getByRole("button", { name: new RegExp(`^Parada ${n}:`) }) });
const byId = (page: Page, id: string) => page.locator(`[data-activity-id="${id}"]`);
const idOf = async (row: Locator) => (await row.getAttribute("data-activity-id"))!;

test("genera el plan por días, lo dibuja en el mapa y permite editarlo", async ({
  page,
  isMobile,
}) => {
  const id = await createTrip(page);
  await page.goto(`/trips/${id}`);
  await openItinerary(page, isMobile);

  await expect(page.getByText("Todavía no hay plan por días")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Crear el plan por días" }).click();
  await expect(page.getByTestId("itinerary")).toBeVisible({ timeout: 60_000 });

  // Día 1: franjas de comida, paradas numeradas con hora, tramos con tiempo calculado.
  await expect(activities(page).filter({ hasText: "Comida" })).toHaveCount(1);
  await expect(stop(page, 1)).toBeVisible();
  await expect(stop(page, 1)).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
  await expect(stop(page, 1)).toContainText(/Sin precio/);
  await expect(page.getByText(/\d+ min a pie/).first()).toBeVisible();
  await expect(page.getByText(/^Vuelta a Hotel México:/)).toBeVisible();
  await expect(page.getByTestId("day-route-stop").first()).toBeAttached();
  await expectNoSeriousA11yViolations(page);

  // El día libre se indica sin actividades.
  await page.getByRole("button", { name: /Día 2/ }).click();
  await expect(page.getByText(/Lo marcaste como día libre/)).toBeVisible();
  await page.getByRole("button", { name: /Día 1/ }).click();

  // Bloquear una actividad.
  const first = stop(page, 1);
  const firstId = await idOf(first);
  await first.getByRole("button", { name: /^Bloquear / }).click();
  await expect(byId(page, firstId).getByRole("button", { name: /^Desbloquear / })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Fijar la hora de la segunda parada (queda bloqueada y el día se recalcula).
  const secondId = await idOf(stop(page, 2));
  const thirdId = await idOf(stop(page, 3));
  await byId(page, secondId)
    .getByRole("button", { name: /^Cambiar/ })
    .click();
  await byId(page, secondId).getByLabel("Hora de inicio").fill("17:00");
  await byId(page, secondId).getByRole("button", { name: "Fijar hora" }).click();
  await expect(byId(page, secondId)).toContainText("17:00–");
  await expect(byId(page, secondId)).toContainText("hora bloqueada");

  // Mover la tercera parada al último día con los controles accesibles.
  const third = byId(page, thirdId);
  await third.getByRole("button", { name: /^Cambiar/ }).click();
  await third.getByLabel("Mover a otro día").selectOption({ index: 2 });
  await third.getByRole("button", { name: "Mover", exact: true }).click();
  await expect(byId(page, thirdId)).toHaveCount(0);
  await page.getByRole("button", { name: /Día 3/ }).click();
  await expect(byId(page, thirdId)).toBeVisible();

  // Reorganizar el día no deja avisos de imposibles.
  await page.getByRole("button", { name: "Reorganizar el día" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /No se ha podido/ })).toHaveCount(0);

  // Elegir una actividad abre su ficha y centra el mapa en ella.
  const target = stop(page, 1);
  const name = (await target.getByRole("button", { name: /^Parada 1:/ }).textContent())!
    .replace(/^Parada 1: /, "")
    .trim();
  await target.getByRole("button", { name: /^Parada 1:/ }).click();
  const detail = page.getByRole("article", { name });
  await expect(detail).toBeVisible();
  await expect(detail.getByText(/Está en el plan del día 3/)).toBeVisible();
  await expect(
    page.locator('[data-testid="day-route-stop"][data-place-id]').first(),
  ).toBeAttached();
  await expectNoSeriousA11yViolations(page);
});

test("reordenar con el teclado desde el asa de arrastre", async ({ page, isMobile }) => {
  test.skip(isMobile, "El teclado se prueba en escritorio; en móvil hay botones Antes/Después.");
  const id = await createTrip(page);
  await page.goto(`/trips/${id}`);
  await openItinerary(page, isMobile);
  await page.getByRole("button", { name: "Crear el plan por días" }).click({ timeout: 60_000 });
  await expect(page.getByTestId("itinerary")).toBeVisible({ timeout: 60_000 });

  const firstId = await idOf(stop(page, 1));
  const order = () =>
    activities(page).evaluateAll((rows) => rows.map((row) => row.getAttribute("data-activity-id")));
  const before = (await order()).indexOf(firstId);
  const handle = byId(page, firstId).getByRole("button", { name: /^Arrastrar para reordenar/ });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  // La actividad baja una posición y el día se recalcula con ese orden.
  await expect.poll(async () => (await order()).indexOf(firstId)).toBe(before + 1);
  await expect(page.getByText(/pasa a la posición/)).toBeAttached();
  // El foco sigue en el asa para seguir moviéndola.
  await expect(handle).toBeFocused();
});
