import { Users } from "lucide-react";
import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { limitsFor } from "@/lib/plans";
import { timeAgo } from "@/lib/format";
import { Select, Table, Td, Th } from "@/components/ui";
import { SettingsPage } from "@/components/settings-page";
import { SettingsSection } from "@/components/settings";
import { changeRole, removeMember, revokeInvite } from "../actions";
import { InviteForm, InviteMemberButton } from "./invite-form";
import { SaveForm, SubmitButton } from "@/components/save-form";

export const metadata: Metadata = { title: "Team" };

export default async function Page() {
  const { db: d, org, user, role } = await requireOrg("admin");
  const [members, invites] = await Promise.all([
    d.select({ m: schema.memberships, u: schema.users }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, org.id)),
    d.select().from(schema.invites).where(and(eq(schema.invites.orgId, org.id), isNull(schema.invites.acceptedAt))),
  ]);
  const seats = limitsFor(org.plan).seats;
  return (
    <SettingsPage title="Team" summary={`${members.length} of ${seats} seats used · ${invites.length} pending ${invites.length === 1 ? "invite" : "invites"} · you are ${role}`} status={[{ label: "Seats used", value: `${members.length} of ${seats}`, tone: members.length >= seats ? "warn" : "on" }, { label: "Pending invites", value: String(invites.length), tone: invites.length ? "warn" : "off" }, { label: "Your role", value: role, tone: "on" }]} tips={["Agents work the inbox; admins also change settings.", "Only an owner can make another owner.", "Revoke an invite if it went to the wrong address."]}>
      <SettingsSection title="Members" description={`${members.length} of ${seats} seats used on your plan. Everyone with access to this workspace.`} flush>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {members.map(({ m, u }) => (
                <tr key={u.id}>
                  <Td className="font-medium">
                    {u.name}
                    {u.id === user.id && <span className="ml-1 text-xs text-muted">(you)</span>}
                  </Td>
                  <Td className="text-muted">{u.email}</Td>
                  <Td>
                    {u.id === user.id || (m.role === "owner" && role !== "owner") ? (
                      m.role
                    ) : (
                      <SaveForm action={changeRole} success="Role changed" className="flex gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <Select name="role" defaultValue={m.role} aria-label={`Role for ${u.name}`} className="h-8 w-32 text-13">
                          <option value="agent">Agent</option>
                          <option value="admin">Admin</option>
                          {role === "owner" && <option value="owner">Owner</option>}
                        </Select>
                        <SubmitButton size="sm" variant="secondary">
                          Save
                        </SubmitButton>
                      </SaveForm>
                    )}
                  </Td>
                  <Td>
                    {u.id !== user.id && !(m.role === "owner" && role !== "owner") && (
                      <SaveForm action={removeMember} success="Member removed">
                        <input type="hidden" name="userId" value={u.id} />
                        <SubmitButton size="sm" variant="ghost" className="text-danger">
                          Remove
                        </SubmitButton>
                      </SaveForm>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {members.length <= 1 && (
            <div className="flex flex-col items-center gap-1 px-6 py-8 text-center">
              <div className="mb-2 grid size-8 place-items-center rounded-full bg-fill text-muted [&>svg]:size-4">
                <Users strokeWidth={1.75} aria-hidden />
              </div>
              <h3 className="text-sm font-semibold text-ink">It&apos;s just you so far</h3>
              <p className="max-w-[400px] text-sm text-muted">Invite teammates to share the inbox, tickets and pipeline.</p>
              <div className="mt-3">
                <InviteMemberButton />
              </div>
            </div>
          )}
      </SettingsSection>
      <SettingsSection id="invite" title="Invite someone" description="Agents work the inbox, contacts, pipeline and tickets. Admins can also change settings, templates, campaigns and bots. Owners manage billing.">
          <InviteForm canInviteOwner={role === "owner"} />
          {invites.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1">
                    {i.email} · {i.role} · sent {timeAgo(i.createdAt)}
                  </span>
                  <SaveForm action={revokeInvite} success="Invite revoked">
                    <input type="hidden" name="id" value={i.id} />
                    <SubmitButton size="sm" variant="ghost">
                      Revoke
                    </SubmitButton>
                  </SaveForm>
                </li>
              ))}
            </ul>
          )}
      </SettingsSection>
    </SettingsPage>
  );
}
