import type { FlowEdge, FlowNode, FlowTrigger } from "@/db/schema";

export type Graph = { nodes: FlowNode[]; edges: FlowEdge[] };

export function nextNode(g: Graph, fromId: string, handle?: string | null): FlowNode | null {
  const edge = g.edges.find((e) => e.source === fromId && (handle == null ? !e.sourceHandle || e.sourceHandle === "out" : e.sourceHandle === handle));
  return edge ? (g.nodes.find((n) => n.id === edge.target) ?? null) : null;
}

export function triggerMatches(trigger: FlowTrigger, text: string, isNewConversation: boolean): boolean {
  if (trigger.kind === "any_new_conversation") return isNewConversation;
  const t = text.trim().toLowerCase();
  return trigger.keywords.some((k) => {
    const kw = k.trim().toLowerCase();
    return kw.length > 0 && (t === kw || t.split(/\s+/).includes(kw));
  });
}

/** Problems that stop a flow from going live. */
export function validateGraph(g: Graph): string[] {
  const problems: string[] = [];
  const triggers = g.nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) problems.push("A flow needs exactly one Start block.");
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) problems.push("A connection points to a block that no longer exists.");
  }
  if (triggers[0] && !g.edges.some((e) => e.source === triggers[0].id)) problems.push("Connect the Start block to the first message.");
  for (const n of g.nodes) {
    const text = String(n.data.text ?? "").trim();
    if (["message", "buttons", "list", "question"].includes(n.type) && !text) problems.push(`A ${n.type} block has no text.`);
    if (n.type === "buttons") {
      const b = (n.data.buttons as string[] | undefined) ?? [];
      if (b.length < 1 || b.length > 3) problems.push("Button blocks need 1 to 3 buttons.");
      if (b.some((x) => !x.trim() || x.length > 20)) problems.push("Button labels must be 1–20 characters.");
    }
    if (n.type === "list") {
      const r = (n.data.rows as string[] | undefined) ?? [];
      if (r.length < 1 || r.length > 10) problems.push("List blocks need 1 to 10 options.");
    }
    if (n.type === "booking" && !String(n.data.serviceId ?? "")) problems.push("Pick a service for the booking block.");
    if (n.type === "question" && !String(n.data.saveAs ?? "").trim()) problems.push("Question blocks need a field name to save the answer.");
  }
  // reachability: every node except trigger should be reachable
  if (triggers[0]) {
    const seen = new Set<string>([triggers[0].id]);
    const stack = [triggers[0].id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of g.edges.filter((x) => x.source === cur)) if (!seen.has(e.target)) { seen.add(e.target); stack.push(e.target); }
    }
    const orphans = g.nodes.filter((n) => !seen.has(n.id));
    if (orphans.length) problems.push(`${orphans.length} block(s) can never be reached.`);
  }
  return [...new Set(problems)];
}

/** Match a reply against button/list options: by reply id, then exact title, then number typed. */
export function matchOption(options: string[], input: { text: string; replyId?: string | null }): number {
  if (input.replyId) {
    const m = input.replyId.match(/^(?:btn|row):(\d+)$/);
    if (m && Number(m[1]) < options.length) return Number(m[1]);
  }
  const t = input.text.trim().toLowerCase();
  const exact = options.findIndex((o) => o.trim().toLowerCase() === t);
  if (exact >= 0) return exact;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
  return -1;
}
