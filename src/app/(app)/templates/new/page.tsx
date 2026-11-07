import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplateEditor } from "./editor";

export const metadata: Metadata = { title: "New template" };

export default async function Page() {
  await requireOrg("admin");
  return (
    <>
      <PageHeader title="New template" description="Write it once, reuse it in replies, broadcasts and bots." />
      <TemplateEditor />
    </>
  );
}
