import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { makeOrg, customerSays } from "./helpers";
import { searchEntities } from "@/lib/search/entities";
import { parseDay, parsePrefix, phoneDigits } from "@/lib/search/query";
import { rankStatic, staticEntries } from "@/lib/search/registry";

describe("search query parsing", () => {
  it("normalises phone queries", () => {
    expect(phoneDigits("+91 98450 12345")).toBe("9845012345");
    expect(phoneDigits("098450-12345")).toBe("9845012345");
    expect(phoneDigits("0044 7700 900456")).toBe("7700900456");
    expect(phoneDigits("845")).toBe("845");
    expect(phoneDigits("priya")).toBeNull();
  });
  it("reads prefixes", () => {
    expect(parsePrefix("> dark")).toEqual({ mode: "actions", text: "dark" });
    expect(parsePrefix("@priya")).toEqual({ mode: "contacts", text: "priya" });
    expect(parsePrefix("#12")).toEqual({ mode: "numbers", text: "12" });
    expect(parsePrefix(" hello ")).toEqual({ mode: "all", text: "hello" });
  });
  it("reads dates", () => {
    const now = new Date(2026, 10, 11);
    expect(parseDay("12 nov", now)).toBe("2026-11-12");
    expect(parseDay("Nov 12", now)).toBe("2026-11-12");
    expect(parseDay("12/11", now)).toBe("2026-11-12");
    expect(parseDay("tomorrow", now)).toBe("2026-11-12");
    expect(parseDay("31/02", now)).toBeNull();
  });
});

describe("static index", () => {
  it("finds settings fields by synonym and hides admin pages from agents", () => {
    const admin = staticEntries("admin", true);
    const agent = staticEntries("agent", false);
    expect(rankStatic(admin, "out of office")[0]?.entry.id).toBe("setting.inbox.awayEnabled");
    expect(rankStatic(admin, "tz")[0]?.entry.id).toBe("setting.inbox.timezone");
    expect(agent.some((e) => e.path?.startsWith("/settings/billing"))).toBe(false);
    expect(agent.some((e) => e.sandbox)).toBe(false);
    expect(new Set(admin.map((e) => e.id)).size).toBe(admin.length);
  });
});

describe("entity search", () => {
  it("matches names, phones, accents and order numbers, scoped to the workspace", async () => {
    const o = await makeOrg("Search Clinic");
    const other = await makeOrg("Other Clinic");
    await customerSays(o.number, "919845012345", "Do you do implants?");
    await o.d.update(schema.contacts).set({ name: "Priya Nair" }).where(eq(schema.contacts.orgId, o.org.id));
    const [c] = await o.d.insert(schema.contacts).values({ orgId: o.org.id, waId: "919810054321", name: "Zoë Mathéw", email: "zoe@example.test" }).returning();
    await other.d.insert(schema.contacts).values({ orgId: other.org.id, waId: "919999999999", name: "Priya Other" });
    await o.d.insert(schema.orders).values({ orgId: o.org.id, number: 1042, contactId: c.id, items: [{ productId: null, name: "Whitening kit", qty: 1, priceMinor: 120000 }], totalMinor: 120000 });

    const run = (q: string, extra: Partial<Parameters<typeof searchEntities>[1]> = {}) =>
      searchEntities(o.d, { orgId: o.org.id, role: "owner", timezone: "Asia/Kolkata", q, ...extra });
    const titles = (g: Awaited<ReturnType<typeof run>>, t: string) => g.find((x) => x.type === t)?.items.map((i) => i.title) ?? [];

    const byName = await run("priya");
    expect(titles(byName, "contacts")).toEqual(["Priya Nair"]);
    expect(titles(byName, "conversations")).toEqual(["Priya Nair"]);

    expect(titles(await run("+91 98450 12345"), "contacts")).toEqual(["Priya Nair"]);
    expect(titles(await run("zoe mathew"), "contacts")).toEqual(["Zoë Mathéw"]);
    expect(titles(await run("priyaa"), "contacts")).toEqual(["Priya Nair"]);
    expect(titles(await run("implants"), "messages")).toEqual(["Priya Nair"]);
    expect(titles(await run("whitening"), "orders")).toEqual(["Order #1042"]);
    expect(titles(await run("1042", { numbersOnly: true }), "orders")).toEqual(["Order #1042"]);
    expect(titles(await run("priya", { types: ["contacts"] }), "conversations")).toEqual([]);

    // agents don't get results that open admin-only pages
    const flows = await run("welcome", { role: "agent" });
    expect(flows.some((g) => g.type === "bot_flows" || g.type === "automations")).toBe(false);
    expect(await run("50%_")).toEqual([]);
  });
});
