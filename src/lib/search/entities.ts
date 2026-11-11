import { sql, type SQL } from "drizzle-orm";
import { rowsOf, type DB } from "@/db";
import type { Role } from "@/db/schema";
import { formatWaId } from "@/lib/phone";
import { formatMoney } from "@/lib/plans";
import { ADMIN_TYPES, ENTITY_TYPES, phoneDigits, parseDay, type EntityType, type SearchGroup, type SearchHit } from "./query";

/**
 * Similarity floors for fuzzy matches. pg_trgm's `%` (whole field) and `<%` (best matching word, for a
 * typo in one word of "Priya Nair") read these settings, so the trigram indexes still apply.
 */
const SIMILARITY = 0.25;
const WORD_SIMILARITY = 0.5;
const PER_TYPE = 5;
const MESSAGE_DAYS = 90;

type Row = {
  type: EntityType;
  id: string;
  title: string | null;
  a: string | null;
  b: string | null;
  c: string | null;
  d: string | null;
  at: string | Date | null;
};

type SearchOpts = { orgId: string; role: Role; timezone: string; q: string; types?: EntityType[]; numbersOnly?: boolean; allMessages?: boolean };

const esc = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/** The query as wf_norm() sees it: `n` folded, `e` folded with LIKE wildcards escaped. */
type Norm = { n: string; e: string };

/**
 * The query goes in as plain bound values, already folded by the database, so the planner sees
 * constant patterns and can use the trigram indexes.
 */
function matchers({ n, e }: Norm) {
  const contains = `%${e}%`;
  /** Contains the query, or (for short fields) is similar enough to it. Fields are normalised SQL expressions. */
  const hit = (fields: string[], fuzzy: string[] = []) =>
    sql`(${sql.join([...fields.map((f) => sql`${sql.raw(f)} ilike ${contains}`), ...fuzzy.flatMap((f) => [sql`${sql.raw(f)} % ${n}`, sql`${n} <% ${sql.raw(f)}`])], sql` or `)})`;
  /**
   * Top rows of one type. Rank: 3 `field` starts with the query, 2 a word in it does, 1 it contains it,
   * 0 a fuzzy match only (or `boost`, if higher); then similarity, then recency. The inner query works
   * out `field` once per row (OFFSET 0 keeps the planner from inlining it back into every CASE arm).
   */
  const part = (type: EntityType, p: Part) => {
    const inner = sql`select ${sql.raw(p.cols)}, ${sql.raw(p.field)} as nf, ${p.boost ?? sql`0`} as boost ${p.from} ${p.newest ? sql`order by at desc nulls last limit ${p.newest}` : sql`offset 0`}`;
    const sim = p.fuzzy ? sql`coalesce(greatest(similarity(x.nf, ${n}), word_similarity(${n}, x.nf)), 0)` : sql`0`;
    return sql`(select ${type}::text as type, x.id, x.title, x.a, x.b, x.c, x.d, x.at,
        greatest(x.boost, case when x.nf like ${e + "%"} then 3 when x.nf like ${"% " + e + "%"} then 2 when x.nf like ${contains} then 1 else 0 end) as rk,
        (${sim})::real as sim
      from (${inner}) x order by rk desc, sim desc, x.at desc nulls last limit ${p.limit ?? PER_TYPE})`;
  };
  return { hit, part };
}

type Part = {
  /** id, title, a–d (strings for the subtitle) and at (recency), as raw SQL. */
  cols: string;
  /** FROM … WHERE …: only rows that match. */
  from: SQL;
  /** The normalised text the rank reads. */
  field: string;
  /** Rank for exact matches outside `field`: a phone number, an order number, a date. */
  boost?: SQL;
  /** Break ties by trigram similarity. */
  fuzzy?: boolean;
  /** Rank only the newest N matches, for tables where a common word matches thousands of rows. */
  newest?: number;
  limit?: number;
};

