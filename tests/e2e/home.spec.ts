import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

test("la portada presenta el producto y lleva al asistente", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("planificado sobre el mapa");
  await expectNoSeriousA11yViolations(page);
  await page.getByRole("link", { name: "Planificar un viaje" }).click();
  await expect(page).toHaveURL(/\/trips\/new$/);
});
