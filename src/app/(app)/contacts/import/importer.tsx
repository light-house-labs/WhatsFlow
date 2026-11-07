"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { Alert, Button, Card, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { importContacts, type ImportResult, type ImportRow } from "../actions";

const TARGETS = [
  { id: "", label: "Ignore" },
  { id: "phone", label: "Phone (required)" },
  { id: "name", label: "Name" },
  { id: "email", label: "Email" },
  { id: "tags", label: "Tags" },
  { id: "custom", label: "Custom field" },
];

function guess(header: string): string {
  const h = header.toLowerCase();
  if (/phone|mobile|whatsapp|number|contact/.test(h)) return "phone";
  if (/name/.test(h)) return "name";
  if (/mail/.test(h)) return "email";
  if (/tag|label|group|segment/.test(h)) return "tags";
  return "custom";
}

export function Importer() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [tag, setTag] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File) {
    setResult(null);
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        const h = r.meta.fields ?? [];
        if (!h.length) return setError("That file has no header row.");
        setHeaders(h);
        setRows(r.data);
        setMap(Object.fromEntries(h.map((x) => [x, guess(x)])));
      },
      error: (e) => setError(e.message),
    });
  }

  const hasPhone = Object.values(map).includes("phone");

  function run() {
    const mapped: ImportRow[] = rows.map((r) => {
      const out: ImportRow = { phone: "" };
      for (const h of headers) {
        const t = map[h];
        if (!t) continue;
        if (t === "custom") out[h.toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_")] = r[h];
        else out[t] = r[h];
      }
      return out;
    });
    start(async () => setResult(await importContacts(mapped, tag)));
  }

  return (
    <div className="max-w-4xl space-y-4 p-6">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card className="p-5">
        <Field label="CSV file" htmlFor="file" hint="First row must be column names. Phone numbers need a country code, or 10-digit Indian numbers.">
          <Input id="file" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </Field>
      </Card>
      {headers.length > 0 && !result && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Match your columns ({rows.length} rows)</h2>
          <Table>
            <thead>
              <tr>
                <Th>Your column</Th>
                <Th>Example</Th>
                <Th>Import as</Th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h) => (
                <tr key={h}>
                  <Td className="font-medium">{h}</Td>
                  <Td className="text-muted">{rows[0]?.[h]}</Td>
                  <Td>
                    <Select aria-label={`Import ${h} as`} value={map[h]} onChange={(e) => setMap({ ...map, [h]: e.target.value })} className="h-8 w-44 text-[13px]">
                      {TARGETS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Also tag everyone as" htmlFor="tag">
              <Input id="tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. imported-nov" className="w-56" />
            </Field>
            <Button disabled={!hasPhone || pending} onClick={run}>
              {pending ? "Importing…" : `Import ${rows.length} contacts`}
            </Button>
            {!hasPhone && <span className="text-sm text-danger">Pick which column is the phone number.</span>}
          </div>
        </Card>
      )}
      {result && (
        <Card className="space-y-3 p-5">
          <Alert tone="success">
            {result.created} added, {result.updated} updated{result.skipped.length ? `, ${result.skipped.length} skipped` : ""}.
          </Alert>
          {result.skipped.length > 0 && (
            <ul className="max-h-60 overflow-y-auto text-sm text-muted">
              {result.skipped.map((s) => (
                <li key={s.row}>
                  Row {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          )}
          <Link href="/contacts" className="text-sm text-accent">
            Back to contacts →
          </Link>
        </Card>
      )}
    </div>
  );
}
