import { expect, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

function isoInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const osm = { name: "OpenStreetMap (Overpass API)", retrievedAt: "2026-10-26T21:33:43.876Z" };

/** Dos días en Madrid centro con presupuesto, el hotel de la demo y el plan generado. */
async function createTripWithPlan(page: Page): Promise<string> {
  const start = isoInDays(40);
  const end = isoInDays(41);
  const location = { lat: 40.4114334, lng: -3.6943236 };
  const response = await page.request.post("/api/trips", {
    data: {
      title: "Madrid con entradas",
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
      budget: { currency: "EUR", total: 600, categories: { accommodation: 300, activities: 60 } },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const id = (await response.json()).id as string;
  const plan = await page.request.post(`/api/trips/${id}/itinerary`);
  expect(plan.status(), await plan.text()).toBe(200);
  return id;
}

test.describe.configure({ timeout: 150_000 });

async function openView(page: Page, isMobile: boolean, name: "Reservas" | "Itinerario") {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name })
      .click();
  } else {
    await page.getByRole("tab", { name }).click();
  }
}

test("API: proveedor de entradas no configurado y validación de lo anotado", async ({ page }) => {
  const id = await createTripWithPlan(page);
  const info = await page.request.get(`/api/trips/${id}/bookings`);
  expect(info.status()).toBe(200);
  const body = await info.json();
  expect(body.status.status).toBe("not_configured");
  expect(body.offers).toEqual({});

  const bad = await page.request.put(`/api/trips/${id}/bookings`, {
    data: { target: "activity", activityId: "x", status: "sold" },
  });
  expect(bad.status()).toBe(400);
  const negative = await page.request.put(`/api/trips/${id}/bookings`, {
    data: { target: "hotel", status: "booked", paid: { amount: -1, currency: "EUR" } },
  });
  expect(negative.status()).toBe(400);
  const missing = await page.request.put(`/api/trips/${id}/bookings`, {
    data: { target: "activity", activityId: "no-existe", status: "booked" },
  });
  expect(missing.status()).toBe(409);

  const hotel = await page.request.put(`/api/trips/${id}/bookings`, {
    data: {
      target: "hotel",
      status: "booked",
      note: "Reserva 42",
      paid: { amount: 210, currency: "EUR" },
    },
  });
  expect(hotel.status()).toBe(200);
  expect((await hotel.json()).hotel).toMatchObject({
    bookingStatus: "booked",
    bookingNote: "Reserva 42",
    paidPrice: { amount: 210, currency: "EUR" },
  });

  // El estado informativo y los enlaces salen de la fuente (Prado: de pago, web oficial).
  const itinerary = await (await page.request.get(`/api/trips/${id}/itinerary`)).json();
  const prado = itinerary.days
    .flatMap((day: { activities: unknown[] }) => day.activities)
    .find((activity: { title: string }) => activity.title === "Museo del Prado");
  expect(prado.bookingRequirement).toBe("ticket_required");
  expect(prado.bookingLinks[0]).toMatchObject({ kind: "official", isGeneralWebsite: true });
  expect(prado.bookingStatus).toBeUndefined();
});

test("anotar una entrada comprada actualiza reservas, presupuesto, ficha e itinerario", async ({
  page,
  isMobile,
}) => {
  const id = await createTripWithPlan(page);
  await page.goto(`/trips/${id}`);
  await openView(page, isMobile, "Reservas");

  const overview = page.getByTestId("budget-overview");
  await expect(overview).toContainText("de 600 €");
  await expect(overview).toContainText("Sin precio");
  await expect(page.getByTestId("budget-deviation")).toHaveAttribute("data-level", "ok");
  await expect(page.getByRole("heading", { name: /Por reservar/ })).toBeVisible();

  const row = page.getByTestId("booking-row").filter({ hasText: "Museo del Prado" });
  await expect(row).toContainText("Entrada necesaria");
  await expect(row.getByRole("link", { name: /Web oficial/ })).toHaveAttribute(
    "href",
    "https://www.museodelprado.es/",
  );
  await expectNoSeriousA11yViolations(page);

  await row.getByRole("button", { name: /Anotar tu reserva de Museo del Prado/ }).click();
  const form = page.getByRole("form", { name: "Tu reserva: Museo del Prado" });
  await form.getByRole("radio", { name: "Entrada comprada" }).check();
  await form.getByLabel(/Precio pagado/).fill("30,50");
  await form.getByLabel(/Nota/).fill("Localizador ABC");
  await expectNoSeriousA11yViolations(page);
  await form.getByRole("button", { name: "Guardar" }).click();

  await expect(form).toHaveCount(0);
  const saved = page.getByTestId("booking-row").filter({ hasText: "Museo del Prado" });
  await expect(saved).toContainText("Entrada comprada");
  await expect(saved).toContainText("Pagado: 30,50 €");
  await expect(page.getByRole("heading", { name: /Reservadas o compradas/ })).toBeVisible();
  await expect(overview).toContainText("30,50 €");
  await expect(page.getByTestId("budget-activities")).toContainText("30,50 € de 60 €");

  // Persistido en Postgres: sigue tras recargar.
  await page.reload();
  await openView(page, isMobile, "Reservas");
  await expect(
    page.getByTestId("booking-row").filter({ hasText: "Museo del Prado" }),
  ).toContainText("Entrada comprada");

  // Ficha: estado según la fuente, enlaces por prioridad y lo anotado.
  await page
    .getByTestId("booking-row")
    .filter({ hasText: "Museo del Prado" })
    .getByRole("button", { name: "Museo del Prado", exact: true })
    .click();
  const tickets = page.getByRole("region", { name: "Entradas y reservas" });
  await expect(tickets).toContainText("Entrada necesaria");
  await expect(tickets).toContainText("Entrada comprada");
  await expect(tickets).toContainText("Tarifa según OpenStreetMap");
  await expect(tickets.locator("[data-link-kind]").first()).toHaveAttribute(
    "data-link-kind",
    "official",
  );
  await expect(tickets).toContainText("Sin proveedor de entradas conectado");
  await expectNoSeriousA11yViolations(page);

  // Itinerario: la tarjeta muestra el estado y permite cambiarlo.
  if (!isMobile) await page.getByRole("button", { name: "Cerrar ficha" }).click();
  await openView(page, isMobile, "Itinerario");
  const card = page.getByTestId("itinerary-activity").filter({ hasText: "Museo del Prado" });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Entrada comprada");
  await expect(
    card.getByRole("button", { name: /Cambiar reserva de Museo del Prado/ }),
  ).toBeVisible();
});
