import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { INDUSTRIES } from "@/lib/org-setup";
import { WorkspaceForm } from "../forms";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function Page() {
  const s = await requireUser();
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Hi {s.user.name.split(" ")[0]}, let&apos;s set up your workspace</h1>
      <p className="mb-6 text-sm text-muted">Takes under a minute.</p>
      <WorkspaceForm industries={INDUSTRIES} />
    </>
  );
}
