"use client";

import { useState } from "react";
import { FileText, Film, ImageIcon } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { UploadField } from "@/components/upload-field";
import { placeholderCount, render } from "@/lib/template-render";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { createTemplate } from "../actions";

type Btn = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; value: string };

const STARTERS = [
  { label: "Order shipped", category: "UTILITY", body: "Hi {{1}}, your order {{2}} is on its way. Track it here: {{3}}" },
  { label: "Appointment reminder", category: "UTILITY", body: "Hi {{1}}, a reminder of your appointment on {{2}} at {{3}}. Reply 1 to confirm or 2 to reschedule." },
  { label: "Payment reminder", category: "UTILITY", body: "Hi {{1}}, a payment of {{2}} for invoice {{3}} is due on {{4}}. Reply here if you have any questions." },
  { label: "Festive offer", category: "MARKETING", body: "Hi {{1}}, our festive offer is here: {{2}} off everything this week. Reply to order." },
];

export function TemplateEditor() {
  const [body, setBody] = useState("");
  const [header, setHeader] = useState("");
  const [headerType, setHeaderType] = useState<"none" | "text" | "image" | "video" | "document">("none");
  const [footer, setFooter] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [samples, setSamples] = useState<string[]>([]);
  const n = placeholderCount(body);

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
      <Card className="p-5">
        <SaveForm action={(form) => createTemplate(undefined, form)} success="Template saved" className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted">Start from:</span>
            {STARTERS.map((s) => (
              <button
                type="button"
                key={s.label}
                className="rounded-xs px-2 py-0.5 text-xs transition-colors duration-150 bg-fill"
                onClick={() => {
                  setBody(s.body);
                  setCategory(s.category);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" htmlFor="name" hint="Lowercase with underscores, e.g. order_shipped">
              <Input id="name" name="name" required placeholder="order_shipped" />
            </Field>
            <Field label="Category" htmlFor="category" hint="Meta prices and reviews these differently.">
              <Select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="UTILITY">Utility (updates about an order or booking)</option>
                <option value="MARKETING">Marketing (offers, news)</option>
                <option value="AUTHENTICATION">Authentication (one-time codes)</option>
              </Select>
            </Field>
            <Field label="Language" htmlFor="language">
              <Select id="language" name="language" defaultValue="en">
                <option value="en">English</option>
                <option value="en_US">English (US)</option>
                <option value="hi">Hindi</option>
                <option value="ml">Malayalam</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="kn">Kannada</option>
                <option value="mr">Marathi</option>
                <option value="bn">Bengali</option>
                <option value="ar">Arabic</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <Field label="Header" htmlFor="headerType">
              <Select id="headerType" name="headerType" value={headerType} onChange={(e) => setHeaderType(e.target.value as typeof headerType)}>
                <option value="none">None</option>
                <option value="text">Text</option>
                {category !== "AUTHENTICATION" && (
                  <>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                  </>
                )}
              </Select>
            </Field>
            {headerType === "text" && (
              <Field label="Header text" htmlFor="headerText">
                <Input id="headerText" name="headerText" maxLength={60} value={header} onChange={(e) => setHeader(e.target.value)} />
              </Field>
            )}
            {(headerType === "image" || headerType === "video" || headerType === "document") && (
              <div>
                <UploadField
                  key={headerType}
                  name="headerMediaUrl"
                  label={`Header ${headerType}`}
                  accept={headerType === "image" ? "image/jpeg,image/png" : headerType === "video" ? "video/mp4" : "application/pdf"}
                />
                <p className="mt-1 text-xs text-muted">Meta reviews the template with this file, and it&apos;s sent with every message unless you swap it later.</p>
              </div>
            )}
          </div>
          <Field label="Message" htmlFor="body" hint="Use {{1}}, {{2}}… for things that change per customer, like their name or order number.">
            <Textarea id="body" name="body" required maxLength={1024} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div className="flex justify-between text-xs text-muted">
            <button type="button" className="font-medium hover:underline" onClick={() => setBody((b) => `${b}{{${n + 1}}}`)}>
              + Add variable {`{{${n + 1}}}`}
            </button>
            <span>{body.length}/1024</span>
          </div>
          <Field label="Footer (optional)" htmlFor="footer">
            <Input id="footer" name="footer" maxLength={60} value={footer} onChange={(e) => setFooter(e.target.value)} />
          </Field>
          <div className="space-y-2">
            <div className="section-label text-faint">Buttons (optional)</div>
            {buttons.map((b, i) => (
              <div key={i} className="flex gap-2">
                <Select name="btnType" aria-label="Button type" value={b.type} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, type: e.target.value as Btn["type"] } : x)))} className="w-40">
                  <option value="QUICK_REPLY">Quick reply</option>
                  <option value="URL">Open website</option>
                  <option value="PHONE_NUMBER">Call number</option>
                </Select>
                <Input name="btnText" aria-label="Button text" placeholder="Button text" maxLength={25} value={b.text} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                {b.type !== "QUICK_REPLY" ? (
                  <Input name="btnValue" aria-label="Button link or number" placeholder={b.type === "URL" ? "https://" : "+91…"} value={b.value} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                ) : (
                  <input type="hidden" name="btnValue" value="" />
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => setButtons(buttons.filter((_, j) => j !== i))} aria-label="Remove button">
                  ×
                </Button>
              </div>
            ))}
            {buttons.length < 3 && (
              <button type="button" className="text-sm font-medium hover:underline" onClick={() => setButtons([...buttons, { type: "QUICK_REPLY", text: "", value: "" }])}>
                + Add button
              </button>
            )}
            {category === "MARKETING" && <p className="text-xs text-muted">We add a “Stop offers” button to marketing templates so customers can opt out in one tap.</p>}
          </div>
          <div className="flex gap-2">
            <SubmitButton name="submit" value="1" savingLabel="Submitting…" savedLabel="Submitted">
              Submit for approval
            </SubmitButton>
            <SubmitButton name="submit" value="0" variant="secondary">
              Save draft
            </SubmitButton>
          </div>
        </SaveForm>
      </Card>
      <div className="space-y-3">
        <div className="section-label text-faint">Preview</div>
        {Array.from({ length: n }).map((_, i) => (
          <Input key={i} aria-label={`Sample for {{${i + 1}}}`} placeholder={`Sample for {{${i + 1}}}`} value={samples[i] ?? ""} onChange={(e) => setSamples((s) => Object.assign([...s], { [i]: e.target.value }))} />
        ))}
        <div className="rounded-lg border border-line p-4">
          <div className="rounded-sm bg-surface p-3 text-sm">
            {headerType === "text" && header && <div className="mb-1 font-semibold">{header}</div>}
            {(headerType === "image" || headerType === "video" || headerType === "document") && (
              <div className="mb-2 flex h-28 items-center justify-center rounded-xs bg-surface-2 text-muted" aria-label={`${headerType} header`}>
                {headerType === "image" ? <ImageIcon size={28} /> : headerType === "video" ? <Film size={28} /> : <FileText size={28} />}
              </div>
            )}
            <div className="whitespace-pre-wrap">{render(body || "Your message appears here.", samples.map((s, i) => s || `{{${i + 1}}}`))}</div>
            {footer && <div className="mt-1 text-xs text-muted">{footer}</div>}
          </div>
          {[...buttons.filter((b) => b.text), ...(category === "MARKETING" ? [{ text: "Stop offers" }] : [])].map((b, i) => (
            <div key={i} className="mt-1 rounded-sm bg-surface py-1.5 text-center text-sm font-medium text-ink">
              {b.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
