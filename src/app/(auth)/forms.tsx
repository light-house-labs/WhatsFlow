"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { createOrg, login, signup, type FormState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button className="w-full" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link className="font-medium text-accent" href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, undefined);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required defaultValue={f.name} />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={f.email} />
      </Field>
      <Field label="Mobile (optional)" htmlFor="phone" hint="So our team can reach you on WhatsApp if you ask for help.">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" defaultValue={f.phone} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="terms" className="mt-0.5" required /> I agree to the Terms and Privacy Policy.
      </label>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" name="marketing" className="mt-0.5" /> Send me product tips now and then. (Optional, unsubscribe any time.)
      </label>
      <Button className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Start 14-day trial"}
      </Button>
      <p className="text-center text-xs text-muted">No card needed. Cancel any time from Billing, in one click.</p>
      <p className="text-center text-sm text-muted">
        Have an account?{" "}
        <Link className="font-medium text-accent" href="/login">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function WorkspaceForm({ industries }: { industries: readonly string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrg, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Business name" htmlFor="name" hint="Customers see this in automatic replies.">
        <Input id="name" name="name" required placeholder="Sunrise Dental" />
      </Field>
      <Field label="What kind of business?" htmlFor="industry">
        <Select id="industry" name="industry" defaultValue="">
          <option value="">Choose one</option>
          {industries.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </Select>
      </Field>
      <Button className="w-full" disabled={pending}>
        {pending ? "Setting up…" : "Create workspace"}
      </Button>
      <p className="text-xs text-muted">
        We add a sandbox WhatsApp number so you can try everything right away. Connect your real number from Settings when you&apos;re ready.
      </p>
    </form>
  );
}
