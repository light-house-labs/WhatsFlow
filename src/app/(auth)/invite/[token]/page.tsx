import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { acceptInvite } from "../../actions";

const ERRORS: Record<string, string> = {
  used: "This invite was already used or doesn't exist.",
  email: "This invite was sent to a different email address. Log in with that email.",
  seats: "This workspace has no free seats. Ask the owner to upgrade or remove someone.",
};

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const d = await db();
  const [inv] = await d
    .select({ invite: schema.invites, org: schema.orgs })
    .from(schema.invites)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.invites.orgId))
    .where(and(eq(schema.invites.tokenHash, sha256(token)), isNull(schema.invites.acceptedAt)))
    .limit(1);
  const session = await getSession();
  if (!inv) return <Alert tone="danger">{ERRORS.used}</Alert>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Join {inv.org.name}</h1>
      <p className="text-sm text-muted">
        You&apos;ve been invited as <strong>{inv.invite.role}</strong> ({inv.invite.email}).
      </p>
      {error && <Alert tone="danger">{ERRORS[error] ?? "Something went wrong."}</Alert>}
      {session ? (
        <form action={acceptInvite}>
          <input type="hidden" name="token" value={token} />
          <Button className="w-full">Accept invite</Button>
        </form>
      ) : (
        <div className="flex gap-2">
          <ButtonLink className="flex-1" href={`/signup?next=/invite/${token}`}>
            Create account
          </ButtonLink>
          <ButtonLink variant="secondary" className="flex-1" href={`/login?next=/invite/${token}`}>
            Log in
          </ButtonLink>
        </div>
      )}
      <p className="text-xs text-muted">
        <Link href="/">What is WhatsFlow?</Link>
      </p>
    </div>
  );
}
