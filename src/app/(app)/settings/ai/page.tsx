import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth";
import { aiAvailable, aiSettingsFor } from "@/lib/ai";
import { Alert, Field, Input } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { MessageField, SettingsSection, Toggle } from "@/components/settings";
import { saveAiSettings } from "./actions";

export const metadata: Metadata = { title: "AI replies" };

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const s = await aiSettingsFor(d, org.id);
  return (
    <SettingsPage title="AI replies" summary={`${s.enabled ? "Replies on" : "Replies off"} · ${s.includeCatalog ? "catalog included" : "no catalog"} · hands over after ${s.maxReplies} replies`} status={[{ label: "AI replies", value: s.enabled ? "On" : "Off", tone: s.enabled ? "on" : "off" }, { label: "API key", value: aiAvailable() ? "Set" : "Missing", tone: aiAvailable() ? "on" : "warn" }, { label: "Catalog", value: s.includeCatalog ? "Included" : "Not used", tone: s.includeCatalog ? "on" : "off" }]} tips={["Bot flows always go first; AI only answers what is left.", "It answers only from what you write here.", "Add hours, delivery areas and your cancellation policy."]}>
      {(sp.saved || !aiAvailable()) && (
        <div className="space-y-3">
          {sp.saved && <Alert tone="success">Saved.</Alert>}
          {!aiAvailable() && <Alert tone="warning">AI replies need ANTHROPIC_API_KEY set on the server. Until then this switch has no effect.</Alert>}
        </div>
      )}
        <SettingsSection
          title="AI replies"
          action={saveAiSettings}
          section="replies"
          description="Answer common questions around the clock, using only what you write here. Anything else goes to your team. Bot flows always go first. The AI never makes up prices or policies: if the answer isn't below, it says a teammate will help and hands the chat to the inbox. Conversations your team has taken over stay with your team."
        >
          <Toggle name="enabled" label="Reply with AI when no bot flow handles a message" defaultChecked={s.enabled}>
            <MessageField
              name="businessInfo"
              label="About your business"
              hint="Opening hours, address, what you do and don't offer, delivery areas, how to pay, cancellation policy."
              defaultValue={s.businessInfo}
              max={20000}
              variables={[]}
              bubble={false}
            />
            <MessageField
              name="faqs"
              label="Questions and answers"
              hint="One per paragraph, e.g. “Q: Do you take walk-ins? A: Yes, weekdays before 4pm.”"
              defaultValue={s.faqs}
              max={50000}
              variables={[]}
              bubble={false}
            />
          </Toggle>
        </SettingsSection>
        <SettingsSection title="Catalog" description="Let the AI quote from your product list." action={saveAiSettings} section="catalog">
          <Toggle
            name="includeCatalog"
            label="Use the catalog"
            description="Product names, prices, descriptions and stock."
            defaultChecked={s.includeCatalog}
          />
        </SettingsSection>
        <SettingsSection title="Handover" description="When the AI should stop and pass the chat to your team." action={saveAiSettings} section="handover">
          <Field label="Hand over when the customer says" htmlFor="hk" hint="Comma separated.">
            <Input id="hk" name="handoverKeywords" defaultValue={s.handoverKeywords.join(", ")} />
          </Field>
          <Field label="Hand over after this many AI replies" htmlFor="mr" hint="Per conversation, so nobody gets stuck talking to a bot.">
            <Input id="mr" name="maxReplies" type="number" min={1} max={50} defaultValue={s.maxReplies} className="w-32" />
          </Field>
        </SettingsSection>
    </SettingsPage>
  );
}
