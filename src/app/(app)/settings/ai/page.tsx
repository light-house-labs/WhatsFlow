import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth";
import { aiAvailable, aiSettingsFor } from "@/lib/ai";
import { Alert, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { saveAiSettings } from "./actions";

export const metadata: Metadata = { title: "AI replies" };

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const s = await aiSettingsFor(d, org.id);
  return (
    <>
      <PageHeader title="AI replies" description="Answer common questions around the clock, using only what you write here. Anything else goes to your team." />
      <form action={saveAiSettings} className="max-w-3xl space-y-6 p-6">
        {sp.saved && <Alert tone="success">Saved.</Alert>}
        {!aiAvailable() && <Alert tone="warning">AI replies need ANTHROPIC_API_KEY set on the server. Until then this switch has no effect.</Alert>}
        <Card className="space-y-3 p-5">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> Reply with AI when no bot flow handles a message
          </label>
          <p className="text-sm text-muted">
            Bot flows always go first. The AI never makes up prices or policies: if the answer isn&apos;t below, it says a teammate will help and hands the chat to the inbox. Conversations your team has taken over stay with your team.
          </p>
        </Card>
        <Card className="space-y-4 p-5">
          <Field label="About your business" htmlFor="bi" hint="Opening hours, address, what you do and don't offer, delivery areas, how to pay, cancellation policy.">
            <Textarea id="bi" name="businessInfo" rows={8} defaultValue={s.businessInfo} />
          </Field>
          <Field label="Questions and answers" htmlFor="faqs" hint="One per paragraph, e.g. “Q: Do you take walk-ins? A: Yes, weekdays before 4pm.”">
            <Textarea id="faqs" name="faqs" rows={10} defaultValue={s.faqs} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="includeCatalog" defaultChecked={s.includeCatalog} /> Let it use product names, prices, descriptions and stock from the catalog
          </label>
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Hand over when the customer says" htmlFor="hk" hint="Comma separated.">
            <Input id="hk" name="handoverKeywords" defaultValue={s.handoverKeywords.join(", ")} />
          </Field>
          <Field label="Hand over after this many AI replies" htmlFor="mr" hint="Per conversation, so nobody gets stuck talking to a bot.">
            <Input id="mr" name="maxReplies" type="number" min={1} max={50} defaultValue={s.maxReplies} />
          </Field>
        </Card>
        <Button>Save</Button>
      </form>
    </>
  );
}
