import { expect, type Page, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

// PNG de 1×1 píxel: la captura que se adjunta (se comprime en el navegador).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function isoInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createTrip(page: Page): Promise<string> {
  const source = { name: "Photon (komoot)", retrievedAt: "2026-10-26T10:00:00.000Z" };
  const response = await page.request.post("/api/trips", {
    data: {
      title: "Madrid con buzón",
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
      endDate: isoInDays(21),
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

test("desde la portada se abre el buzón y se envía una idea con captura", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Buzón" }).click();
  const dialog = page.getByRole("dialog", { name: "Buzón de ideas y errores" });
  await expect(dialog).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Validación antes de enviar.
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("alert")).toContainText("al menos unas palabras");

  await dialog.getByText("Idea", { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "Idea" })).toBeChecked();
  await dialog
    .getByLabel("¿Qué te gustaría que hiciera TripMind?")
    .fill("Poder exportar el itinerario a PDF para llevarlo sin conexión.");
  await dialog.getByTestId("feedback-file").setInputFiles({
    name: "captura.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(dialog.getByRole("img", { name: "Imagen adjunta 1" })).toBeVisible();
  await expect(dialog).toContainText("(1/3, opcional)");
  await expect(dialog).toContainText("Se envía también la pantalla (/)");

  const sent = page.waitForResponse(
    (r) => r.url().endsWith("/api/feedback") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Enviar" }).click();
  const response = await sent;
  expect(response.status()).toBe(201);
  const payload = response.request().postDataJSON();
  expect(payload).toMatchObject({ kind: "idea", path: "/" });
  expect(payload.images).toHaveLength(1);
  expect(Object.keys(payload.context).sort()).toEqual(["browser", "dpr", "mode", "viewport"]);

  await expect(dialog.getByRole("status")).toHaveText("¡Gracias! Lo hemos recibido.");
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Buzón" })).toBeFocused();
});

test("en un viaje el buzón adjunta el viaje y no tapa la navegación", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(90_000);
  const id = await createTrip(page);
  await page.goto(`/trips/${id}`);
  // Esperar a la hidratación de la distribución definitiva (pestañas en escritorio, barra en móvil).
  const navigation = isMobile
    ? page.getByRole("navigation", { name: "Vistas del viaje" })
    : page.getByRole("tab").first();
  await expect(navigation).toBeVisible({ timeout: 30_000 });
  const button = page.getByRole("button", { name: "Buzón" });
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Buzón de ideas y errores" });
  await expect(dialog).toContainText(`Se envía también la pantalla (/trips/${id}), el viaje`);
  if (isMobile) {
    // En móvil es una hoja inferior a todo el ancho.
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.y + box.height)).toBe(viewport.height);
  }
  await expectNoSeriousA11yViolations(page);

  await dialog.getByLabel("¿Qué no funciona como debería?").fill("El mapa tarda en cargar.");
  const sent = page.waitForResponse(
    (r) => r.url().endsWith("/api/feedback") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Enviar" }).click();
  const response = await sent;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({
    kind: "error",
    path: `/trips/${id}`,
    tripId: id,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // La navegación del viaje sigue a la vista y usable.
  await expect(navigation).toBeVisible();
});

test("la lectura del buzón está cerrada sin la clave", async ({ request }) => {
  expect((await request.get("/api/feedback")).status()).toBe(401);
  const patch = await request.patch("/api/feedback/cmh1abcdefghijklmnopqrst", {
    data: { status: "done" },
  });
  expect(patch.status()).toBe(401);
});
