"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import type { TemplateButton } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { enqueue, kickJobs } from "@/lib/jobs";
import { providerFor } from "@/lib/wa";
import { slugTemplateName, validatePlaceholders } from "@/lib/template-render";

export type TplState = { error?: string } | undefined;

const Tpl = z.object({
  name: z.string().trim().min(1, "Give the template a name").max(60),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().trim().min(2).max(10),
  headerType: z.enum(["none", "text", "image", "video", "document"]),
  headerText: z.string().trim().max(60, "Headers can be up to 60 characters"),
  headerMediaUrl: z.string().trim().max(2000),
  body: z.string().trim().min(1, "Write the message").max(1024, "The body can be up to 1024 characters"),
  footer: z.string().trim().max(60, "Footers can be up to 60 characters"),
});

export async function createTemplate(_: TplState, form: FormData): Promise<TplState> {
  const ctx = await requireOrg("admin");
  const parsed = Tpl.safeParse({
    name: form.get("name"),
    category: form.get("category"),
    language: form.get("language") || "en",
    headerType: form.get("headerType") || (form.get("headerText") ? "text" : "none"),
    headerText: form.get("headerText") ?? "",
    headerMediaUrl: form.get("headerMediaUrl") ?? "",
    body: form.get("body"),
    footer: form.get("footer") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const ph = validatePlaceholders(v.body);
  if (ph) return { error: ph };
  if (/\{\{/.test(v.headerText)) return { error: "Keep variables in the body for now." };
  const media = v.headerType === "image" || v.headerType === "video" || v.headerType === "document";
  if (media && v.category === "AUTHENTICATION") return { error: "One-time code templates can't have an image, video or document header." };
  if (media && !/^https:\/\/\S+$/.test(v.headerMediaUrl) && !v.headerMediaUrl.startsWith(`${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/files/`)) {
    return { error: `Upload a sample ${v.headerType} for the header, or paste a public https:// link to one.` };
  }
  if (v.headerType === "text" && !v.headerText) return { error: "Write the header text, or choose no header." };

  const buttons: TemplateButton[] = [];
  const types = form.getAll("btnType").map(String);
  const texts = form.getAll("btnText").map(String);
  const values = form.getAll("btnValue").map(String);
  types.forEach((t, i) => {
    const text = texts[i]?.trim();
    if (!text) return;
    if (t === "URL") buttons.push({ type: "URL", text, url: values[i]?.trim() ?? "" });
    else if (t === "PHONE_NUMBER") buttons.push({ type: "PHONE_NUMBER", text, phone: values[i]?.trim() ?? "" });
    else buttons.push({ type: "QUICK_REPLY", text });
  });
  if (buttons.some((b) => b.text.length > 25)) return { error: "Button text can be up to 25 characters." };
  if (buttons.some((b) => b.type === "URL" && !/^https:\/\//.test(b.url))) return { error: "Website buttons need a full https:// link." };
  if (v.category === "MARKETING" && !buttons.some((b) => b.type === "QUICK_REPLY" && /stop|unsubscribe/i.test(b.text)) && !/stop/i.test(v.footer)) {
    buttons.push({ type: "QUICK_REPLY", text: "Stop offers" }); // one-tap opt-out on every marketing message
  }
  const name = slugTemplateName(v.name);
  const [exists] = await ctx.db
    .select({ id: schema.templates.id })
    .from(schema.templates)
    .where(and(eq(schema.templates.orgId, ctx.org.id), eq(schema.templates.name, name), eq(schema.templates.language, v.language)))
    .limit(1);
  if (exists) return { error: `You already have a template called ${name} in this language.` };

  const [tpl] = await ctx.db
    .insert(schema.templates)
    .values({
      orgId: ctx.org.id,
      name,
      language: v.language,
      category: v.category,
      headerType: v.headerType === "none" ? null : v.headerType,
      headerText: v.headerType === "text" ? v.headerText : null,
      headerMediaUrl: media ? v.headerMediaUrl : null,
      body: v.body, footer: v.footer || null, buttons, status: "draft" })
    .returning();

  if (form.get("submit") === "1") {
    const err = await submit(ctx, tpl.id);
    if (err) return { error: err };
  }
  redirect("/templates");
}

async function submit(ctx: Awaited<ReturnType<typeof requireOrg>>, templateId: string): Promise<string | null> {
  const [tpl] = await ctx.db.select().from(schema.templates).where(and(eq(schema.templates.id, templateId), eq(schema.templates.orgId, ctx.org.id))).limit(1);
  if (!tpl) return "Template not found";
  const numbers = await ctx.db.select().from(schema.waNumbers).where(eq(schema.waNumbers.orgId, ctx.org.id));
  const number = numbers.find((n) => n.provider === "cloud" && n.status === "connected") ?? numbers.find((n) => n.provider === "sandbox");
  if (!number) return "Connect a WhatsApp number first.";
  const r = await providerFor(number).submitTemplate(tpl);
  if (!r.ok) {
    await ctx.db.update(schema.templates).set({ status: "rejected", rejectionReason: r.error }).where(eq(schema.templates.id, tpl.id));
    return `Meta didn't accept it: ${r.error}`;
  }
  await ctx.db.update(schema.templates).set({ status: "pending", metaTemplateId: r.id, rejectionReason: null, updatedAt: new Date() }).where(eq(schema.templates.id, tpl.id));
  if (number.provider === "sandbox") await enqueue(ctx.db, "sandbox.template_review", { templateId: tpl.id }, 4000);
  else await enqueue(ctx.db, "template.sync", { templateId: tpl.id }, 30_000);
  kickJobs(ctx.db);
  return null;
}

export async function submitTemplate(form: FormData) {
  const ctx = await requireOrg("admin");
  await submit(ctx, String(form.get("id")));
  revalidatePath("/templates");
}

export async function deleteTemplate(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  const used = await ctx.db.select({ id: schema.campaigns.id }).from(schema.campaigns).where(eq(schema.campaigns.templateId, id)).limit(1);
  if (used.length) redirect("/templates?error=used");
  await ctx.db.delete(schema.templates).where(and(eq(schema.templates.id, id), eq(schema.templates.orgId, ctx.org.id)));
  revalidatePath("/templates");
}
