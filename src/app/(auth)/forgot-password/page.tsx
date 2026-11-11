import type { Metadata } from "next";
import { ForgotForm } from "../forms";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return (
    <>
      <h1 className="mb-1 type-title">Reset your password</h1>
      <p className="mb-6 text-sm text-muted">We&apos;ll email you a link.</p>
      <ForgotForm />
    </>
  );
}
