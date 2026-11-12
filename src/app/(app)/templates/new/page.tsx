import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplateEditor } from "./editor";
import { MobileScreen } from "@/components/mobile/grouped";
import { BestOnDesktop, ViewportSwitch } from "@/components/mobile/desktop-only";

export const metadata: Metadata = { title: "New template" };

export default async function Page() {
  await requireOrg("admin");
  return (
    <ViewportSwitch
      mobile={
        <MobileScreen>
          <BestOnDesktop what="Writing a template, with its buttons, variables and preview," />
        </MobileScreen>
      }
      desktop={
        <>
          <PageHeader title="New template" description="Write it once, reuse it in replies, broadcasts and bots." />
          <TemplateEditor />
        </>
      }
    />
  );
}