/** The UNION ALL of every wanted type's part, or null when nothing can match. */
export function buildSearchQuery(opts: SearchOpts, norm: Norm): SQL | null {
  const q = opts.q.trim().slice(0, 100);
  if (!q || !norm.n) return null;
  const { hit, part } = matchers(norm);
  const allowed = ENTITY_TYPES.filter((t) => (!opts.types?.length || opts.types.includes(t)) && (opts.role !== "agent" || !ADMIN_TYPES.includes(t)));
  const want = (t: EntityType) => allowed.includes(t) && (!opts.numbersOnly || t === "orders" || t === "tickets");
  const digits = phoneDigits(q);
  const num = /^\d{1,9}$/.test(q) ? q : null;
  const day = parseDay(q);
  const o = opts.orgId;
  const tz = opts.timezone;
  const name = "public.wf_norm(c.name)";
  const byNumber = (col: string) => (num ? sql`case when ${sql.raw(col)}::text = ${num} then 4 when ${sql.raw(col)}::text like ${num + "%"} then 3 else 0 end` : sql`0`);
  const numberMatch = (col: string) => (num ? sql`${sql.raw(col)}::text like ${num + "%"}` : sql`false`);
  const parts: SQL[] = [];

  if (want("contacts"))
    parts.push(
      part("contacts", {
        cols: "c.id, coalesce(c.name, '') as title, c.wa_id as a, c.email as b, array_to_string(c.tags, ', ') as c, null as d, coalesce(c.last_inbound_at, c.updated_at) as at",
        from: sql`from contacts c where c.id in (select id from cm)`,
        field: name,
        boost: digits ? sql`case when c.wa_id like ${"%" + digits} then 3 when c.wa_id like ${"%" + digits + "%"} then 1 else 0 end` : undefined,
        fuzzy: true,
        newest: 500,
      }),
    );
  if (want("conversations"))
    parts.push(
      part("conversations", {
        cols: "v.id, coalesce(c.name, '') as title, c.wa_id as a, v.status as b, v.last_message_preview as c, null as d, v.last_message_at as at",
        from: sql`from conversations v join contacts c on c.id = v.contact_id
          where v.org_id = ${o} and (v.contact_id in (select id from cm) or ${hit(["public.wf_norm(v.last_message_preview)"])})`,
        field: name,
        fuzzy: true,
        newest: 500,
      }),
    );
  if (want("leads")) {
    const f = "public.wf_norm(l.title)";
    parts.push(
      part("leads", {
        cols: "l.id, l.title, c.name as a, s.name as b, l.value_minor::text as c, l.currency as d, l.updated_at as at",
        from: sql`from leads l join contacts c on c.id = l.contact_id join pipeline_stages s on s.id = l.stage_id where l.org_id = ${o} and ${hit([f], [f])}`,
        field: f,
        fuzzy: true,
      }),
    );
  }
  if (want("orders")) {
    const f = "public.wf_order_items_text(r.items)";
    parts.push(
      part("orders", {
        cols: "r.id, r.number::text as title, c.name as a, r.status as b, r.total_minor::text as c, r.currency as d, r.created_at as at",
        from: sql`from orders r join contacts c on c.id = r.contact_id where r.org_id = ${o} and (${numberMatch("r.number")}${opts.numbersOnly ? sql`` : sql` or ${hit([f])}`})`,
        field: f,
        boost: byNumber("r.number"),
      }),
    );
  }
  if (want("tickets")) {
    const f = "public.wf_norm(t.subject)";
    parts.push(
      part("tickets", {
        cols: "t.id, t.subject as title, t.number::text as a, t.status as b, c.name as c, t.priority as d, t.updated_at as at",
        from: sql`from tickets t join contacts c on c.id = t.contact_id where t.org_id = ${o} and (${numberMatch("t.number")}${opts.numbersOnly ? sql`` : sql` or ${hit([f], [f])}`})`,
        field: f,
        boost: byNumber("t.number"),
        fuzzy: true,
      }),
    );
  }
  if (want("appointments")) {
    const svc = "public.wf_norm(s.name)";
    const onDay = day ? sql`(a.start_at at time zone ${tz})::date = ${day}::date` : sql`false`;
    parts.push(
      part("appointments", {
        cols: `a.id, coalesce(c.name, '') as title, s.name as a, a.status as b, to_char(a.start_at at time zone '${tz.replace(/'/g, "''")}', 'YYYY-MM-DD"T"HH24:MI') as c, c.wa_id as d, a.start_at as at`,
        from: sql`from appointments a join contacts c on c.id = a.contact_id join services s on s.id = a.service_id
          where a.org_id = ${o} and (${onDay} or a.contact_id in (select id from cm) or ${hit([svc], [svc])})`,
        field: "public.wf_norm(coalesce(c.name, '') || ' ' || s.name)",
        boost: day ? sql`case when ${onDay} then 3 else 0 end` : undefined,
        fuzzy: true,
      }),
    );
  }
  if (want("products")) {
    const f = "public.wf_norm(p.name)";
    parts.push(
      part("products", {
        cols: "p.id, p.name as title, p.sku as a, p.price_minor::text as b, p.currency as c, p.stock::text as d, p.updated_at as at",
        from: sql`from products p where p.org_id = ${o} and ${hit([f, "public.wf_norm(p.sku)", "public.wf_norm(p.description)"], [f])}`,
        field: f,
        boost: sql`case when public.wf_norm(p.sku) = ${norm.n} then 3 else 0 end`,
        fuzzy: true,
      }),
    );
  }
  if (want("templates")) {
    const f = "public.wf_norm(t.name)";
    parts.push(
      part("templates", {
        cols: "t.id, t.name as title, t.status as a, t.category as b, t.body as c, t.language as d, t.updated_at as at",
        from: sql`from templates t where t.org_id = ${o} and ${hit([f, "public.wf_norm(t.body)"], [f])}`,
        field: f,
        fuzzy: true,
      }),
    );
  }
  if (want("bot_flows")) {
    const f = "public.wf_norm(b.name)";
    parts.push(
      part("bot_flows", {
        cols: "b.id, b.name as title, b.status as a, array_to_string(array(select jsonb_array_elements_text(b.trigger -> 'keywords')), ', ') as b, null as c, null as d, b.updated_at as at",
        from: sql`from bot_flows b where b.org_id = ${o} and ${hit([f, "public.wf_flow_text(b.trigger, b.graph)"], [f])}`,
        field: f,
        fuzzy: true,
      }),
    );
  }
  if (want("campaigns")) {
    const f = "public.wf_norm(m.name)";
    parts.push(
      part("campaigns", {
        cols: "m.id, m.name as title, m.status as a, null as b, null as c, null as d, coalesce(m.sent_at, m.created_at) as at",
        from: sql`from campaigns m where m.org_id = ${o} and ${hit([f], [f])}`,
        field: f,
        fuzzy: true,
      }),
    );
  }
  if (want("automations")) {
    const f = "public.wf_norm(u.name)";
    parts.push(
      part("automations", {
        cols: "u.id, u.name as title, u.status as a, u.trigger as b, null as c, null as d, u.updated_at as at",
        from: sql`from automations u where u.org_id = ${o} and ${hit([f], [f])}`,
        field: f,
        fuzzy: true,
      }),
    );
  }
  if (want("messages")) {
    const f = "m.body_search";
    const recent = opts.allMessages ? sql`` : sql` and m.created_at > now() - make_interval(days => ${MESSAGE_DAYS})`;
    parts.push(
      part("messages", {
        cols: "m.id, coalesce(c.name, '') as title, m.body as a, m.conversation_id::text as b, c.wa_id as c, m.direction as d, m.created_at as at",
        from: sql`from messages m join conversations v on v.id = m.conversation_id join contacts c on c.id = v.contact_id
          where m.org_id = ${o} and m.body_search is not null${recent} and ${hit([f])}`,
        field: f,
        newest: 300,
        limit: opts.allMessages ? 20 : PER_TYPE,
      }),
    );
  }
  if (!parts.length) return null;

  // `cm` is the matching contacts, worked out once and kept apart from the joins so the contacts
  // indexes do the work for contacts, conversations and appointments alike.
  const phone = digits ? sql` or c.wa_id like ${"%" + digits + "%"}` : sql``;
  return sql`with cm as (select c.id from contacts c where c.org_id = ${o} and (${hit([name, "public.wf_norm(c.email)", "public.wf_norm_tags(c.tags)"], [name])}${phone}))
    ${sql.join(parts, sql` union all `)}`;
}

