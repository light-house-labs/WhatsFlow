"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { parseMoney } from "@/lib/plans";
import { assertCatalogRoom, OrderError } from "@/lib/orders";

export async function saveProduct(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const price = parseMoney(String(form.get("price") ?? ""));
  if (!name || price === null) redirect(`/catalog?error=${encodeURIComponent("Give the product a name and a price.")}${id ? `&edit=${id}` : ""}`);
  const stockRaw = String(form.get("stock") ?? "").trim();
  const imageUrl = String(form.get("imageUrl") ?? "").trim();
  const values = {
    name: name.slice(0, 120),
    description: String(form.get("description") ?? "").trim().slice(0, 1000) || null,
    priceMinor: price,
    sku: String(form.get("sku") ?? "").trim() || null,
    stock: stockRaw === "" ? null : Math.max(0, Math.floor(Number(stockRaw)) || 0),
    imageUrl: /^https?:\/\//.test(imageUrl) ? imageUrl : null,
    active: form.get("active") === "on",
    updatedAt: new Date(),
  };
  if (id) {
    await ctx.db.update(schema.products).set(values).where(and(eq(schema.products.id, id), eq(schema.products.orgId, ctx.org.id)));
  } else {
    try {
      await assertCatalogRoom(ctx.db, ctx.org.id, ctx.org.plan);
    } catch (e) {
      if (e instanceof OrderError) redirect(`/catalog?error=${encodeURIComponent(e.message)}`);
      throw e;
    }
    await ctx.db.insert(schema.products).values({ orgId: ctx.org.id, ...values });
  }
  revalidatePath("/catalog");
  redirect("/catalog?saved=1");
}

export async function deleteProduct(form: FormData) {
  const ctx = await requireOrg("admin");
  // Orders keep their own copy of name and price, so deleting is safe.
  await ctx.db.delete(schema.products).where(and(eq(schema.products.id, String(form.get("id"))), eq(schema.products.orgId, ctx.org.id)));
  revalidatePath("/catalog");
}
