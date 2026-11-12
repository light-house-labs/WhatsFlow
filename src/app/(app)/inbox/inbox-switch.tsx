"use client";

import type { ComponentProps } from "react";
import { useViewport } from "@/lib/viewport";
import { InboxApp } from "./inbox-app";
import { MobileInbox } from "./mobile-inbox";

/**
 * The phone inbox and the desktop/tablet inbox are different trees with their own polling, so only one
 * mounts. Until the viewport is known (server render, hydration) a neutral skeleton holds the space.
 */
export function InboxSwitch(props: ComponentProps<typeof InboxApp>) {
  const vp = useViewport();
  if (vp === null)
    return (
      <div className="flex h-full bg-surface" aria-busy>
        <div className="w-full space-y-px md:w-72 md:border-r md:border-line lg:w-80">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse border-b border-line bg-fill/50" />
          ))}
        </div>
      </div>
    );
  if (vp === "mobile") return <MobileInbox {...props} />;
  return <InboxApp {...props} />;
}
