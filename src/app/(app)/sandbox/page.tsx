import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui";
import { SandboxPhone } from "./phone";

export const metadata: Metadata = { title: "Sandbox phone" };

export default async function Page() {
  const { db: d, org } = await requireOrg();
  const numbers = await d
    .select({ id: schema.waNumbers.id, displayPhone: schema.waNumbers.displayPhone, displayName: schema.waNumbers.displayName })
    .from(schema.waNumbers)
    .where(and(eq(schema.waNumbers.orgId, org.id), eq(schema.waNumbers.provider, "sandbox")));
  return (
    <>
      <PageHeader
        title="Sandbox phone"
        description="Pretend to be a customer. Messages you send here arrive in your inbox exactly like real WhatsApp messages, and run your bots and auto-replies."
      />
      {numbers.length ? <SandboxPhone numbers={numbers} /> : <EmptyState title="No sandbox number" body="Sandbox numbers are added to every new workspace." />}
    </>
  );
}
