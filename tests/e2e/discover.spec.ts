import { expect, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

const osm = { name: "OpenStreetMap (Overpass API)", retrievedAt: "2026-10-26T21:33:43.876Z" };
const hotelLocation = { lat: 40.4114334, lng: -3.6943236 };

/**
 * Viaje a Madrid con fechas fijas que cubren los datos grabados de la demo: cambio de hora
 * (25-10-2026), festivo nacional (1-11-2026) y previsión de Open-Meteo (27-10 a 11-11).
 */
async function createTrip(page: Page, startDate: string, endDate: string): Promise<string> {
  const response = await page.request.post("/api/trips", {
    data: {
      title: "Madrid por descubrir",
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
      startDate,
      endDate,
      travelers: { adults: 2, children: 0 },
      hotel: {
        id: "osm:node/167302201",
        name: "Hotel México",
        location: hotelLocation,
        checkIn: startDate,
        checkOut: endDate,
        place: {
          id: "osm:node/167302201",
          name: "Hotel México",
          category: "hotel",
          layer: "lodging",
          location: hotelLocation,
          source: { ...osm, url: "https://www.openstreetmap.org/node/167302201" },
          isDemo: true,
        },
      },
      preferences: { interests: { museums: 3, nature: 2, photography: 2 } },
      pace: {
        level: "balanced",
        dayStart: "09:30",
        dayEnd: "22:30",
        lunchMinutes: 90,
        freeTimeMinutes: 0,
        restDays: [],
        reducedMobility: false,
      },
      budget: { currency: "EUR", total: 600, categories: {} },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const id = (await response.json()).id as string;
  const plan = await page.request.post(`/api/trips/${id}/itinerary`);
  expect(plan.status(), await plan.text()).toBe(200);
  return id;
}

test.describe.configure({ timeout: 180_000 });

async function openView(page: Page, isMobile: boolean, name: "Itinerario" | "Descubre") {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name })
      .click();
  } else {
    await expect(page.getByRole("tab", { name: "Lista" })).toBeVisible();
    await page.getByRole("tab", { name }).click();
  }
}

test("API: calendario, popular, horas libres, lluvia y enlaces de vídeo", async ({ page }) => {
  const id = await createTrip(page, "2026-10-24", "2026-11-02");

  const calendar = await (await page.request.get(`/api/trips/${id}/calendar`)).json();
  expect(calendar.timeZone).toBe("Europe/Madrid");
  expect(calendar.dst).toEqual([
    expect.objectContaining({ date: "2026-10-25", from: "03:00", to: "02:00", direction: "back" }),
  ]);
  expect(calendar.holidays.map((h: { date: string }) => h.date)).toEqual(["2026-11-01"]);
  expect(calendar.holidaysStatus).toMatchObject({ status: "ok", isDemo: true });
  // Sin clave de Ticketmaster no hay eventos (ni se inventan).
  expect(calendar.eventsStatus.status).toBe("not_configured");
  expect(calendar.events).toEqual([]);
  // Previsión solo de los días dentro de lo grabado, con su fuente.
  expect(calendar.forecast[0]).toMatchObject({ date: "2026-10-27", isDemo: true });
  expect(calendar.forecast[0].source.name).toBe("Open-Meteo");

  const popular = await (await page.request.get(`/api/trips/${id}/popular`)).json();
  expect(popular.status).toBe("ok");
  expect(popular.results.length).toBeGreaterThan(0);
  expect(popular.results[0].source.name).toMatch(/visitas en Wikipedia/);

  const free = await page.request.post(`/api/trips/${id}/free-time`, {
    data: {
      origin: hotelLocation,
      originLabel: "Hotel",
      date: "2026-10-28",
      start: "16:00",
      minutes: 180,
    },
  });
  expect(free.status()).toBe(200);
  const freeBody = await free.json();
  expect(freeBody.suggestions.length).toBeGreaterThan(0);
  expect(freeBody.planMinutes).toBeLessThanOrEqual(180);
  const outside = await page.request.post(`/api/trips/${id}/free-time`, {
    data: {
      origin: hotelLocation,
      originLabel: "Hotel",
      date: "2027-01-01",
      start: "16:00",
      minutes: 60,
    },
  });
  expect(outside.status()).toBe(400);

  const rain = await page.request.get(`/api/trips/${id}/rain?date=2026-11-01`);
  expect(rain.status()).toBe(200);
  expect((await rain.json()).weatherStatus.status).toBe("ok");

  const bad = await page.request.post(`/api/trips/${id}/social`, {
    data: { url: "https://example.com/video/123456" },
  });
  expect(bad.status()).toBe(400);
  const insta = await (
    await page.request.post(`/api/trips/${id}/social`, {
      data: { url: "https://www.instagram.com/reel/Cxyz123/" },
    })
  ).json();
  expect(insta.preview.status).toBe("not_configured");
  const tiktok = await (
    await page.request.post(`/api/trips/${id}/social`, {
      data: { url: "https://www.tiktok.com/@ejemplo/video/7212345678901234567?is_from_webapp=1" },
    })
  ).json();
  expect(tiktok.link).toEqual({
    platform: "tiktok",
    url: "https://www.tiktok.com/@ejemplo/video/7212345678901234567",
    videoId: "7212345678901234567",
  });
  expect(tiktok.preview.status).toBe("demo_unavailable");
  expect(tiktok.candidates).toEqual([]);
});

test("modo lluvia: sustituir una visita al aire libre por un interior", async ({ page }) => {
  const id = await createTrip(page, "2026-11-10", "2026-11-10");
  const rain = await (await page.request.get(`/api/trips/${id}/rain?date=2026-11-10`)).json();
  expect(rain.forecast.precipitationMm).toBeGreaterThan(1);
  const swap = rain.swaps.find((s: { alternatives: unknown[] }) => s.alternatives.length > 0);
  test.skip(!swap, "El plan de ese día no tiene visitas al aire libre con alternativa");
  const alternative = swap.alternatives[0].place;
  const edit = await page.request.patch(`/api/trips/${id}/itinerary`, {
    data: { op: "replace", activityId: swap.activityId, place: alternative },
  });
  expect(edit.status(), await edit.text()).toBe(200);
  const body = await edit.json();
  const day = body.days.find((d: { date: string }) => d.date === "2026-11-10");
  const titles = day.activities.map((a: { title: string }) => a.title);
  expect(titles).toContain(alternative.name);
});

test("calendario del viaje: insignias, filtros recordados y avisos en el mapa", async ({
  page,
  isMobile,
}) => {
  const id = await createTrip(page, "2026-10-25", "2026-11-01");
  await page.goto(`/trips/${id}`);
  await openView(page, isMobile, "Itinerario");

  const calendar = page.getByRole("region", { name: "Calendario del viaje" });
  await expect(calendar).toBeVisible();
  const list = calendar.getByTestId("notice-list");
  await expect(list.getByText("Cambio de hora: a las 03:00 se atrasan a las 02:00")).toBeVisible();
  await expect(
    calendar.getByRole("button", { name: /^dom, 1 nov, día 8 del viaje: .*Festivo/ }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Filtrar por festivo: la lista solo muestra ese tipo y el filtro se recuerda por viaje.
  const holidayChip = calendar.getByRole("button", { name: "Festivo", exact: true });
  await holidayChip.click();
  await expect(holidayChip).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByTestId("notice")).toHaveCount(1);
  await expect(list.getByText("Festivo: Día de todos los Santos")).toBeVisible();
  if (!isMobile) {
    // Los festivos no tienen ubicación: con el filtro no queda ningún aviso en el mapa.
    await expect(page.getByTestId("map-notice")).toHaveCount(0);
  }

  await page.reload();
  await openView(page, isMobile, "Itinerario");
  await expect(
    page
      .getByRole("region", { name: "Calendario del viaje" })
      .getByRole("button", { name: "Festivo", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("region", { name: "Calendario del viaje" })
    .getByRole("button", { name: "Quitar filtros" })
    .first()
    .click();
  if (!isMobile) await expect(page.getByTestId("map-notice").first()).toBeAttached();
});

test("Descubre: horas libres y guardar un sitio desde un vídeo", async ({ page, isMobile }) => {
  const id = await createTrip(page, "2026-10-28", "2026-10-29");
  await page.goto(`/trips/${id}`);
  await openView(page, isMobile, "Descubre");

  const discover = page.getByTestId("discover");
  await expect(discover.getByRole("heading", { name: "Eventos en tus fechas" })).toBeVisible();
  await expect(discover.getByRole("link", { name: /Conciertos/ })).toBeVisible();
  await expect(discover.getByText("Popular ahora (según visitas en Wikipedia)")).toBeVisible();
  await expect(discover.getByText(/^Puntuación interna de TripMind/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const freeTime = page.getByTestId("free-time");
  await freeTime.getByRole("button", { name: "Ver qué me da tiempo" }).click();
  await expect(freeTime.getByTestId("free-time-results")).toContainText("Plan sugerido");

  const social = page.getByTestId("save-from-social");
  await social
    .getByLabel("Enlace del vídeo")
    .fill("https://www.tiktok.com/@ejemplo/video/7212345678901234567");
  await social.getByRole("button", { name: "Buscar el lugar" }).click();
  const preview = social.getByTestId("social-preview");
  await expect(preview).toContainText("no hay vista previa grabada");
  // Nada se guarda sin que el usuario elija el lugar.
  await expect(
    preview.getByRole("button", { name: "Elige un lugar para guardarlo" }),
  ).toBeDisabled();
  await preview.getByLabel("Buscar un lugar del destino").fill("prado");
  await preview.getByRole("radio", { name: /^Museo del Prado/ }).check();
  await preview.getByRole("button", { name: "Guardar «Museo del Prado» con el vídeo" }).click();
  await expect(preview.getByRole("status")).toContainText("Guardado en Guardados: Museo del Prado");
  await expectNoSeriousA11yViolations(page);

  await preview.getByRole("button", { name: "Ver la ficha" }).click();
  const video = page.getByTestId("saved-video");
  await expect(video).toContainText("Lo guardaste desde un vídeo de TikTok");
  await expect(
    video.getByRole("link", { name: "Abrir en TikTok (enlace externo)" }),
  ).toHaveAttribute("href", "https://www.tiktok.com/@ejemplo/video/7212345678901234567");

  const favorites = await (await page.request.get(`/api/trips/${id}/favorites`)).json();
  const prado = favorites.results.find((p: { name: string }) => p.name === "Museo del Prado");
  expect(favorites.media[prado.id]).toMatchObject({
    platform: "tiktok",
    videoId: "7212345678901234567",
  });
});
