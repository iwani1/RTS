import { count, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { companies, notifications, sessions, users } from "@/db/schema";
import { ActionForm, InlineActionForm } from "@/components/action-form";
import {
  Button,
  DefinitionList,
  EmptyState,
  Field,
  Input,
  MetricCell,
  MetricStrip,
  Notice,
  PageHeader,
  Panel,
  StatusChip,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import {
  inviteUserAction,
  revokeUserSessionsAction,
  updateUserStatusAction,
} from "@/app/actions/admin";
import { changeOwnPasswordAction } from "@/app/actions/auth";
import { markNotificationsReadAction } from "@/app/actions/ops";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS, can, type Role } from "@/lib/rbac";
import { dateTime, n } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const role = user.role as Role;
  const canManageUsers = can(role, "user.manage");

  const userRows = await db
    .select({ user: users, company: companies.name })
    .from(users)
    .leftJoin(companies, eq(companies.id, users.companyId))
    .orderBy(desc(users.createdAt))
    .limit(60);

  const myNotifications = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(15);

  const [activeSessions] = await db
    .select({ v: count() })
    .from(sessions)
    .where(gt(sessions.expiresAt, new Date()));
  const [totalUsers] = await db.select({ v: count() }).from(users);
  const [mySessions] = await db
    .select({ v: count() })
    .from(sessions)
    .where(eq(sessions.userId, user.id));

  const unread = myNotifications.filter((notification) => !notification.readAt).length;

  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(companies.name);

  const myCompany = companyOptions.find((c) => c.id === user.companyId)?.name;

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Settings & user administration"
        subtitle="Your profile and credentials, portal users, invitations and the notification centre."
      />

      <MetricStrip>
        <MetricCell label="Portal users" value={n(Number(totalUsers?.v ?? 0))} />
        <MetricCell label="Active sessions" value={n(Number(activeSessions?.v ?? 0))} />
        <MetricCell label="Your sessions" value={n(Number(mySessions?.v ?? 0))} />
        <MetricCell label="Roles available" value={Object.keys(ROLE_LABELS).length} />
        <MetricCell
          label="Unread notifications"
          value={n(unread)}
          tone={unread > 0 ? "caution" : "ok"}
        />
        <MetricCell
          label="Two-factor"
          value={user.twoFactorEnabled ? "On" : "Off"}
          tone={user.twoFactorEnabled ? "ok" : "idle"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="My profile" eyebrow="Account">
          <DefinitionList
            items={[
              { label: "Name", value: user.fullName },
              { label: "Email", value: user.email },
              { label: "Role", value: ROLE_LABELS[role] },
              {
                label: "Client scope",
                value: myCompany ?? "Platform (all clients)",
              },
              { label: "Two-factor", value: user.twoFactorEnabled ? "Enabled" : "Disabled" },
            ]}
          />
          <div className="mt-4">
            <p className="eyebrow mb-1.5">Your permissions</p>
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              {grantedSummary(role)}
            </p>
          </div>
          <form action="/api/auth/logout" method="post" className="mt-4">
            <Button type="submit" variant="danger" className="w-full">
              Sign out of this device
            </Button>
          </form>
        </Panel>

        <Panel
          title="Change password"
          subtitle="Signs every other device out"
          eyebrow="Credentials"
        >
          <ActionForm action={changeOwnPasswordAction} submitLabel="Update password">
            <div className="space-y-3">
              <Field label="Current password" name="currentPassword" type="password" required />
              <Field
                label="New password"
                name="newPassword"
                type="password"
                required
                hint="At least 8 characters."
              />
              <Field label="Confirm new password" name="confirmPassword" type="password" required />
            </div>
          </ActionForm>
        </Panel>

        <Panel
          title="Notification centre"
          eyebrow="Inbox"
          padded={false}
          className="lg:col-span-3"
          actions={
            <InlineActionForm
              action={markNotificationsReadAction}
              hiddenFields={{}}
              submitLabel="Mark all read"
              variant="ghost"
            />
          }
        >
          <ul className="divide-y divide-line">
            {myNotifications.map((notification) => (
              <li
                key={notification.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{notification.title}</p>
                  <p className="text-[12.5px] text-ink-2">{notification.body}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {notification.category} · {notification.channel} ·{" "}
                    {dateTime(notification.createdAt)}
                  </p>
                </div>
                <StatusChip
                  tone={notification.readAt ? "idle" : "live"}
                  label={notification.readAt ? "Read" : "Unread"}
                />
              </li>
            ))}
            {!myNotifications.length ? (
              <li className="px-4 py-8">
                <EmptyState title="No notifications yet" />
              </li>
            ) : null}
          </ul>
          <div className="border-t border-line p-3">
            <Notice tone="caution">
              In-app notifications are persisted and delivered on login. Email, SMS and
              push delivery require provider credentials (SMTP, Arkesel, an SMS gateway
              or Firebase) — none are configured in this environment, so those channels
              are not claimed as working.
            </Notice>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Portal users & invitations"
          eyebrow="Directory"
          padded={false}
          className="lg:col-span-2"
        >
          <TableWrap>
            <THead>
              <TH>User</TH>
              <TH>Role</TH>
              <TH>Client scope</TH>
              <TH>2FA</TH>
              <TH>Status</TH>
              <TH align="right">Last login</TH>
              <TH align="right">Actions</TH>
            </THead>
            <TBody>
              {userRows.map((row) => (
                <TR key={row.user.id}>
                  <TDPrimary>
                    <p>{row.user.fullName}</p>
                    <p className="text-[11.5px] font-normal text-ink-3">{row.user.email}</p>
                  </TDPrimary>
                  <TD>{ROLE_LABELS[row.user.role as Role]}</TD>
                  <TD>{row.company ?? "Platform"}</TD>
                  <TD>
                    {row.user.twoFactorEnabled ? (
                      <StatusChip tone="ok" label="On" />
                    ) : (
                      <StatusChip tone="idle" label="Off" />
                    )}
                  </TD>
                  <TD>
                    <StatusChip status={row.user.status} />
                  </TD>
                  <TD align="right">
                    {row.user.lastLoginAt ? dateTime(row.user.lastLoginAt) : "never"}
                  </TD>
                  <TD>
                    {canManageUsers ? (
                      <div className="flex items-center justify-end gap-1">
                        <InlineActionForm
                          action={updateUserStatusAction}
                          hiddenFields={{
                            id: row.user.id,
                            status: row.user.status === "active" ? "suspended" : "active",
                          }}
                          submitLabel={row.user.status === "active" ? "Suspend" : "Activate"}
                          variant="ghost"
                          confirm={
                            row.user.status === "active"
                              ? `Suspend ${row.user.email}?`
                              : undefined
                          }
                        />
                        <InlineActionForm
                          action={revokeUserSessionsAction}
                          hiddenFields={{ id: row.user.id }}
                          submitLabel="Sign out"
                          variant="ghost"
                          confirm={`Sign ${row.user.email} out of every device?`}
                        />
                      </div>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!userRows.length ? (
            <div className="p-4">
              <EmptyState title="No users" />
            </div>
          ) : null}
        </Panel>

        {canManageUsers ? (
          <Panel
            title="Invite a user"
            subtitle="The temporary password is shown once"
            eyebrow="Provisioning"
          >
            <ActionForm action={inviteUserAction} submitLabel="Create account" resetOnSuccess>
              <div className="space-y-3">
                <Field label="Full name" name="fullName" required />
                <Field label="Email" name="email" type="email" required />
                <Field label="Phone" name="phone" type="tel" />
                <Field
                  label="Role"
                  name="role"
                  required
                  options={Object.entries(ROLE_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                <Field
                  label="Client scope"
                  name="companyId"
                  options={[
                    { value: "", label: "Platform (all clients)" },
                    ...companyOptions.map((c) => ({ value: String(c.id), label: c.name })),
                  ]}
                  hint="Driver accounts must be scoped to a client."
                />
              </div>
            </ActionForm>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
              Privileged roles (super admin, operations manager, finance officer) are
              provisioned with two-factor authentication enabled.
            </p>
          </Panel>
        ) : (
          <Panel title="Platform configuration" eyebrow="Environment">
            <DefinitionList
              items={[
                { label: "Currency", value: "GHS (Ghana Cedi)" },
                { label: "Timezone", value: "Africa/Accra (GMT)" },
                { label: "Mapping provider", value: "Demo vector map" },
                { label: "Payment provider", value: "Interface only — no credentials" },
                { label: "Session lifetime", value: "7 days" },
                { label: "GPS retention", value: "90 days" },
              ]}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}

/** A plain-language summary of what the signed-in role may do. */
function grantedSummary(role: Role): string {
  const grants: string[] = [];
  if (can(role, "company.manage")) grants.push("company management");
  if (can(role, "employee.manage")) grants.push("employee registration");
  if (can(role, "vehicle.manage")) grants.push("fleet administration");
  if (can(role, "driver.manage")) grants.push("driver administration");
  if (can(role, "trip.dispatch")) grants.push("dispatch");
  if (can(role, "booking.approve")) grants.push("booking approval");
  if (can(role, "incident.manage")) grants.push("incident management");
  if (can(role, "finance.manage")) grants.push("finance and payroll");
  if (can(role, "audit.view")) grants.push("the audit trail");
  if (can(role, "user.manage")) grants.push("user administration");
  if (!grants.length) return "Read-only access to your own records.";
  return `Your role grants access to ${grants.join(", ")}.`;
}
