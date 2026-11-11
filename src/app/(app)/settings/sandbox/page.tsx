import { Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { SandboxPhone } from "./phone";

export const metadata: Metadata = { title: "Sandbox phone" };

export default async function Page({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  const { db: d, org } = await requireOrg();
  const { test } = await searchParams;
  const [flow] = test && /^[0-9a-f-]{36}$/i.test(test)
    ? await d
        .select({ id: schema.botFlows.id, name: schema.botFlows.name })
        .from(schema.botFlows)
        .where(and(eq(schema.botFlows.id, test), eq(schema.botFlows.orgId, org.id)))
        .limit(1)
    : [];
  const numbers = await d
    .select({ id: schema.waNumbers.id, displayPhone: schema.waNumbers.displayPhone, displayName: schema.waNumbers.displayName })
    .from(schema.waNumbers)
    .where(and(eq(schema.waNumbers.orgId, org.id), eq(schema.waNumbers.provider, "sandbox")));
  return (
    <SettingsPage title="Sandbox phone" summary={numbers.length ? `${numbers.length} sandbox ${numbers.length === 1 ? "number" : "numbers"}${flow ? ` · testing ${flow.name}` : ""}` : "No sandbox number"} status={[{ label: "Sandbox numbers", value: String(numbers.length), tone: numbers.length ? "on" : "warn" }, { label: "Flow under test", value: flow ? flow.name : "None", tone: flow ? "on" : "off" }]} tips={["Messages arrive in your inbox like real ones.", "Bots and auto-replies run as normal.", "No Meta account needed."]}>
      <p className="text-sm text-muted">Pretend to be a customer. Messages you send here arrive in your inbox exactly like real WhatsApp messages, and run your bots and auto-replies.</p>
      {numbers.length ? <SandboxPhone numbers={numbers} test={flow ?? null} /> : <EmptyState icon={<Smartphone />} title="No sandbox number" description="Sandbox numbers are added to every new workspace." />}
    </SettingsPage>
  );
}
