"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";

export function MatchFields({ languages }: { languages: Record<string, string> }) {
  const [match, setMatch] = useState<"keyword" | "language">("keyword");
  return (
    <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
      <Field label="When a new chat" htmlFor="match">
        <Select id="match" name="match" value={match} onChange={(e) => setMatch(e.target.value as typeof match)}>
          <option value="keyword">mentions a word</option>
          <option value="language">is written in</option>
        </Select>
      </Field>
      {match === "keyword" ? (
        <Field label="Words" htmlFor="keywords" hint="Comma separated, e.g. refund, invoice, payment">
          <Input id="keywords" name="keywords" required />
        </Field>
      ) : (
        <fieldset>
          <legend className="section-label mb-1.5 text-faint">Languages</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(languages).map(([code, name]) => (
              <label key={code} className="flex cursor-pointer items-center gap-1.5 rounded-xs px-2.5 py-1 text-sm transition-colors duration-150 has-[:checked]:bg-accent-soft bg-fill">
                <input type="checkbox" name="languages" value={code} /> {name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Told apart by script, so Hindi and Marathi look the same, and Hinglish counts as English.</p>
        </fieldset>
      )}
    </div>
  );
}
