import type { Metadata } from "next";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Payment received", robots: { index: false } };

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 p-4">
      <Card className="max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold">Payment received</h1>
        <p className="mt-2 text-sm text-muted">Thank you. You&apos;ll get a confirmation on WhatsApp. You can close this page.</p>
      </Card>
    </main>
  );
}
