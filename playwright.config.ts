import { defineConfig, devices } from "@playwright/test";

// Point E2E_URL at a running server to skip the build, e.g. E2E_URL=http://localhost:3001
const external = process.env.E2E_URL;
const port = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        // a throwaway database so runs never touch your dev data
        command: `npx next build && npx next start -p ${port}`,
        url: `http://localhost:${port}/login`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: { PGLITE_DIR: ".data/e2e-pglite", APP_URL: `http://localhost:${port}`, PAYMENTS_SANDBOX: "1" },
      },
});
