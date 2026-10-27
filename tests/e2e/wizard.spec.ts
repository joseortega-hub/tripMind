import { expect, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

/** Fecha "YYYY-MM-DD" a `days` días de hoy (el flujo no depende de fechas fijas). */
function isoInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Abre el resumen del viaje: pestaña «Viaje» (tablet/escritorio) o vista «Viaje» (móvil). */
async function openTripSummary(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Vistas del viaje" })
      .getByRole("button", { name: "Viaje" })
      .click();
  } else {
    await page.getByRole("tab", { name: "Viaje" }).click();
  }
}

const next = (page: Page) => page.getByRole("button", { name: "Siguiente" }).click();
const stepHeading = (page: Page, name: string) =>
  expect(page.getByRole("heading", { level: 2, name })).toBeVisible();

test.beforeEach(async ({ page }) => {
  await page.goto("/trips/new");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("crea un viaje completo con el asistente en modo demo", async ({ page, isMobile }) => {
  const start = isoInDays(30);
  const end = isoInDays(33);

  // Paso 1: validación y autocompletado real contra /api/geocode (fixtures demo).
  await stepHeading(page, "Destino y fechas");
  if (isMobile) await expect(page.getByText("Paso 1 de 6")).toBeVisible();
  else
    await expect(
      page.getByRole("navigation", { name: "Pasos del asistente" }).getByText("Destino y fechas"),
    ).toHaveAttribute("aria-current", "step");

  await next(page);
  await expect(page.getByText("Elige un destino de la lista de sugerencias")).toBeVisible();
  await expect(page.getByText("Indica la fecha de llegada")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const destination = page.getByRole("combobox", { name: "¿A dónde vas?" });
  await destination.fill("madrid");
  await page
    .getByRole("option", { name: /Comunidad de Madrid, España/ })
    .first()
    .click();
  await expect(page.getByText("Madrid, Comunidad de Madrid, España")).toBeVisible();
  await expect(page.getByText("Datos de demostración").first()).toBeVisible();

  await page.getByLabel("Llegada").fill(start);
  await page.getByLabel("Salida").fill(end);
  await expect(page.getByText("4 días · 3 noches")).toBeVisible();
  await page.getByRole("button", { name: "Añadir: Menores" }).click();
  await expect(page.getByLabel("Menores", { exact: true })).toHaveValue("1");
  await next(page);

  // Paso 2: hotel real de OSM (fixture de Madrid centro).
  await stepHeading(page, "Alojamiento");
  await next(page);
  await expect(page.getByText("Indica si ya tienes alojamiento")).toBeVisible();
  await page.getByText("Sí, ya lo tengo").click();
  await page.getByRole("searchbox", { name: "Filtrar alojamientos por nombre" }).fill("mediodia");
  await page.getByRole("button", { name: /Hotel Mediodía/ }).click();
  await expect(page.getByText("Fuente: OpenStreetMap", { exact: false })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await next(page);

  // Paso 3: intereses con peso.
  await stepHeading(page, "Intereses");
  await next(page);
  await expect(page.getByText("Elige al menos un interés")).toBeVisible();
  await page.getByLabel("Museos").check();
  await page.getByLabel("Gastronomía").check();
  await page
    .getByRole("radiogroup", { name: "Cuánto te interesa: Museos" })
    .getByRole("radio", { name: "Mucho" })
    .click();
  await expect(page.getByText("2 elegidos.")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await next(page);

  // Paso 4: ritmo y un día libre.
  await stepHeading(page, "Ritmo");
  await page.getByText("Relajado", { exact: true }).click();
  await page.getByLabel("Tiempo para comer").selectOption("60");
  await page.locator(`label[for="rest-${isoInDays(31)}"]`).click();
  await next(page);

  // Paso 5: presupuesto con partidas que superan el total → error y corrección.
  await stepHeading(page, "Presupuesto");
  await expectNoSeriousA11yViolations(page);
  await page.getByLabel("Presupuesto total del viaje").fill("1200");
  await page.getByLabel("Alojamiento", { exact: true }).fill("600");
  await page.getByLabel("Comida", { exact: true }).fill("800");
  await next(page);
  await expect(page.getByText("Las partidas suman más que el presupuesto total")).toBeVisible();
  await page.getByLabel("Comida", { exact: true }).fill("300");
  await next(page);

  // Paso 6: resumen; el borrador sobrevive a una recarga.
  await stepHeading(page, "Resumen");
  await page.reload();
  await stepHeading(page, "Resumen");
  const summary = page.locator("form");
  await expect(summary.getByText("Hotel Mediodía")).toBeVisible();
  await expect(summary.getByText("2 adultos y 1 menor")).toBeVisible();
  await expect(summary.getByText("Museos")).toBeVisible();
  await expect(summary.getByText("Relajado")).toBeVisible();
  await expect(summary.getByText(/Total: 1200/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Volver atrás conserva lo introducido.
  await page.getByRole("button", { name: "Atrás" }).click();
  await stepHeading(page, "Presupuesto");
  await expect(page.getByLabel("Comida", { exact: true })).toHaveValue("300");
  await next(page);

  await page.getByLabel("Nombre del viaje (opcional)").fill("Puente en Madrid");
  await page.getByRole("button", { name: "Crear viaje" }).click();

  // Página del viaje guardado en Postgres.
  await expect(page).toHaveURL(/\/trips\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Puente en Madrid");
  await expect(page.getByText("Datos de demostración").first()).toBeVisible();
  await openTripSummary(page, isMobile);
  await expect(page.getByText("Punto de partida de cada día")).toBeVisible();
  await expect(page.getByText("Hotel Mediodía").first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // El borrador se vacía tras crear el viaje.
  await page.goto("/trips/new");
  await stepHeading(page, "Destino y fechas");
  await expect(page.getByRole("combobox", { name: "¿A dónde vas?" })).toHaveValue("");
});

test("sin hotel guarda las preferencias de alojamiento", async ({ page, isMobile }) => {
  await page.getByRole("combobox", { name: "¿A dónde vas?" }).fill("barcelona");
  await page
    .getByRole("option", { name: /Barcelona/ })
    .first()
    .click();
  await page.getByLabel("Llegada").fill(isoInDays(10));
  await page.getByLabel("Salida").fill(isoInDays(11));
  await next(page);

  await page.getByText("Todavía no").click();
  await page.getByLabel(/Presupuesto por noche/).fill("150");
  await page.getByLabel("Categoría mínima").selectOption("3");
  await page.getByText("Apartamento", { exact: true }).click();
  await next(page);

  await page.getByLabel("Arquitectura").check();
  await next(page);
  await next(page);
  await next(page);

  await stepHeading(page, "Resumen");
  await expect(page.getByText("Aún sin alojamiento")).toBeVisible();
  await page.getByRole("button", { name: "Crear viaje" }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Viaje a Barcelona");
  await openTripSummary(page, isMobile);
  await expect(page.getByText(/hasta 150\s€ por noche · 3★ o más/)).toBeVisible();
});

test("un viaje inexistente muestra la página de no encontrado", async ({ page }) => {
  await page.goto("/trips/no-existe");
  await expect(page.getByRole("heading", { name: "Viaje no encontrado" })).toBeVisible();
});
