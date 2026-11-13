"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-dvh place-items-center bg-app px-4 text-ink">
      <div className="w-full max-w-md">
        <EmptyState
          variant="error"
          title="This page couldn't load"
          description="Something went wrong on our side. Try again, or go back."
          primary={{ label: "Try again", onClick: reset }}
          secondary={{ label: "Back", onClick: () => (history.length > 1 ? history.back() : (location.href = "/")) }}
          hint={error.digest ? <>Reference: {error.digest}</> : undefined}
        />
      </div>
    </div>
  );
}
