"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Select } from "@/components/ui";
import { invite, type InviteState } from "../actions";

export function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(invite, undefined);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-2">
        <Input name="email" type="email" placeholder="name@business.com" aria-label="Email" required className="w-64" />
        <Select name="role" aria-label="Role" defaultValue="agent" className="w-32">
          <option value="agent">Agent</option>
          <option value="admin">Admin</option>
          {canInviteOwner && <option value="owner">Owner</option>}
        </Select>
        <Button disabled={pending}>Create invite link</Button>
      </form>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.link && (
        <Alert tone="success">
          Send this link to them (on WhatsApp, say). It works once, for that email address:
          <div className="mt-1 break-all font-mono text-xs text-ink">{state.link}</div>
        </Alert>
      )}
    </div>
  );
}
