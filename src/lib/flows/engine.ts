import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { FlowNode } from "@/db/schema";
import { sendInConversation } from "@/lib/wa/outbound";
import { matchOption, nextNode, triggerMatches, type Graph } from "./graph";
import { nextTicketNumber } from "@/lib/crm";

const MAX_STEPS = 25;

type Ctx = {
  d: DB;
  orgId: string;
  conversationId: string;
  contactId: string;
  flowId: string;
  graph: Graph;
  vars: Record<string, string>;
};

type StepResult = { waitAt: string | null; handedOver: boolean };

async function execute(ctx: Ctx, start: FlowNode | null): Promise<StepResult> {
  let node = start;
  for (let steps = 0; node && steps < MAX_STEPS; steps++) {
    const text = interpolate(String(node.data.text ?? ""), ctx.vars);
    switch (node.type) {
      case "trigger":
        node = nextNode(ctx.graph, node.id);
        continue;
      case "message":
        await sendInConversation(ctx.d, ctx.conversationId, { kind: "text", body: text }, { senderKind: "bot" });
        node = nextNode(ctx.graph, node.id);
        continue;
      case "buttons":
        await sendInConversation(
          ctx.d,
          ctx.conversationId,
          { kind: "buttons", body: text, buttons: (node.data.buttons as string[]) ?? [] },
          { senderKind: "bot" },
        );
        return { waitAt: node.id, handedOver: false };
      case "list":
        await sendInConversation(
          ctx.d,
          ctx.conversationId,
          { kind: "list", body: text, button: String(node.data.button || "Choose"), rows: (node.data.rows as string[]) ?? [] },
          { senderKind: "bot" },
        );
        return { waitAt: node.id, handedOver: false };
      case "question":
        await sendInConversation(ctx.d, ctx.conversationId, { kind: "text", body: text }, { senderKind: "bot" });
        return { waitAt: node.id, handedOver: false };
      case "condition": {
        const v = (ctx.vars[String(node.data.variable ?? "")] ?? "").trim().toLowerCase();
        const want = String(node.data.equals ?? "").trim().toLowerCase();
        node = nextNode(ctx.graph, node.id, v === want ? "yes" : "no");
        continue;
      }
      case "tag": {
        const tag = String(node.data.tag ?? "").trim();
        if (tag) {
          await ctx.d
            .update(schema.contacts)
            .set({ tags: sql`array(select distinct unnest(${schema.contacts.tags} || array[${tag}]::text[]))` })
            .where(eq(schema.contacts.id, ctx.contactId));
        }
        node = nextNode(ctx.graph, node.id);
        continue;
      }
      case "lead": {
        const [stage] = await ctx.d
          .select()
          .from(schema.pipelineStages)
          .where(and(eq(schema.pipelineStages.orgId, ctx.orgId), eq(schema.pipelineStages.kind, "open")))
          .orderBy(asc(schema.pipelineStages.position))
          .limit(1);
        if (stage) {
          await ctx.d.insert(schema.leads).values({
            orgId: ctx.orgId,
            contactId: ctx.contactId,
            conversationId: ctx.conversationId,
            stageId: stage.id,
            title: interpolate(String(node.data.title || "New lead"), ctx.vars),
            source: "bot",
            notes: Object.entries(ctx.vars).map(([k, v]) => `${k}: ${v}`).join("\n") || null,
          });
          await markEnquiry(ctx, "converted", "lead");
        }
        node = nextNode(ctx.graph, node.id);
        continue;
      }
      case "ticket": {
        await ctx.d.insert(schema.tickets).values({
          orgId: ctx.orgId,
          number: await nextTicketNumber(ctx.d, ctx.orgId),
          contactId: ctx.contactId,
          conversationId: ctx.conversationId,
          subject: interpolate(String(node.data.subject || "Support request"), ctx.vars),
          description: Object.entries(ctx.vars).map(([k, v]) => `${k}: ${v}`).join("\n") || null,
        });
        await markEnquiry(ctx, "converted", "ticket");
        node = nextNode(ctx.graph, node.id);
        continue;
      }
      case "handover":
        if (text) await sendInConversation(ctx.d, ctx.conversationId, { kind: "text", body: text }, { senderKind: "bot" });
        await ctx.d
          .update(schema.conversations)
          .set({ handledBy: "human", waitingSince: new Date() })
          .where(eq(schema.conversations.id, ctx.conversationId));
        await markEnquiry(ctx, "needs_human");
        return { waitAt: null, handedOver: true };
    }
  }
  return { waitAt: null, handedOver: false };
}

