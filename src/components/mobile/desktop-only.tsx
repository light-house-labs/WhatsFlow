"use client";

import { useState, type ReactNode } from "react";
import { Check, Link2, Monitor } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { haptic } from "@/lib/haptics";
import { useViewport } from "@/lib/viewport";

/**
 * Mounts exactly one of two trees: `mobile` below 768px, `desktop` otherwise. For screens where the phone
 * version is a different component (an editor canvas vs a summary), not just a restyle.
 */
export function ViewportSwitch({ mobile, desktop }: { mobile: ReactNode; desktop: ReactNode }) {
  const vp = useViewport();
  if (vp === null) return null;
  return <>{vp === "mobile" ? mobile : desktop}</>;
}

/** Copies this screen's URL so it can be opened on a computer. */
export function CopyLinkButton({ path, className }: { path?: string; className?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      className={className}
      onClick={async () => {
        const url = new URL(path ?? location.pathname + location.search, location.origin).toString();
        try {
          await navigator.clipboard.writeText(url);
          haptic("tap");
          setDone(true);
          toast.success("Link copied. Open it on your computer.");
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast.error("Couldn't copy. Long-press the address bar to copy the link instead.");
        }
      }}
    >
      {done ? <Check size={16} strokeWidth={2} /> : <Link2 size={16} strokeWidth={1.75} />} {done ? "Copied" : "Copy link"}
    </Button>
  );
}

/** Notice for editors that need a big screen (flow builder, template editor). */
export function BestOnDesktop({ what, path }: { what: string; path?: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-surface px-6 py-8 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-fill text-muted">
        <Monitor size={22} strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="text-base font-semibold">Best edited on desktop</h2>
      <p className="mt-1 max-w-xs text-sm text-muted">{what} needs a bigger screen. Copy the link and open it on your computer.</p>
      <CopyLinkButton path={path} className="mt-4 h-11 px-5 text-base" />
    </div>
  );
}
