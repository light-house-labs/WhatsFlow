import { describe, expect, it } from "vitest";
import { isOpen } from "@/lib/hours";
import { DEFAULT_HOURS } from "@/lib/hours";
import { placeholderCount, render, resolveVariables, slugTemplateName, validatePlaceholders } from "@/lib/template-render";
import { toWaId } from "@/lib/phone";
import { matchOption, triggerMatches, validateGraph } from "@/lib/flows/graph";
import { starterFlow } from "@/lib/org-setup";
import { STARTERS, starterFor } from "@/lib/starter-flows";
import { overLimit } from "@/lib/plans";
import { decrypt, encrypt, hashPassword, verifyPassword } from "@/lib/crypto";
import { sandboxReview } from "@/lib/wa/sandbox";
import { windowOpen } from "@/lib/wa/outbound";

describe("business hours", () => {
  it("respects the org time zone", () => {
    // 2026-11-09 is a Monday. 05:00 UTC = 10:30 IST (open); 14:00 UTC = 19:30 IST (closed)
    expect(isOpen(DEFAULT_HOURS, "Asia/Kolkata", new Date("2026-11-09T05:00:00Z"))).toBe(true);
    expect(isOpen(DEFAULT_HOURS, "Asia/Kolkata", new Date("2026-11-09T14:00:00Z"))).toBe(false);
    // Sunday closed
    expect(isOpen(DEFAULT_HOURS, "Asia/Kolkata", new Date("2026-11-08T06:00:00Z"))).toBe(false);
  });
});

describe("templates", () => {
  it("counts, validates and renders variables", () => {
    expect(placeholderCount("Hi {{1}}, order {{2}}")).toBe(2);
    expect(validatePlaceholders("Hi {{1}} and {{3}}")).toMatch(/no gaps/);
    expect(validatePlaceholders("Hi {{1}} {{2}}")).toBeNull();
    expect(render("Hi {{1}}", ["Asha"])).toBe("Hi Asha");
    expect(resolveVariables({ "1": "name", "2": "=SALE20" }, 2, { name: "Asha Kumar", waId: "91", customFields: {} })).toEqual(["Asha", "SALE20"]);
    expect(slugTemplateName("Order Shipped! v2")).toBe("order_shipped_v2");
  });
  it("sandbox reviewer rejects common problems", () => {
    expect(sandboxReview("{{1}} your order is ready", 1).approved).toBe(false);
    expect(sandboxReview("Click here for a guaranteed prize", 0).approved).toBe(false);
    expect(sandboxReview("Hi {{1}}, your order is ready for pickup today.", 1).approved).toBe(true);
  });
});

describe("phone numbers", () => {
  it("normalises Indian and international formats", () => {
    expect(toWaId("98765 43210")).toBe("919876543210");
    expect(toWaId("+44 7700 900123")).toBe("447700900123");
    expect(toWaId("09876543210")).toBe("919876543210");
    expect(toWaId("123")).toBeNull();
  });
});

describe("flows", () => {
  it("every industry starter flow is valid", () => {
    expect(validateGraph(starterFlow())).toEqual([]);
    for (const s of Object.values(STARTERS)) expect(validateGraph(s.graph), s.key).toEqual([]);
    expect(starterFor("Real estate").key).toBe("realestate");
    expect(starterFor("Unknown").key).toBe("general");
  });
  it("catches broken graphs", () => {
    const g = starterFlow();
    g.edges = g.edges.filter((e) => e.id !== "e-day-0");
    expect(validateGraph(g).join(" ")).toMatch(/never be reached/);
  });
  it("matches triggers and options", () => {
    expect(triggerMatches({ kind: "keyword", keywords: ["hi"] }, "Hi there", false)).toBe(true);
    expect(triggerMatches({ kind: "keyword", keywords: ["hi"] }, "this", false)).toBe(false);
    expect(matchOption(["Prices", "Book"], { text: "x", replyId: "btn:1" })).toBe(1);
    expect(matchOption(["Prices", "Book"], { text: "book" })).toBe(1);
    expect(matchOption(["Prices", "Book"], { text: "2" })).toBe(1);
    expect(matchOption(["Prices", "Book"], { text: "nope" })).toBe(-1);
  });
});

describe("plans", () => {
  it("lists what is over a lower plan's limits", () => {
    expect(overLimit("starter", { seats: 2, liveFlows: 9, numbers: 1 })).toHaveLength(1);
    expect(overLimit("team", { seats: 2, liveFlows: 9, numbers: 1 })).toHaveLength(0);
  });
});

describe("crypto", () => {
  it("hashes passwords and round-trips encryption", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(decrypt(encrypt("EAAG-token"))).toBe("EAAG-token");
  });
});

describe("24h window", () => {
  it("opens for 24 hours after the last inbound message", () => {
    expect(windowOpen(new Date(Date.now() - 3600_000))).toBe(true);
    expect(windowOpen(new Date(Date.now() - 25 * 3600_000))).toBe(false);
    expect(windowOpen(null)).toBe(false);
  });
});

describe("flow loops", () => {
  const node = (id: string, type: string, data = {}) => ({ id, type, position: { x: 0, y: 0 }, data }) as never;
  const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });
  it("allows a loop through a waiting block but rejects a pass-through-only loop", () => {
    const base = [node("t", "trigger"), node("m1", "message", { text: "a" }), node("m2", "message", { text: "b" })];
    const waiting = validateGraph({ nodes: [...base, node("q", "question", { text: "?", saveAs: "x" })], edges: [edge("t", "m1"), edge("m1", "q"), edge("q", "m2"), edge("m2", "m1")] });
    expect(waiting.filter((p) => /loop/i.test(p))).toEqual([]);
    const spin = validateGraph({ nodes: base, edges: [edge("t", "m1"), edge("m1", "m2"), edge("m2", "m1")] });
    expect(spin.some((p) => /loop/i.test(p))).toBe(true);
  });
});
