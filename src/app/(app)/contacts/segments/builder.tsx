"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import type { SegmentCondition, SegmentRules } from "@/db/schema";
import { formatWaId } from "@/lib/phone";
import { previewSegment, saveSegment, type SegmentState } from "./actions";

type FieldKey = SegmentCondition["field"];

const FIELDS: { value: FieldKey; label: string }[] = [
  { value: "tag", label: "Tag" },
  { value: "last_message", label: "Last message" },
  { value: "paid_order", label: "Orders" },
  { value: "created", label: "Added" },
  { value: "source", label: "Came from" },
  { value: "custom", label: "Custom field" },
  { value: "opted_out", label: "Offers" },
];

const OPS: Record<FieldKey, { value: string; label: string }[]> = {
  tag: [
    { value: "has", label: "has" },
    { value: "lacks", label: "doesn't have" },
  ],
  last_message: [
    { value: "within_days", label: "within the last" },
    { value: "older_than_days", label: "not in the last" },
    { value: "never", label: "never" },
  ],
  paid_order: [
    { value: "any", label: "has paid for one" },
    { value: "within_days", label: "paid in the last" },
    { value: "none", label: "never paid" },
  ],
  created: [
    { value: "within_days", label: "within the last" },
    { value: "older_than_days", label: "more than" },
  ],
  source: [
    { value: "is", label: "is" },
    { value: "is_not", label: "isn't" },
  ],
  custom: [
    { value: "equals", label: "is" },
    { value: "contains", label: "contains" },
    { value: "is_set", label: "is filled in" },
    { value: "is_empty", label: "is empty" },
  ],
  opted_out: [
    { value: "no", label: "still receives them" },
    { value: "yes", label: "opted out" },
  ],
};

const SOURCES = [
  ["whatsapp", "WhatsApp"],
  ["ad", "Click to WhatsApp ad"],
  ["import", "CSV import"],
  ["api", "API"],
  ["shopify", "Shopify"],
  ["woocommerce", "WooCommerce"],
];

type Row = { field: FieldKey; op: string; value?: string; key?: string; days?: number };

function blank(field: FieldKey, tags: string[], fields: string[]): Row {
  const op = OPS[field][0].value;
  if (field === "tag") return { field, op, value: tags[0] ?? "" };
  if (field === "source") return { field, op, value: "whatsapp" };
  if (field === "custom") return { field, op, key: fields[0] ?? "", value: "" };
  if (field === "last_message" || field === "created" || field === "paid_order") return { field, op, days: 30 };
  return { field, op };
}

const usesDays = (r: Row) => r.op === "within_days" || r.op === "older_than_days";

export function SegmentBuilder({ initial, tags, fields }: { initial?: { id: string; name: string; rules: SegmentRules }; tags: string[]; fields: string[] }) {
  const [state, action, pending] = useActionState<SegmentState, FormData>(saveSegment, undefined);
  const [match, setMatch] = useState<"all" | "any">(initial?.rules.match ?? "all");
  const [rows, setRows] = useState<Row[]>((initial?.rules.conditions as Row[] | undefined) ?? [blank(tags.length ? "tag" : "last_message", tags, fields)]);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewSegment>> | null>(null);
  const rules = JSON.stringify({ match, conditions: rows.map((r) => (usesDays(r) ? r : { ...r, days: undefined })) });

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => previewSegment(rules).then((p) => live && setPreview(p)), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [rules]);

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-5">
        <form action={action} className="space-y-4">
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          {initial && <input type="hidden" name="id" value={initial.id} />}
          <input type="hidden" name="rules" value={rules} />
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required maxLength={80} defaultValue={initial?.name} placeholder="Regulars who haven't ordered lately" />
          </Field>
          <div className="flex items-center gap-2 text-sm">
            Contacts who match
            <Select aria-label="Match" value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")} className="w-24">
              <option value="all">all</option>
              <option value="any">any</option>
            </Select>
            of these:
          </div>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2">
                <Select aria-label="Condition" value={r.field} onChange={(e) => setRows(rows.map((x, j) => (j === i ? blank(e.target.value as FieldKey, tags, fields) : x)))} className="w-36">
                  {FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                {r.field === "custom" && (
                  <Input aria-label="Field name" list="segment-fields" value={r.key ?? ""} onChange={(e) => set(i, { key: e.target.value })} placeholder="field" className="w-32" />
                )}
                <Select aria-label="Operator" value={r.op} onChange={(e) => set(i, { op: e.target.value })} className="w-44">
                  {OPS[r.field].map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                {r.field === "tag" && <Input aria-label="Tag" list="segment-tags" value={r.value ?? ""} onChange={(e) => set(i, { value: e.target.value })} className="w-40" />}
                {r.field === "source" && (
                  <Select aria-label="Source" value={r.value} onChange={(e) => set(i, { value: e.target.value })} className="w-48">
                    {SOURCES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
                {r.field === "custom" && (r.op === "equals" || r.op === "contains") && <Input aria-label="Value" value={r.value ?? ""} onChange={(e) => set(i, { value: e.target.value })} className="w-40" />}
                {usesDays(r) && (
                  <>
                    <Input aria-label="Days" type="number" min={1} max={3650} value={r.days ?? 30} onChange={(e) => set(i, { days: Number(e.target.value) })} className="w-20" />
                    <span className="text-sm">{r.field === "created" && r.op === "older_than_days" ? "days ago" : "days"}</span>
                  </>
                )}
                {rows.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" aria-label="Remove condition" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    ×
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <datalist id="segment-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <datalist id="segment-fields">
            {fields.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          {rows.length < 20 && (
            <button type="button" className="text-sm text-accent" onClick={() => setRows([...rows, blank("tag", tags, fields)])}>
              + Add condition
            </button>
          )}
          <div className="flex gap-2">
            <Button disabled={pending}>{pending ? "Saving…" : "Save segment"}</Button>
            <Link href="/contacts/segments" className="self-center text-sm text-muted">
              Cancel
            </Link>
          </div>
        </form>
      </Card>
      <Card className="h-fit p-4 text-sm">
        <div className="font-medium">Matches right now</div>
        {preview?.error ? (
          <p className="mt-1 text-muted">{preview.error}</p>
        ) : preview ? (
          <>
            <div className="mt-1 text-2xl font-semibold">{preview.count}</div>
            <ul className="mt-2 space-y-1 text-muted">
              {preview.sample?.map((c) => (
                <li key={c.id}>
                  {c.name ?? "—"} · {formatWaId(c.waId)}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Segments are live: a campaign sent to one reaches whoever matches at send time.</p>
          </>
        ) : (
          <p className="mt-1 text-muted">Counting…</p>
        )}
      </Card>
    </div>
  );
}
