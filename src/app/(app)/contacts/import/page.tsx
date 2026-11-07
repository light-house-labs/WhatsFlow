import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import contacts" };

export default async function Page() {
  await requireOrg();
  return (
    <>
      <PageHeader title="Import contacts" description="Upload a CSV from Excel, Google Sheets or another CRM. Existing numbers are updated, never duplicated." />
      <Importer />
    </>
  );
}
