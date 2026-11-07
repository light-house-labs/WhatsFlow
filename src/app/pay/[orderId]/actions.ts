"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { markPaid } from "@/lib/orders";
import { sandboxPaymentsAllowed } from "@/lib/payments";

export async function payInSandbox(form: FormData) {
  if (!sandboxPaymentsAllowed()) redirect("/");
  const id = String(form.get("orderId"));
  const d = await db();
  const [o] = await d.select({ id: schema.orders.id }).from(schema.orders).where(and(eq(schema.orders.id, id), eq(schema.orders.paymentProvider, "sandbox"))).limit(1);
  if (o) await markPaid(d, o.id, "sandbox checkout");
  redirect("/pay/done");
}
