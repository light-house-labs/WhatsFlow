"use client";

import { usePathname } from "next/navigation";
import { Suspense, ViewTransition, type ReactNode } from "react";
import { MobileChrome } from "@/components/mobile/mobile-shell";
import { useViewport } from "@/lib/viewport";

type MobileProps = { unread: number; userId: string; vapidKey: string | null };

/**
 * Full-height column next to the sidebar. The inbox and settings lay out their own columns; every other page sits on one white surface.
 * Below 768px the same column becomes the phone shell: header on top, tab bar at the bottom, pages sliding in and out.
 */
export function Shell({ banner, mobile, children }: { banner?: ReactNode; mobile: MobileProps; children: ReactNode }) {
  const path = usePathname();
  const phone = useViewport() === "mobile";
  const own = path === "/inbox" || path.startsWith("/inbox/") || path === "/settings" || path.startsWith("/settings/");
  // Same element on every layout; only the class changes, so crossing the breakpoint never remounts the page.
  const slide = phone ? "wf-page" : "none";
  return (
    <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-surface max-md:h-dvh">
      <Suspense>
        <MobileChrome position="top" {...mobile} />
      </Suspense>
      {banner}
      <ViewTransition key={path} enter={slide} exit={slide} default="none">
        {own ? (
          <div className="min-h-0 flex-1">{children}</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto bg-surface max-md:overscroll-contain">{children}</div>
        )}
      </ViewTransition>
      <Suspense>
        <MobileChrome position="bottom" {...mobile} />
      </Suspense>
    </main>
  );
}
