"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import { placeholderCount, render } from "@/lib/template-render";
import { estimateCost } from "@/lib/meta-pricing";
import { formatMoney } from "@/lib/plans";
import { AudiencePreview } from "@/components/audience-preview";
import type { AudienceSummary } from "@/lib/segments";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { stickyBar } from "@/components/mobile/grouped";
import { audiencePreview, audienceSize, createCampaign } from "../actions";

type Tpl = { id: string; name: string; body: string; category: "MARKETING" | "UTILITY" | "AUTHENTICATION"; headerText: string | null; headerType: string | null; footer: string | null };

export function Composer({
  templates,
  numbers,
  tags,
  fields,
  initialTags = [],
  segments,
  initialSegment,
}: {
  templates: Tpl[];
  numbers: { id: string; label: string; quality: string | null; tier: string | null }[];
  tags: { tag: string; n: number }[];
  fields: string[];
  initialTags?: string[];
  segments: { id: string; name: string }[];
  initialSegment?: string;
}) {
  const [tplId, setTplId] = useState(templates[0].id);
  const [chosen, setChosen] = useState<string[]>(initialTags);
  const [segmentId, setSegmentId] = useState(initialSegment ?? "");
  const [when, setWhen] = useState("now");
  const [vars, setVars] = useState<Record<number, { src: string; text: string }>>({});
  const [size, setSize] = useState<{ total: number; reachable: number } | null>(null);
  const [previewTag, setPreviewTag] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; data: AudienceSummary } | null>(null);
  const previewKey = segmentId ? `s:${segmentId}` : previewTag ? `t:${previewTag}` : null;
  const tpl = templates.find((t) => t.id === tplId)!;
  const n = placeholderCount(tpl.body);
  const number = numbers[0];

  useEffect(() => {
    let live = true;
    audienceSize(chosen, tpl.category, segmentId || null).then((s) => live && setSize(s));
    return () => {
      live = false;
    };
  }, [chosen, tpl.category, segmentId]);

  useEffect(() => {
    if (!previewKey) return;
    let live = true;
    audiencePreview(segmentId ? { segmentId } : { tag: previewTag! }).then((data) => live && setPreview({ key: previewKey, data }));
    return () => {
      live = false;
    };
  }, [previewKey, segmentId, previewTag]);
  const shownPreview = preview && preview.key === previewKey ? preview.data : null;

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
        <SaveForm action={(form) => createCampaign(undefined, form)} success={when === "now" ? "Campaign started" : "Campaign scheduled"} className="space-y-5">
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
            <legend className="section-label mb-1.5 text-faint">Audience</legend>
            {segments.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="segmentId">Send to a saved segment</label>
                <Select id="segmentId" name="segmentId" value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className="w-64">
                  <option value="">No, pick by tag</option>
                  {segments.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {segmentId ? (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  Everyone who matches the segment when the campaign sends. <Link className="link" href={`/contacts/segments/${segmentId}`}>Edit segment</Link>
                </p>
                <div aria-live="polite">{shownPreview ? <AudiencePreview summary={shownPreview} marketing={tpl.category === "MARKETING"} /> : <p className="text-xs text-muted">Loading who&apos;s in it…</p>}</div>
              </div>
            ) : (
            <>
            <p className="mb-2 text-xs text-muted">
              Leave all unticked to send to every contact. Tick tags to send to anyone with at least one of them. Have a spreadsheet?{" "}
              <Link className="link" href={`/contacts/import?for=campaign&tag=list-${new Date().toISOString().slice(0, 10)}`}>
                Upload it as a list
              </Link>{" "}
              and it comes back here as a tag.
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 && <span className="text-sm text-muted">No tags yet. Add tags on contacts or when importing.</span>}
              {tags.map((t) => (
                <label key={t.tag} className="flex cursor-pointer items-center gap-1.5 rounded-xs px-2.5 py-1 text-sm transition-colors duration-150 has-[:checked]:bg-accent-soft bg-fill">
                  <input type="checkbox" name="tags" value={t.tag} checked={chosen.includes(t.tag)} onChange={(e) => setChosen(e.target.checked ? [...chosen, t.tag] : chosen.filter((x) => x !== t.tag))} />
                  {t.tag} <span className="text-muted">({t.n})</span>
                </label>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label htmlFor="previewTag">See who&apos;s in a list</label>
                  <Select id="previewTag" value={previewTag ?? ""} onChange={(e) => setPreviewTag(e.target.value || null)} className="w-56">
                    <option value="">Choose a tag…</option>
                    {tags.map((t) => (
                      <option key={t.tag} value={t.tag}>
                        {t.tag}
                      </option>
                    ))}
                  </Select>
                </div>
                <div aria-live="polite">{previewTag && (shownPreview ? <AudiencePreview summary={shownPreview} marketing={tpl.category === "MARKETING"} /> : <p className="text-xs text-muted">Loading who&apos;s in it…</p>)}</div>
              </div>
            )}
            </>
            )}
          </fieldset>
          {n > 0 && (
            <fieldset className="space-y-2">
              <legend className="section-label mb-1.5 text-faint">Fill in the variables</legend>
              {Array.from({ length: n }, (_, i) => i + 1).map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-12 text-sm">{`{{${i}}}`}</span>
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
            <legend className="section-label mb-1.5 text-faint">When</legend>
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
          <div className={`flex flex-wrap items-center gap-3 max-md:flex-col-reverse max-md:items-stretch max-md:gap-2 ${stickyBar}`}>
            <SubmitButton disabled={!size?.reachable} savingLabel={when === "now" ? "Starting…" : "Scheduling…"} savedLabel={when === "now" ? "Started" : "Scheduled"}>
              {when === "now" ? "Send campaign" : "Schedule campaign"}
            </SubmitButton>
            <span role="status" className="text-sm text-muted">
              {size ? (size.reachable ? `Will go to ${size.reachable} ${size.reachable === 1 ? "person" : "people"}.` : "Nobody in this audience can receive it.") : "Counting recipients…"}
            </span>
          </div>
        </SaveForm>
      </Card>
      <div className="space-y-4">
        <Card className="p-4 text-sm">
          <div className="font-medium">Who gets it</div>
          {size ? (
            <>
              <div className="mt-1 type-stat tabular-nums">{size.reachable}</div>
              {size.total !== size.reachable && <div className="text-xs text-muted">{size.total - size.reachable} opted out of offers and will be skipped</div>}
              <div className="mt-3 font-medium">Estimated Meta charge</div>
              <div className="type-stat tabular-nums">≈ {formatMoney(estimateCost(tpl.category, size.reachable))}</div>
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
        <div className="rounded-lg border border-line p-4">
          <div className="rounded-sm bg-surface p-3 text-sm">
            {tpl.headerType && tpl.headerType !== "text" ? (
              <div className="section-label mb-2 rounded-xs bg-surface-2 py-6 text-center text-faint">{tpl.headerType} header</div>
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
