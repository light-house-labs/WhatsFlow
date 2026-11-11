"use client";

import { Field, Input } from "@/components/ui";
import { SaveForm, SubmitButton } from "@/components/save-form";
import { connectCloudNumber } from "../actions";

export function ConnectForm() {
  return (
    <SaveForm action={(form) => connectCloudNumber(undefined, form)} success="Number connected" className="space-y-3">
      <Field label="Phone number ID" htmlFor="pnid">
        <Input id="pnid" name="phoneNumberId" inputMode="numeric" required autoComplete="off" />
      </Field>
      <Field label="WhatsApp Business Account ID" htmlFor="waba">
        <Input id="waba" name="wabaId" inputMode="numeric" required autoComplete="off" />
      </Field>
      <Field label="Access token" htmlFor="tok">
        <Input id="tok" name="accessToken" type="password" required autoComplete="off" />
      </Field>
      <SubmitButton className="w-full" savingLabel="Checking with Meta…" savedLabel="Connected">
        Check and connect
      </SubmitButton>
    </SaveForm>
  );
}
