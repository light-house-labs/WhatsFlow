import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";

// One signed-up workspace walks through the core loop, in order.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const email = `e2e-${run}@whatsflow.test`;
const password = `e2e-${randomBytes(8).toString("hex")}`; // generated per run, never reused
const customer = `+91 9${String(Date.now()).slice(-9)}`;
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

test("signs up and creates a workspace", async () => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByText("I agree to the Terms").click();
  await page.getByRole("button", { name: "Start 14-day trial" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Business name").fill(`E2E Clinic ${run}`);
  await page.getByLabel("What kind of business?").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("a customer message reaches the inbox and the reply reaches the phone", async () => {
  await page.goto("/sandbox");
  await page.getByLabel("Customer's number").fill(customer);
  await page.getByLabel("Customer's WhatsApp name").fill("Playwright Customer");
  await page.getByLabel("Message as customer").fill(`hello from e2e ${run}`);
  await page.getByRole("button", { name: "Send as customer" }).click();
  await expect(page.getByLabel("Simulated phone").getByText(`hello from e2e ${run}`)).toBeVisible();

  await page.goto("/inbox");
  await page.getByLabel("Conversations").getByText("Playwright Customer").click();
  await expect(page.getByLabel("Conversation").getByText(`hello from e2e ${run}`)).toBeVisible();
  await page.getByLabel("Reply").fill("Thanks, we're on it");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByLabel("Conversation").getByText("Thanks, we're on it")).toBeVisible();

  await page.goto("/sandbox");
  await page.getByLabel("Customer's number").fill(customer);
  await expect(page.getByLabel("Simulated phone").getByText("Thanks, we're on it")).toBeVisible();
});

test("a draft bot flow can be tested on the sandbox phone", async () => {
  await page.goto("/bots");
  await page.getByRole("button", { name: "New flow" }).click();
  await expect(page).toHaveURL(/\/bots\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Test" }).click();
  await expect(page).toHaveURL(/\/sandbox\?test=/);
  await expect(page.getByText(/Testing\s+Untitled flow/)).toBeVisible();

  await page.getByLabel("Message as customer").fill("anything at all");
  await page.getByRole("button", { name: "Send as customer" }).click();
  await expect(page.getByLabel("Simulated phone").getByText("Hi! How can we help?")).toBeVisible();
  await expect(page.getByText("is running")).toBeVisible();
});

test("admin pages open without errors", async () => {
  for (const path of ["/dashboard", "/contacts", "/campaigns", "/templates/new", "/orders", "/catalog", "/appointments", "/automations", "/analytics", "/settings/developers"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.locator("main, body").first()).not.toContainText("Application error");
  }
});
