"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/bottom-sheet";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { CopyLinkButton } from "@/components/mobile/desktop-only";
import { StatusBadge } from "@/components/ui";
import { submitTemplate } from "./actions";

export type MobileTemplate = { id: string; name: string; category: string; language: string; body: string; status: string; rejectionReason: string | null; updated: string };

/** Template row; tapping opens the full message, its review status, and Submit for approval for drafts. */
export function TemplateRow({ t, canEdit }: { t: MobileTemplate; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="group/row">
      <button type="button" onClick={() => setOpen(true)} className="tap flex min-h-14 w-full items-center gap-3 pl-4 text-left active:bg-fill">
        <span className="flex min-h-14 min-w-0 flex-1 items-center gap-3 border-b border-line py-2.5 pr-4 group-last/row:border-0">
          <span className="min-w-0 flex-1">
            <span className="row-title block truncate">{t.name}</span>
            <span className="row-meta block truncate">{t.body}</span>
          </span>
          <StatusBadge status={t.status} />
        </span>
      </button>
      {open && (
        <BottomSheet
          title={t.name}
          onClose={() => setOpen(false)}
          footer={
            <div className="flex gap-2 [&>*]:h-12 [&>*]:flex-1 [&>*]:text-base">
              <CopyLinkButton path="/templates" />
              {canEdit && (t.status === "draft" || t.status === "rejected") && (
                <SaveForm action={submitTemplate} success="Submitted for approval" onSaved={() => setOpen(false)} className="flex">
                  <input type="hidden" name="id" value={t.id} />
                  <SubmitButton className="h-12 w-full text-base" savingLabel="Submitting…" savedLabel="Submitted">
                    Submit for approval
                  </SubmitButton>
                </SaveForm>
              )}
            </div>
          }
        >
          <div className="space-y-4 px-4 pb-4">
            <div className="flex flex-wrap items-center gap-2 text-13 text-faint">
              <StatusBadge status={t.status} /> {t.category.toLowerCase()} · {t.language} · updated {t.updated}
            </div>
            {t.rejectionReason && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">Rejected: {t.rejectionReason}</p>}
            <div className="rounded-xl bg-[var(--wf-wa-bg)] p-3">
              <div className="ml-auto max-w-[88%] rounded-lg bg-[var(--wf-wa-out)] px-3 py-2 text-[15px] leading-5 whitespace-pre-wrap">{t.body}</div>
            </div>
            <p className="text-13 text-faint">Templates are written and edited on a computer.</p>
          </div>
        </BottomSheet>
      )}
    </li>
  );
}
