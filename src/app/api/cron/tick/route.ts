import { NextResponse } from "next/server";
import { db } from "@/db";
import { enqueuePeriodic, runDueJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Vercel Cron calls this every minute. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorised", { status: 401 });
  }
  if (!secret && process.env.NODE_ENV === "production") return new NextResponse("CRON_SECRET not set", { status: 500 });
  const d = await db();
  await enqueuePeriodic(d);
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const n = await runDueJobs(d, 50);
    total += n;
    if (!n) break;
  }
  return NextResponse.json({ ran: total });
}
