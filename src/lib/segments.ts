import { and, arrayOverlaps, eq, inArray, isNotNull, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { Audience, SegmentCondition, SegmentRules } from "@/db/schema";

const days = z.coerce.number().int().min(1).max(3650);

export const ConditionSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("tag"), op: z.enum(["has", "lacks"]), value: z.string().trim().min(1).max(40) }),
  z.object({ field: z.literal("source"), op: z.enum(["is", "is_not"]), value: z.string().trim().min(1).max(40) }),
  z.object({
    field: z.literal("custom"),
    op: z.enum(["equals", "contains", "is_set", "is_empty"]),
    key: z.string().trim().min(1).max(60),
    value: z.string().trim().max(200).optional(),
  }),
  z.object({ field: z.literal("last_message"), op: z.enum(["within_days", "older_than_days", "never"]), days: days.optional() }),
  z.object({ field: z.literal("created"), op: z.enum(["within_days", "older_than_days"]), days }),
  z.object({ field: z.literal("opted_out"), op: z.enum(["yes", "no"]) }),
  z.object({ field: z.literal("paid_order"), op: z.enum(["any", "none", "within_days"]), days: days.optional() }),
]);

export const RulesSchema = z.object({
  match: z.enum(["all", "any"]),
  conditions: z.array(ConditionSchema).min(1, "Add at least one condition.").max(20),
});

const c = schema.contacts;
const ago = (n: number) => sql`now() - make_interval(days => ${n})`;

function paidOrderExists(sinceDays?: number) {
  return sql`exists (select 1 from orders o where o.contact_id = ${c.id} and o.payment_status = 'paid'${sinceDays ? sql` and o.paid_at > ${ago(sinceDays)}` : sql``})`;
}

function conditionSql(x: SegmentCondition): SQL {
  switch (x.field) {
    case "tag":
      return x.op === "has" ? sql`${x.value} = any(${c.tags})` : sql`not (${x.value} = any(${c.tags}))`;
    case "source":
      return x.op === "is" ? eq(c.source, x.value) : not(eq(c.source, x.value));
    case "custom": {
      const v = sql`${c.customFields} ->> ${x.key}`;
      if (x.op === "is_set") return sql`coalesce(${v}, '') <> ''`;
      if (x.op === "is_empty") return sql`coalesce(${v}, '') = ''`;
      if (x.op === "equals") return sql`lower(${v}) = lower(${x.value ?? ""})`;
      return sql`${v} ilike ${`%${(x.value ?? "").replace(/[\\%_]/g, (m) => `\\${m}`)}%`}`;
    }
    case "last_message":
      if (x.op === "never") return isNull(c.lastInboundAt);
      return x.op === "within_days" ? sql`${c.lastInboundAt} > ${ago(x.days ?? 30)}` : sql`(${c.lastInboundAt} is null or ${c.lastInboundAt} <= ${ago(x.days ?? 30)})`;
    case "created":
      return x.op === "within_days" ? sql`${c.createdAt} > ${ago(x.days)}` : sql`${c.createdAt} <= ${ago(x.days)}`;
    case "opted_out":
      return x.op === "yes" ? isNotNull(c.optedOutAt) : isNull(c.optedOutAt);
    case "paid_order":
      if (x.op === "none") return sql`not ${paidOrderExists()}`;
      return paidOrderExists(x.op === "within_days" ? (x.days ?? 30) : undefined);
  }
}

/** The SQL filter for a segment's contacts, scoped to the workspace. */
export function segmentWhere(orgId: string, rules: SegmentRules): SQL {
  const parts = rules.conditions.map(conditionSql);
  const joined = rules.match === "all" ? and(...parts) : or(...parts);
  return and(eq(c.orgId, orgId), joined ?? sql`true`)!;
}

/**
 * The filter for a campaign audience. A segment is resolved when the campaign
 * sends, so it picks up everyone who matches at that moment. A deleted segment
 * matches nobody rather than everybody.
 */
export async function audienceWhere(d: DB, orgId: string, audience: Audience): Promise<SQL> {
  const where: SQL[] = [eq(c.orgId, orgId)];
  if (audience.segmentId) {
    const [seg] = await d.select().from(schema.segments).where(and(eq(schema.segments.id, audience.segmentId), eq(schema.segments.orgId, orgId))).limit(1);
    where.push(seg ? segmentWhere(orgId, seg.rules) : sql`false`);
  }
  if (audience.tags?.length) where.push(arrayOverlaps(c.tags, audience.tags));
  if (audience.contactIds?.length) where.push(inArray(c.id, audience.contactIds));
  return and(...where)!;
}

const SOURCE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", ad: "an ad", import: "an import", api: "the API", shopify: "Shopify", woocommerce: "WooCommerce" };

/** Plain-English description of a condition, for lists and previews. */
export function describeCondition(x: SegmentCondition): string {
  switch (x.field) {
    case "tag":
      return x.op === "has" ? `tagged ${x.value}` : `not tagged ${x.value}`;
    case "source":
      return `${x.op === "is" ? "came from" : "didn't come from"} ${SOURCE_LABEL[x.value] ?? x.value}`;
    case "custom":
      if (x.op === "is_set") return `has ${x.key}`;
      if (x.op === "is_empty") return `has no ${x.key}`;
      return `${x.key} ${x.op === "equals" ? "is" : "contains"} “${x.value ?? ""}”`;
    case "last_message":
      if (x.op === "never") return "never messaged us";
      return x.op === "within_days" ? `messaged in the last ${x.days} days` : `hasn't messaged in ${x.days} days`;
    case "created":
      return x.op === "within_days" ? `added in the last ${x.days} days` : `added over ${x.days} days ago`;
    case "opted_out":
      return x.op === "yes" ? "opted out of offers" : "hasn't opted out";
    case "paid_order":
      if (x.op === "none") return "never paid for an order";
      return x.op === "any" ? "has paid for an order" : `paid for an order in the last ${x.days} days`;
  }
}

export function describeRules(r: SegmentRules) {
  return r.conditions.map(describeCondition).join(r.match === "all" ? " and " : " or ");
}

export async function countSegment(d: DB, orgId: string, rules: SegmentRules) {
  const [row] = await d.select({ n: sql<number>`count(*)` }).from(c).where(segmentWhere(orgId, rules));
  return Number(row.n);
}
