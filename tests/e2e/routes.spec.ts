import { expect, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

function isoInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const photon = { name: "Photon (komoot)", retrievedAt: "2026-10-26T10:00:00.000Z" };
const osm = { name: "OpenStreetMap (Overpass API)", retrievedAt: "2026-10-26T21:33:43.876Z" };

/** Viaje a Madrid centro con el hotel desde el que se grabaron los trayectos demo. */
async function createTripWithHotel(page: Page): Promise<string> {
  const checkIn = isoInDays(20);
  const checkOut = isoInDays(22);
  const location = { lat: 40.4114334, lng: -3.6943236 };
  const response = await page.request.post("/api/trips", {
    data: {
      title: "Madrid sin coche",
      destination: {
        id: "osm:relation/5326784",
        name: "Madrid",
        label: "Madrid, Comunidad de Madrid, España",
        kind: "city",
        location: { lat: 40.4125, lng: -3.6945 },
        source: photon,
        isDemo: true,
      },
      startDate: checkIn,
      endDate: checkOut,
      travelers: { adults: 2, children: 0 },
      hotel: {
        id: "osm:node/167302201",
        name: "Hotel México",
        location,
        checkIn,
        checkOut,
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

// Compilan rutas nuevas en modo dev y encadenan varias peticiones: margen amplio.
test.describe.configure({ timeout: 120_000 });

async function openView(page: Page, isMobile: boolean, view: "Lista" | "Mapa" | "Viaje") {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: view })
      .click();
  } else if (view !== "Mapa") {
    await page.getByRole("tab", { name: view }).click();
  }
}

async function openFromList(page: Page, isMobile: boolean, layer: string, name: string) {
  await openView(page, isMobile, "Lista");
  await page
    .locator(`section[aria-labelledby='list-${layer}'] button`)
    .filter({ has: page.locator("span.truncate", { hasText: new RegExp(`^${name}$`) }) })
    .first()
    .click({ timeout: 60_000 });
  const detail = page.getByRole("article", { name });
  await expect(detail).toBeVisible();
  return detail;
}

test("capa de transporte y comparador de modos desde el hotel hasta una estación", async ({
  page,
  isMobile,
}) => {
  const id = await createTripWithHotel(page);
  await page.goto(`/trips/${id}`);
  await expect(page.getByRole("region", { name: "Mapa del viaje" })).toBeVisible({
    timeout: 30_000,
  });

  // Capa 4: estaciones y paradas de OSM, apagada al principio.
  const transport = page
    .getByRole("group", { name: "Capas del mapa" })
    .getByRole("button", { name: /Transporte/ });
  await expect(transport).toHaveAttribute("aria-pressed", "false");
  await transport.click();
  await expect(transport).toHaveAttribute("aria-pressed", "true");

  const detail = await openFromList(page, isMobile, "transport", "Sol");
  const comparator = detail.getByRole("region", { name: "Cómo llegar" });
  await expect(comparator.getByText("Hotel México")).toBeVisible();

  // Transporte público con líneas y horas reales del feed (Cercanías), a pie y en coche.
  const transit = comparator.getByTestId("route-transit");
  await expect(transit.getByText(/^C\d/).first()).toBeVisible();
  await expect(transit.getByText(/Sale a las \d{2}:\d{2}, llega a las \d{2}:\d{2}/)).toBeVisible();
  await expect(comparator.getByTestId("route-walk").getByText(/\d+ min/)).toBeVisible();
  await expect(comparator.getByTestId("route-car").getByText(/precio del taxi/i)).toBeVisible();
  await expect(comparator.getByText(/Horarios programados del/)).toBeVisible();
  await expect(comparator.getByText("Datos de demostración").first()).toBeVisible();

  const show = transit.getByRole("button", { name: "Ver en el mapa" });
  await show.click();
  await expect(transit.getByRole("button", { name: "Quitar del mapa" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoSeriousA11yViolations(page);
});

test("sin ruta real de transporte lo dice y ofrece enlaces externos; metro cercano", async ({
  page,
  isMobile,
}) => {
  const id = await createTripWithHotel(page);
  await page.goto(`/trips/${id}`);

  // (El Prado no entra en los 500 primeros lugares del fixture demo.)
  const detail = await openFromList(page, isMobile, "tourism", "CaixaForum Madrid");
  const transit = detail.getByTestId("route-transit");
  await expect(transit.getByText("Sin ruta calculada")).toBeVisible();
  await expect(transit.getByText(/andando se llega antes/)).toBeVisible();
  await expect(transit.getByText(/en línea recta: no es la distancia del recorrido/)).toBeVisible();
  const google = transit.getByRole("link", { name: /Google Maps.*enlace externo/ });
  await expect(google).toHaveAttribute("href", /google\.com\/maps\/dir\/.*travelmode=transit/);
  await expect(google).toHaveAttribute("href", /origin=40\.411433%2C-3\.694324/);
  await expect(detail.getByTestId("route-walk").getByText(/\d+ min/)).toBeVisible();

  // ¿Hay metro cerca? Estación más cercana con el tiempo a pie calculado.
  await detail.getByRole("button", { name: "¿Hay metro o transporte cerca?" }).click();
  await expect(detail.getByText(/^Sí: .+ está a \d+ min a pie\.$/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test("desde el hotel: qué se puede visitar a pie", async ({ page, isMobile }) => {
  const id = await createTripWithHotel(page);
  await page.goto(`/trips/${id}`);
  await openView(page, isMobile, "Viaje");

  const hotel = page.getByRole("region", { name: "Desde tu hotel" });
  await hotel.getByRole("button", { name: "¿Qué puedo visitar a pie?" }).click();
  await expect(hotel.getByText(/lugares? a 15 min o menos andando/)).toBeVisible();
  await hotel.getByLabel("Como máximo").selectOption("10");
  await expect(hotel.getByText(/a 10 min o menos andando/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Elegir un resultado abre su ficha con el comparador.
  const first = hotel.locator("ul button").first();
  const name = (await first.locator("span.truncate").textContent())!.trim();
  await first.click();
  await expect(page.getByRole("article", { name })).toBeVisible();
});
