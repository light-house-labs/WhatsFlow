"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the server page on an interval while something is in progress. */
export function AutoRefresh({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
