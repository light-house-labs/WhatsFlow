"use client";

import { useState } from "react";
import { Alert, Button, Input, Select } from "@/components/ui";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { invite } from "../actions";

export function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <SaveForm
        action={async (form) => {
          setLink(null);
          const r = await invite(undefined, form);
          if (r?.link) setLink(r.link);
          return r;
        }}
        success="Invite link created"
        className="flex flex-wrap items-center gap-2"
      >
        <Input name="email" type="email" placeholder="name@business.com" aria-label="Email" required className="w-64" />
        <Select name="role" aria-label="Role" defaultValue="agent" className="w-32">
          <option value="agent">Agent</option>
          <option value="admin">Admin</option>
          {canInviteOwner && <option value="owner">Owner</option>}
        </Select>
        <SubmitButton savedLabel="Created">Create invite link</SubmitButton>
      </SaveForm>
      {link && (
        <Alert tone="success">
          Send this link to them (on WhatsApp, say). It works once, for that email address:
          <div className="mt-1 break-all text-xs text-ink">{link}</div>
        </Alert>
      )}
    </div>
  );
}

/** Scrolls to the Invite card and focuses its email input. Used by every "Invite member" button. */
export function InviteMemberButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        const card = document.getElementById("invite");
        card?.scrollIntoView({ behavior: "smooth", block: "start" });
        card?.querySelector<HTMLInputElement>('input[name="email"]')?.focus({ preventScroll: true });
      }}
    >
      Invite member
    </Button>
  );
}