async function markEnquiry(ctx: Ctx, status: "needs_human" | "converted", convertedTo?: "lead" | "ticket") {
  await ctx.d
    .update(schema.enquiries)
    .set({ status, ...(convertedTo ? { convertedTo } : {}) })
    .where(
      and(
        eq(schema.enquiries.conversationId, ctx.conversationId),
        sql`${schema.enquiries.status} in ('answered_by_bot','needs_human')`,
      ),
    );
}

function interpolate(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

/**
 * Feed an inbound message to the bot. Resumes a waiting run, or starts a live
 * flow whose trigger matches. Returns whether a bot handled the message.
 */
export async function runBot(
  d: DB,
  args: {
    orgId: string;
    conversationId: string;
    contactId: string;
    text: string;
    replyId?: string | null;
    isNewConversation: boolean;
    handledBy: "bot" | "human";
  },
): Promise<{ handled: boolean; handedOver: boolean }> {
  const [waiting] = await d
    .select({ run: schema.flowRuns, flow: schema.botFlows })
    .from(schema.flowRuns)
    .innerJoin(schema.botFlows, eq(schema.botFlows.id, schema.flowRuns.flowId))
    .where(and(eq(schema.flowRuns.conversationId, args.conversationId), eq(schema.flowRuns.status, "waiting")))
    .limit(1);

  if (waiting) {
    const graph = waiting.flow.graph;
    const at = graph.nodes.find((n) => n.id === waiting.run.currentNodeId);
    const ctx: Ctx = {
      d,
      orgId: args.orgId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      flowId: waiting.flow.id,
      graph,
      vars: { ...waiting.run.vars },
    };
    let next: FlowNode | null = null;
    if (at?.type === "question") {
      ctx.vars[String(at.data.saveAs || "answer")] = args.text;
      next = nextNode(graph, at.id);
    } else if (at && (at.type === "buttons" || at.type === "list")) {
      const options = ((at.type === "buttons" ? at.data.buttons : at.data.rows) as string[]) ?? [];
      const idx = matchOption(options, { text: args.text, replyId: args.replyId });
      if (idx < 0) {
        // Not one of the options: hand over rather than loop the customer.
        next = { id: "__handover", type: "handover", position: { x: 0, y: 0 }, data: { text: "Let me get someone from our team to help you." } };
      } else {
        ctx.vars[String(at.data.saveAs || "choice")] = options[idx];
        next = nextNode(graph, at.id, String(idx));
      }
    }
    const res = await execute(ctx, next);
    await d
      .update(schema.flowRuns)
      .set({
        currentNodeId: res.waitAt,
        vars: ctx.vars,
        status: res.waitAt ? "waiting" : res.handedOver ? "handed_over" : "done",
        updatedAt: new Date(),
      })
      .where(eq(schema.flowRuns.id, waiting.run.id));
    return { handled: true, handedOver: res.handedOver };
  }

  if (args.handledBy === "human" && !args.isNewConversation) return { handled: false, handedOver: false };

  const flows = await d
    .select()
    .from(schema.botFlows)
    .where(and(eq(schema.botFlows.orgId, args.orgId), eq(schema.botFlows.status, "live")))
    .orderBy(asc(schema.botFlows.createdAt));
  // keyword flows win over catch-all "new conversation" flows
  const sorted = [...flows].sort((a, b) => (a.trigger.kind === "keyword" ? 0 : 1) - (b.trigger.kind === "keyword" ? 0 : 1));
  const flow = sorted.find((f) => triggerMatches(f.trigger, args.text, args.isNewConversation));
  if (!flow) return { handled: false, handedOver: false };

  const graph = flow.graph;
  const start = graph.nodes.find((n) => n.type === "trigger") ?? null;
  const ctx: Ctx = { d, orgId: args.orgId, conversationId: args.conversationId, contactId: args.contactId, flowId: flow.id, graph, vars: {} };
  const res = await execute(ctx, start);
  await d.insert(schema.flowRuns).values({
    flowId: flow.id,
    conversationId: args.conversationId,
    currentNodeId: res.waitAt,
    vars: ctx.vars,
    status: res.waitAt ? "waiting" : res.handedOver ? "handed_over" : "done",
  });
  await d.update(schema.botFlows).set({ runs: sql`${schema.botFlows.runs} + 1` }).where(eq(schema.botFlows.id, flow.id));
  await d.update(schema.conversations).set({ handledBy: res.handedOver ? "human" : "bot" }).where(eq(schema.conversations.id, args.conversationId));
  return { handled: true, handedOver: res.handedOver };
}

/** Stop any waiting bot run, e.g. when an agent takes over. */
export async function stopBot(d: DB, conversationId: string) {
  await d
    .update(schema.flowRuns)
    .set({ status: "handed_over", updatedAt: new Date() })
    .where(and(eq(schema.flowRuns.conversationId, conversationId), eq(schema.flowRuns.status, "waiting")));
}
