import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readBytes, verifyFileSig } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Serve an uploaded file to anyone holding an unexpired signed link (WhatsApp's servers, the browser). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  if (!verifyFileSig(id, url.searchParams.get("exp"), url.searchParams.get("sig"))) return new Response("Link expired or invalid", { status: 403 });
  const d = await db();
  const [f] = await d.select().from(schema.files).where(eq(schema.files.id, id)).limit(1);
  if (!f) return new Response("Not found", { status: 404 });
  const body = await readBytes(f.storageKey);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": f.contentType,
      "Content-Disposition": `${f.contentType.startsWith("image/") ? "inline" : "attachment"}; filename="${f.name}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
