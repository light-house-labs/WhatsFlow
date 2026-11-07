import type { Metadata } from "next";
import { SignupForm } from "../forms";

export const metadata: Metadata = { title: "Create account" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-muted">Shared WhatsApp inbox, bots and broadcasts for your team.</p>
      <SignupForm next={next} />
    </>
  );
}
