"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { placeholderCount, render } from "@/lib/template-render";
import { estimateCost } from "@/lib/meta-pricing";
import { formatMoney } from "@/lib/plans";
import { audienceSize, createCampaign, type CampaignState } from "../actions";

type Tpl = { id: string; name: string; body: string; category: "MARKETING" | "UTILITY" | "AUTHENTICATION"; headerText: string | null; headerType: string | null; footer: string | null };

export function Composer({
  templates,
  numbers,
  tags,
  fields,
  initialTags = [],
}: {
  templates: Tpl[];
  numbers: { id: string; label: string; quality: string | null; tier: string | null }[];
  tags: { tag: string; n: number }[];
  fields: string[];
  initialTags?: string[];
}) {
  const [state, action, pending] = useActionState<CampaignState, FormData>(createCampaign, undefined);
  const [tplId, setTplId] = useState(templates[0].id);
  const [chosen, setChosen] = useState<string[]>(initialTags);
  const [when, setWhen] = useState("now");
  const [vars, setVars] = useState<Record<number, { src: string; text: string }>>({});
  const [size, setSize] = useState<{ total: number; reachable: number } | null>(null);
  const tpl = templates.find((t) => t.id === tplId)!;
  const n = placeholderCount(tpl.body);
  const number = numbers[0];

  useEffect(() => {
    let live = true;
    audienceSize(chosen, tpl.category).then((s) => live && setSize(s));
    return () => {
      live = false;
    };
  }, [chosen, tpl.category]);

  const sample = Array.from({ length: n }, (_, i) => {
    const v = vars[i + 1];
    if (!v?.src) return `{{${i + 1}}}`;
    if (v.src === "=") return v.text || `{{${i + 1}}}`;
    if (v.src === "name") return "Asha";
    if (v.src === "phone") return "919876543210";
    return `[${v.src.replace("field:", "")}]`;
  });
  const cold = number && number.quality && number.quality !== "GREEN";

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
      <Card className="p-5">
        <form action={action} className="space-y-5">
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          <Field label="Campaign name" htmlFor="name">
            <Input id="name" name="name" required placeholder="November reminders" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Template" htmlFor="templateId">
              <Select id="templateId" name="templateId" value={tplId} onChange={(e) => setTplId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.category.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Send from" htmlFor="numberId">
              <Select id="numberId" name="numberId">
                {numbers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">Audience</legend>
            <p className="mb-2 text-xs text-muted">
              Leave all unticked to send to every contact. Tick tags to send to anyone with at least one of them. Have a spreadsheet?{" "}
              <Link className="text-accent" href={`/contacts/import?for=campaign&tag=list-${new Date().toISOString().slice(0, 10)}`}>
                Upload it as a list
              </Link>{" "}
              and it comes back here as a tag.
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 && <span className="text-sm text-muted">No tags yet. Add tags on contacts or when importing.</span>}
              {tags.map((t) => (
                <label key={t.tag} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm">
                  <input type="checkbox" name="tags" value={t.tag} checked={chosen.includes(t.tag)} onChange={(e) => setChosen(e.target.checked ? [...chosen, t.tag] : chosen.filter((x) => x !== t.tag))} />
                  {t.tag} <span className="text-muted">({t.n})</span>
                </label>
              ))}
            </div>
          </fieldset>
          {n > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-[13px] font-medium">Fill in the variables</legend>
              {Array.from({ length: n }, (_, i) => i + 1).map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-12 font-mono text-sm">{`{{${i}}}`}</span>
                  <Select name={`var${i}`} aria-label={`Value for {{${i}}}`} value={vars[i]?.src ?? ""} onChange={(e) => setVars({ ...vars, [i]: { src: e.target.value, text: vars[i]?.text ?? "" } })} className="w-52">
                    <option value="">Choose…</option>
                    <option value="name">Contact&apos;s first name</option>
                    <option value="phone">Contact&apos;s phone</option>
                    {fields.map((f) => (
                      <option key={f} value={`field:${f}`}>
                        Field: {f}
                      </option>
                    ))}
                    <option value="=">Same text for everyone…</option>
                  </Select>
                  {vars[i]?.src === "=" && <Input name={`var${i}Text`} aria-label={`Text for {{${i}}}`} value={vars[i]?.text ?? ""} onChange={(e) => setVars({ ...vars, [i]: { src: "=", text: e.target.value } })} />}
                </div>
              ))}
            </fieldset>
          )}
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">When</legend>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} /> Send now
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="when" value="later" checked={when === "later"} onChange={() => setWhen("later")} /> Schedule
              </label>
              {when === "later" && <Input type="datetime-local" name="scheduledAt" aria-label="Send at" className="w-56" required />}
            </div>
          </fieldset>
          <Button disabled={pending || !size?.reachable}>{pending ? "Starting…" : when === "now" ? "Send campaign" : "Schedule campaign"}</Button>
        </form>
      </Card>
      <div className="space-y-4">
        <Card className="p-4 text-sm">
          <div className="font-medium">Who gets it</div>
          {size ? (
            <>
              <div className="mt-1 text-2xl font-semibold">{size.reachable}</div>
              {size.total !== size.reachable && <div className="text-xs text-muted">{size.total - size.reachable} opted out of offers and will be skipped</div>}
              <div className="mt-3 font-medium">Estimated Meta charge</div>
              <div className="text-lg font-semibold">≈ {formatMoney(estimateCost(tpl.category, size.reachable))}</div>
              <div className="text-xs text-muted">Charged by Meta at cost, not by us. Rates vary by country and category.</div>
            </>
          ) : (
            <div className="text-muted">Counting…</div>
          )}
          {number?.tier && <div className="mt-3 text-xs text-muted">This number can message {number.tier.replace("TIER_", "")} new people a day.</div>}
          {cold && (
            <div className="mt-3">
              <Alert tone="warning">This number&apos;s quality rating is {number.quality}. Large marketing sends now could get it restricted.</Alert>
            </div>
          )}
        </Card>
        <div className="rounded-lg bg-surface-2 p-4">
          <div className="rounded-lg bg-surface p-3 text-sm shadow-sm">
            {tpl.headerType && tpl.headerType !== "text" ? (
              <div className="mb-2 rounded bg-surface-2 py-6 text-center text-xs text-muted">{tpl.headerType} header</div>
            ) : (
              tpl.headerText && <div className="mb-1 font-semibold">{tpl.headerText}</div>
            )}
            <div className="whitespace-pre-wrap">{render(tpl.body, sample)}</div>
            {tpl.footer && <div className="mt-1 text-xs text-muted">{tpl.footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