/** Records matching `q`, top 5 per type, in palette order. */
export async function searchEntities(d: DB, opts: SearchOpts): Promise<SearchGroup[]> {
  const q = opts.q.trim().slice(0, 100);
  if (!q) return [];
  // set_config(…, true) is scoped to the transaction, so the thresholds never leak to other pooled queries.
  const rows = await d.transaction(async (tx) => {
    const [norm] = rowsOf<Norm>(
      await tx.execute(
        sql`select set_config('pg_trgm.similarity_threshold', ${String(SIMILARITY)}, true), set_config('pg_trgm.word_similarity_threshold', ${String(WORD_SIMILARITY)}, true),
          public.wf_norm(${q}) as n, public.wf_norm(${esc(q)}) as e`,
      ),
    );
    const query = buildSearchQuery({ ...opts, q }, norm);
    return query ? rowsOf<Row>(await tx.execute(query)) : [];
  });

  const groups = new Map<EntityType, SearchHit[]>();
  for (const r of rows) groups.set(r.type, [...(groups.get(r.type) ?? []), toHit(r, opts.role)]);
  return ENTITY_TYPES.filter((t) => groups.has(t)).map((t) => ({ type: t, items: groups.get(t)! }));
}

const join = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join(" · ");
const cap = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replaceAll("_", " ") : "");
const money = (minor: string | null, currency: string | null) => (minor == null ? null : formatMoney(Number(minor), currency ?? "INR"));
const clip = (s: string | null, n = 80) => (s && s.length > n ? s.slice(0, n - 1) + "…" : (s ?? ""));

