import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, signedFileUrl, storeBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Upload a file for sending in chat or showing in the catalog. Returns a signed link WhatsApp can fetch. */
export async function POST(req: Request) {
  const ctx = await orgOrNull();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files can be up to 4 MB. For bigger files, paste a link instead." }, { status: 413 });
  const kind = ALLOWED_TYPES[file.type];
  if (!kind) return NextResponse.json({ error: "WhatsApp can't send that file type. Use JPG, PNG, PDF, Office documents, MP4 or MP3." }, { status: 415 });
  const id = randomUUID();
  const name = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  const storageKey = await storeBytes(id, name, file.type, Buffer.from(await file.arrayBuffer()));
  await ctx.db.insert(schema.files).values({ id, orgId: ctx.org.id, name, contentType: file.type, size: file.size, storageKey, uploadedBy: ctx.user.id });
  return NextResponse.json({ id, url: signedFileUrl(id), kind, name });
}
