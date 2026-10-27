import { defineConfig, devices } from "@playwright/test";

const PORT = 3217;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // El primer acceso compila la página en modo dev: margen amplio.
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  // En CI los fallos se publican como anotaciones del job (legibles sin acceso a los logs).
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    // E2E siempre con proveedores en modo demo: sin red externa ni claves.
    env: { PROVIDERS_MODE: "demo" },
  },
});
