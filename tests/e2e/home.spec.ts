import { expect, test } from "@playwright/test";

test("la portada muestra el nombre del producto", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("TripMind");
});
