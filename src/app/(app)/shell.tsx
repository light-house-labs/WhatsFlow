"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Full-height column next to the sidebar. The inbox and settings lay out their own columns; every other page sits on one white surface. */
export function Shell({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const own = path === "/inbox" || path.startsWith("/inbox/") || path === "/settings" || path.startsWith("/settings/");
  return (
    <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-surface">
      {banner}
      {own ? (
        <div className="min-h-0 flex-1">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface">{children}</div>
      )}
    </main>
  );
}
