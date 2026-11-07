"use client";

import { useState } from "react";
import { Input } from "./ui";

/** A URL field with an "Upload" button that stores the file and fills in a link to it. */
export function UploadField({ name, label, accept, defaultValue }: { name: string; label: string; accept: string; defaultValue?: string }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/files", { method: "POST", body });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    setBusy(false);
    if (!res.ok || !json.url) setError(json.error ?? "Upload failed.");
    else setUrl(json.url);
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-[13px] font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <Input id={name} name={name} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or upload" />
        <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line px-3 text-sm hover:bg-surface-2">
          {busy ? "Uploading…" : "Upload"}
          <input type="file" accept={accept} className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
