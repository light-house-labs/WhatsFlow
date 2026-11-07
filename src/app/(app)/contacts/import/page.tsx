import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import contacts" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tag?: string; for?: string }> }) {
  const sp = await searchParams;
  await requireOrg();
  return (
    <>
      <PageHeader title="Import contacts" description="Upload a CSV from Excel, Google Sheets or another CRM. Existing numbers are updated, never duplicated." />
      <Importer initialTag={sp.tag?.slice(0, 40) ?? ""} forCampaign={sp.for === "campaign"} />
    </>
  );
}
