"use client";

import "./globals.css";
import { EmptyState } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-app text-ink antialiased">
        <div className="grid min-h-dvh place-items-center px-4">
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
      </body>
    </html>
  );
}
