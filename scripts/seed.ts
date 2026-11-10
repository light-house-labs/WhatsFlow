/**
 * Fill a local database with a demo workspace: npm run db:seed
 * Log in with the account in scripts/dev-account.ts. Safe to run twice.
 * Stop the dev server first: the embedded database allows one process at a time.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/crypto";
import { createWorkspace } from "../src/lib/org-setup";
import { handleInbound } from "../src/lib/wa/inbound";
import { DEV_ACCOUNT } from "./dev-account";

const CUSTOMERS = [
  { waId: "919845012345", name: "Priya Nair", tags: ["vip", "implants"], says: "Hi, how much is a dental implant?" },
  { waId: "919810054321", name: "Arjun Mehta", tags: ["whitening"], says: "Do you have a slot on Saturday?" },
  { waId: "919900011122", name: "Fatima Sheikh", tags: ["vip"], says: "My crown came loose, can someone help?" },
  { waId: "919876598765", name: "Rahul Verma", tags: [], says: "What are your timings?" },
  { waId: "447700900456", name: "Emma Clarke", tags: ["abroad"], says: "I'm visiting Kochi next month, can I book a cleaning?" },
];

async function main() {
  const d = await db();
  let [user] = await d.select().from(schema.users).where(eq(schema.users.email, DEV_ACCOUNT.email)).limit(1);
  if (!user) {
    [user] = await d
      .insert(schema.users)
      .values({ email: DEV_ACCOUNT.email, name: DEV_ACCOUNT.name, passwordHash: await hashPassword(DEV_ACCOUNT.password), isStaff: true })
      .returning();
  } else {
    // keep the stored hash in step with scripts/dev-account.ts if that file was edited after the first seed
    await d.update(schema.users).set({ passwordHash: await hashPassword(DEV_ACCOUNT.password) }).where(eq(schema.users.id, user.id));
  }
  const [existing] = await d
    .select({ org: schema.orgs })
    .from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, user.id))
    .limit(1);
  const org = existing?.org ?? (await createWorkspace(d, user.id, "Sunrise Dental", "Clinic or healthcare"));
  const [number] = await d.select().from(schema.waNumbers).where(eq(schema.waNumbers.orgId, org.id)).limit(1);

  for (const [i, c] of CUSTOMERS.entries()) {
    await handleInbound(d, number, {
      waMessageId: `seed.${org.id}.${i}`,
      from: c.waId,
      profileName: c.name,
      type: "text",
      text: c.says,
      timestamp: new Date(Date.now() - (CUSTOMERS.length - i) * 37 * 60_000),
    });
    if (c.tags.length) await d.update(schema.contacts).set({ tags: c.tags }).where(eq(schema.contacts.waId, c.waId));
  }

  await d
    .insert(schema.templates)
    .values([
      { orgId: org.id, name: "appointment_reminder", category: "UTILITY", body: "Hi {{1}}, a reminder of your appointment on {{2}}. Reply 1 to confirm or 2 to reschedule.", status: "approved" },
      { orgId: org.id, name: "checkup_offer", category: "MARKETING", body: "Hi {{1}}, it's been six months. Book a check-up this month and get a free cleaning.", status: "approved", buttons: [{ type: "QUICK_REPLY", text: "Stop offers" }] },
    ])
    .onConflictDoNothing();

  console.log(`Seeded “${org.name}”. Log in as ${DEV_ACCOUNT.email} (password in scripts/dev-account.ts).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
