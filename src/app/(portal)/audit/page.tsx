import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, companies } from "@/db/schema";
import {
  EmptyState,
  MetricStrip,
  MetricCell,
  PageHeader,
  Panel,
  TableWrap,
  TBody,
  TD,
  TDPrimary,
  THead,
  TH,
  TR,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { requireSection } from "@/lib/auth";
import { dateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string }>;
}) {
  await requireSection("audit");
  const { q = "", action = "" } = await searchParams;

  const filters = [
    q
      ? or(
          ilike(auditLogs.actorEmail, `%${q}%`),
          ilike(auditLogs.action, `%${q}%`),
          ilike(auditLogs.entity, `%${q}%`),
        )
      : undefined,
    action ? eq(auditLogs.action, action) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({ log: auditLogs, company: companies.name })
    .from(auditLogs)
    .leftJoin(companies, eq(companies.id, auditLogs.companyId))
    .where(filters.length ? filters[0] : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(150);

  const byAction = await db
    .select({ action: auditLogs.action, v: sql<number>`count(*)` })
    .from(auditLogs)
    .groupBy(auditLogs.action)
    .orderBy(sql`count(*) desc`)
    .limit(8);

  const total = byAction.reduce((s, a) => s + Number(a.v), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Audit trail"
        subtitle="Immutable record of every privileged action, with actor, entity, tenant and payload."
      />

      <MetricStrip>
        <MetricCell label="Log entries" value={total} />
        <MetricCell label="Distinct actions" value={byAction.length} />
        <MetricCell
          label="Most frequent"
          value={byAction[0]?.action ?? "—"}
          hint="action type"
        />
        <MetricCell
          label="Retention policy"
          value="24 months"
          hint="GPS events 90 days, sessions 7 days"
        />
      </MetricStrip>

      <Panel className="mt-4" title="Search the trail">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="q" className="font-display text-[12.5px] font-medium text-ink-2">
              Free text
            </label>
            <Input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Actor email, action or entity"
              className="w-[250px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="action"
              className="font-display text-[12.5px] font-medium text-ink-2"
            >
              Action
            </label>
            <Select id="action" name="action" defaultValue={action} className="w-[250px]">
              <option value="">All actions</option>
              {byAction.map((a) => (
                <option key={a.action} value={a.action}>
                  {a.action} ({Number(a.v)})
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="signal" size="sm">
            Search
          </Button>
        </form>
      </Panel>

      <Panel className="mt-4" title="Recent activity" padded={false}>
        <TableWrap>
          <THead>
            <TR>
              <TH>Timestamp</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Client</TH>
              <TH>Details</TH>
              <TH>IP</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.log.id}>
                <TD className="numeric whitespace-nowrap text-[12px]">
                  {dateTime(r.log.createdAt)}
                </TD>
                <TD>{r.log.actorEmail ?? "system"}</TD>
                <TDPrimary className="numeric text-[12px]">{r.log.action}</TDPrimary>
                <TD>
                  {r.log.entity}
                  {r.log.entityId ? ` #${r.log.entityId}` : ""}
                </TD>
                <TD>{r.company ?? "—"}</TD>
                <TD>
                  <span className="line-clamp-1 text-[11.5px] text-ink-3">
                    {r.log.details ? JSON.stringify(r.log.details) : "—"}
                  </span>
                </TD>
                <TD className="numeric text-[11.5px]">{r.log.ip ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
        {!rows.length ? (
          <div className="p-4">
            <EmptyState title="No audit entries match your search" />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
