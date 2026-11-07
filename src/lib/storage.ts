import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { put } from "@vercel/blob";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel functions accept bodies up to 4.5 MB

export const ALLOWED_TYPES: Record<string, "image" | "document" | "video" | "audio"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "application/pdf": "document",
  "text/plain": "document",
  "text/csv": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
  "video/mp4": "video",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "audio/aac": "audio",
};

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");

/** Store bytes. Vercel Blob when BLOB_READ_WRITE_TOKEN is set, local disk otherwise. */
export async function storeBytes(id: string, name: string, contentType: string, body: Buffer): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${id}/${name}`, body, { access: "public", addRandomSuffix: true, contentType });
    return blob.url;
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, id), body);
  return `local:${id}`;
}

export async function readBytes(storageKey: string): Promise<Buffer | null> {
  if (storageKey.startsWith("local:")) {
    const id = storageKey.slice(6);
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    return readFile(path.join(LOCAL_DIR, id)).catch(() => null);
  }
  const res = await fetch(storageKey, { cache: "no-store" });
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

function signingKey() {
  return process.env.ENCRYPTION_KEY || "whatsflow-dev-only-key";
}

/** A link WhatsApp can download the file from without signing in. Valid for 7 days. */
export function signedFileUrl(fileId: string, ttlSeconds = 7 * 86400) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", signingKey()).update(`${fileId}.${exp}`).digest("base64url");
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/files/${fileId}?exp=${exp}&sig=${sig}`;
}

export function verifyFileSig(fileId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = Buffer.from(createHmac("sha256", signingKey()).update(`${fileId}.${exp}`).digest("base64url"));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/**
 * Links to our own uploads expire. Anything that keeps a link for later (a
 * template's header image) re-signs it right before handing it to WhatsApp.
 */
export function freshFileUrl(url: string) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const m = url.startsWith(`${base}/api/files/`) ? url.slice(base.length).match(/^\/api\/files\/([0-9a-f-]{36})(?:\?|$)/i) : null;
  return m ? signedFileUrl(m[1]) : url;
}
