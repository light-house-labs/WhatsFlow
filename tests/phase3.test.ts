import { afterEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import type { FlowEdge, FlowNode } from "@/db/schema";
import { customerSays, makeOrg } from "./helpers";
import { hit } from "@/lib/rate-limit";
import { API_RATE_PER_MINUTE, newApiKey } from "@/lib/api-auth";
import { handleInbound } from "@/lib/wa/inbound";
import { cloudProvider } from "@/lib/wa/cloud";
import { freshFileUrl, signedFileUrl } from "@/lib/storage";
import { GET as listContacts } from "@/app/api/v1/contacts/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("rate limits", () => {
  it("counts hits per bucket in fixed windows", async () => {
    const { d } = await makeOrg();
    const t = Date.UTC(2026, 10, 8, 10, 0, 5);
    expect((await hit(d, "t:a", 2, 60, t)).ok).toBe(true);
    expect((await hit(d, "t:a", 2, 60, t + 1000)).remaining).toBe(0);
    expect((await hit(d, "t:a", 2, 60, t + 2000)).ok).toBe(false);
    expect((await hit(d, "t:b", 2, 60, t + 2000)).ok).toBe(true); // other bucket
    expect((await hit(d, "t:a", 2, 60, t + 60_000)).ok).toBe(true); // next window
  });

  it("answers 429 with Retry-After once an API key is over its limit", async () => {
    const o = await makeOrg();
    const k = newApiKey();
    const [key] = await o.d.insert(schema.apiKeys).values({ orgId: o.org.id, name: "busy", prefix: k.prefix, keyHash: k.hash, scope: "read" }).returning();
    const start = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    await o.d.insert(schema.rateLimits).values({ bucket: `api:${key.id}`, windowStart: start, count: API_RATE_PER_MINUTE });
    const res = (await listContacts(new Request("http://x/api/v1/contacts", { headers: { authorization: `Bearer ${k.key}` } })))!;
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await res.json()).error.code).toBe("rate_limited");
  });
});

describe("flow test mode", () => {
  it("starts a draft flow from the sandbox regardless of its trigger, without counting a run", async () => {
    const o = await makeOrg();
    const nodes: FlowNode[] = [
      { id: "t", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      { id: "q", type: "question", position: { x: 0, y: 0 }, data: { text: "What's your name?", saveAs: "who" } },
      { id: "m", type: "message", position: { x: 0, y: 0 }, data: { text: "Thanks {who}!" } },
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "t", target: "q" },
      { id: "e2", source: "q", target: "m" },
    ];
    const [flow] = await o.d
      .insert(schema.botFlows)
      .values({ orgId: o.org.id, name: "Draft", trigger: { kind: "keyword", keywords: ["nevermatches"] }, graph: { nodes, edges }, status: "draft" })
      .returning();

    // a normal message doesn't run a draft
    const plain = await customerSays(o.number, "919000000001", "hello");
    const conversationId = (plain as { conversationId: string }).conversationId;
    const bodies = async () =>
      (await o.d.select().from(schema.messages).where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.senderKind, "bot"))).orderBy(asc(schema.messages.createdAt))).map((m) => m.body);
    expect(await bodies()).toEqual([]);

    await handleInbound(o.d, o.number, { waMessageId: "t1", from: "919000000001", profileName: null, type: "text", text: "hello again", replyId: null, timestamp: new Date() }, { testFlowId: flow.id });
    expect(await bodies()).toEqual(["What's your name?"]);
    await customerSays(o.number, "919000000001", "Asha");
    expect(await bodies()).toEqual(["What's your name?", "Thanks Asha!"]);

    const [after] = await o.d.select().from(schema.botFlows).where(eq(schema.botFlows.id, flow.id));
    expect(after.runs).toBe(0);
  });

  it("can't test another workspace's flow", async () => {
    const o = await makeOrg();
    const other = await makeOrg("Other");
    const [flow] = await other.d
      .insert(schema.botFlows)
      .values({ orgId: other.org.id, name: "Theirs", trigger: { kind: "keyword", keywords: ["x"] }, graph: { nodes: [{ id: "t", type: "trigger", position: { x: 0, y: 0 }, data: {} }, { id: "m", type: "message", position: { x: 0, y: 0 }, data: { text: "secret" } }], edges: [{ id: "e", source: "t", target: "m" }] } })
      .returning();
    const r = await handleInbound(o.d, o.number, { waMessageId: "t2", from: "919000000002", profileName: null, type: "text", text: "hi", replyId: null, timestamp: new Date() }, { testFlowId: flow.id });
    const sent = await o.d.select().from(schema.messages).where(and(eq(schema.messages.conversationId, (r as { conversationId: string }).conversationId), eq(schema.messages.body, "secret")));
    expect(sent).toHaveLength(0);
  });
});

describe("template media headers", () => {
  const cfg = { phoneNumberId: "PN", wabaId: "WABA", accessToken: "tok", lastWebhookAt: null };
  const tpl = {
    name: "new_menu",
    language: "en",
    category: "MARKETING" as const,
    headerType: "image" as const,
    headerText: null,
    body: "Hi {{1}}, our new menu is here.",
    footer: null,
    buttons: [],
  };

  it("sends the header image with a freshly signed link to our upload", async () => {
    vi.stubEnv("APP_URL", "https://app.example.test");
    const id = "11111111-2222-4333-8444-555555555555";
    const stale = `https://app.example.test/api/files/${id}?exp=1&sig=old`;
    expect(freshFileUrl(stale)).toMatch(new RegExp(`/api/files/${id}\\?exp=\\d+&sig=`));
    expect(freshFileUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");

    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    });
    const r = await cloudProvider(cfg).send("919000000003", { kind: "template", template: { ...tpl, headerMediaUrl: stale }, variables: ["Asha"] });
    expect(r.ok).toBe(true);
    const components = (calls[0].body.template as { components: { type: string; parameters: Record<string, unknown>[] }[] }).components;
    expect(components[0].type).toBe("header");
    const link = (components[0].parameters[0].image as { link: string }).link;
    expect(link).not.toContain("sig=old");
    expect(link.startsWith(signedFileUrl(id).split("?")[0])).toBe(true);
    expect(components[1]).toEqual({ type: "body", parameters: [{ type: "text", text: "Asha" }] });
  });

  it("uploads the header sample to Meta before submitting the template", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const noApp = await cloudProvider(cfg).submitTemplate({ ...tpl, headerMediaUrl: "https://cdn.example.com/a.jpg" });
    expect(noApp).toEqual({ ok: false, error: expect.stringMatching(/META_APP_ID/) });

    vi.stubEnv("META_APP_ID", "APP1");
    const seen: string[] = [];
    let submitted: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push(url);
      if (url === "https://cdn.example.com/a.jpg") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      if (url.includes("/APP1/uploads")) return new Response(JSON.stringify({ id: "upload:abc" }));
      if (url.endsWith("/upload:abc")) return new Response(JSON.stringify({ h: "HANDLE" }));
      submitted = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "tpl1" }));
    });
    const ok = await cloudProvider(cfg).submitTemplate({ ...tpl, headerMediaUrl: "https://cdn.example.com/a.jpg" });
    expect(ok).toEqual({ ok: true, id: "tpl1" });
    expect(seen.some((u) => u.includes("file_length=3&file_type=image%2Fjpeg"))).toBe(true);
    expect((submitted!.components as Record<string, unknown>[])[0]).toEqual({ type: "HEADER", format: "IMAGE", example: { header_handle: ["HANDLE"] } });
  });
});