function when(iso: string | null) {
  if (!iso) return "";
  const [date, time] = iso.split("T");
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}, ${time}`;
}

function toHit(r: Row, role: Role): SearchHit {
  switch (r.type) {
    case "contacts":
      return { id: r.id, title: r.title || formatWaId(r.a ?? ""), subtitle: join(formatWaId(r.a ?? ""), r.b, r.c), href: `/contacts/${r.id}` };
    case "conversations":
      return { id: r.id, title: r.title || formatWaId(r.a ?? ""), subtitle: join(cap(r.b), clip(r.c)), href: `/inbox?c=${r.id}`, tag: cap(r.b) };
    case "leads":
      return { id: r.id, title: r.title ?? "", subtitle: join(r.a, r.b, money(r.c, r.d)), href: `/pipeline` };
    case "orders":
      return { id: r.id, title: `Order #${r.title}`, subtitle: join(r.a, cap(r.b), money(r.c, r.d)), href: `/orders/${r.id}`, tag: cap(r.b) };
    case "tickets":
      return { id: r.id, title: `#${r.a} ${r.title ?? ""}`, subtitle: join(cap(r.b), r.c, r.d !== "normal" && cap(r.d)), href: `/tickets/${r.id}`, tag: cap(r.b) };
    case "appointments":
      return {
        id: r.id,
        title: join(r.title || formatWaId(r.d ?? ""), r.a),
        subtitle: join(when(r.c), cap(r.b)),
        href: `/appointments?date=${r.c?.slice(0, 10) ?? ""}`,
      };
    case "products":
      return {
        id: r.id,
        title: r.title ?? "",
        subtitle: join(r.a && `SKU ${r.a}`, money(r.b, r.c), r.d != null && `${r.d} in stock`),
        href: role === "agent" ? "/catalog" : `/catalog?edit=${r.id}`,
      };
    case "templates":
      return { id: r.id, title: r.title ?? "", subtitle: join(cap(r.a), cap(r.b?.toLowerCase() ?? null), clip(r.c, 60)), href: "/templates", tag: cap(r.a) };
    case "bot_flows":
      return { id: r.id, title: r.title ?? "", subtitle: join(cap(r.a), r.b && `Keywords: ${r.b}`), href: `/bots/${r.id}`, tag: cap(r.a) };
    case "campaigns":
      return { id: r.id, title: r.title ?? "", subtitle: cap(r.a), href: `/campaigns/${r.id}`, tag: cap(r.a) };
    case "automations":
      return { id: r.id, title: r.title ?? "", subtitle: join(cap(r.a), cap(r.b)), href: `/automations/${r.id}`, tag: cap(r.a) };
    case "messages":
      return {
        id: r.id,
        title: r.title || formatWaId(r.c ?? ""),
        subtitle: clip(r.a, 100),
        href: `/inbox?c=${r.b}`,
        tag: r.d === "in" ? "Received" : "Sent",
      };
  }
}
