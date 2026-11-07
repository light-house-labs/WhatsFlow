"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { connectCloudNumber, type ConnectState } from "../actions";

export function ConnectForm() {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectCloudNumber, undefined);
  return (
    <form action={action} className="space-y-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Phone number ID" htmlFor="pnid">
        <Input id="pnid" name="phoneNumberId" inputMode="numeric" required autoComplete="off" />
      </Field>
      <Field label="WhatsApp Business Account ID" htmlFor="waba">
        <Input id="waba" name="wabaId" inputMode="numeric" required autoComplete="off" />
      </Field>
      <Field label="Access token" htmlFor="tok">
        <Input id="tok" name="accessToken" type="password" required autoComplete="off" />
      </Field>
      <Button className="w-full" disabled={pending}>
        {pending ? "Checking with Meta…" : "Check and connect"}
      </Button>
    </form>
  );
}
