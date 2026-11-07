"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Bot, CalendarClock, GitBranch, PackageSearch, ShoppingBag, HelpCircle, List, MessageSquare, MousePointerClick, Play, Tag, Ticket, Trash2, UserRound, Users } from "lucide-react";
import type { FlowEdge, FlowNode, FlowTrigger } from "@/db/schema";
import { Alert, Button, Field, Input, Select, StatusBadge, Textarea, cx } from "@/components/ui";
import { saveFlow } from "../actions";
import { nowMs } from "@/lib/format";

type Kind = FlowNode["type"];

const META: Record<Kind, { label: string; icon: typeof Bot; hint: string }> = {
  trigger: { label: "Start", icon: Play, hint: "Where the flow begins" },
  message: { label: "Send message", icon: MessageSquare, hint: "Text, then continue" },
  buttons: { label: "Buttons", icon: MousePointerClick, hint: "Up to 3 choices, then wait" },
  list: { label: "List", icon: List, hint: "Up to 10 options, then wait" },
  question: { label: "Ask a question", icon: HelpCircle, hint: "Save the answer to a field" },
  condition: { label: "If / else", icon: GitBranch, hint: "Branch on a saved answer" },
  tag: { label: "Tag contact", icon: Tag, hint: "Add a tag for segments" },
  lead: { label: "Create lead", icon: Users, hint: "Adds a card to the pipeline" },
  ticket: { label: "Open ticket", icon: Ticket, hint: "Logs a support request" },
  products: { label: "Take an order", icon: ShoppingBag, hint: "Product list, then a payment link" },
  booking: { label: "Offer booking times", icon: CalendarClock, hint: "Free slots for a service, then book" },
  order_status: { label: "Order status", icon: PackageSearch, hint: "Tells the customer about their last order" },
  handover: { label: "Hand over to team", icon: UserRound, hint: "Stops the bot, alerts the inbox" },
};

const ServicesCtx = createContext<{ id: string; name: string }[]>([]);

const DEFAULTS: Partial<Record<Kind, Record<string, unknown>>> = {
  message: { text: "" },
  buttons: { text: "", buttons: ["Option 1", "Option 2"] },
  list: { text: "", button: "Choose", rows: ["Option 1", "Option 2", "Option 3"] },
  question: { text: "", saveAs: "answer" },
  condition: { variable: "answer", equals: "" },
  tag: { tag: "" },
  lead: { title: "New lead" },
  ticket: { subject: "Support request" },
  products: { text: "What would you like to order?" },
  booking: { text: "Pick a time that suits you:", serviceId: "" },
  handover: { text: "Connecting you to our team now." },
};

type Data = { kind: Kind } & Record<string, unknown>;

function BlockNode({ data, selected }: NodeProps<Node<Data>>) {
  const kind = data.kind;
  const m = META[kind];
  const Icon = m.icon;
  const options = kind === "buttons" ? ((data.buttons as string[]) ?? []) : kind === "list" ? ((data.rows as string[]) ?? []) : [];
  const preview =
    kind === "tag" ? `#${data.tag || "…"}` : kind === "lead" ? String(data.title ?? "") : kind === "ticket" ? String(data.subject ?? "") : kind === "condition" ? `${data.variable || "?"} = “${data.equals ?? ""}”` : String(data.text ?? "");
  return (
    <div className={cx("w-56 rounded-lg border bg-surface text-ink shadow-sm", selected ? "border-accent ring-2 ring-accent-soft" : "border-line")}>
      {kind !== "trigger" && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-accent" />}
      <div className={cx("flex items-center gap-2 rounded-t-lg px-3 py-2 text-xs font-semibold", kind === "trigger" ? "bg-accent text-on-accent" : kind === "handover" ? "bg-surface-2 text-warning" : "bg-surface-2")}>
        <Icon size={14} aria-hidden /> {m.label}
      </div>
      {kind !== "trigger" && <div className="line-clamp-3 px-3 py-2 text-xs text-muted">{preview || <em>Click to edit</em>}</div>}
      {options.length > 0 ? (
        <div className="border-t border-line">
          {options.map((o, i) => (
            <div key={i} className="relative px-3 py-1.5 text-xs">
              {o || <em className="text-muted">empty</em>}
              <Handle id={String(i)} type="source" position={Position.Right} className="!h-3 !w-3 !bg-accent" />
            </div>
          ))}
        </div>
      ) : kind === "condition" ? (
        <div className="border-t border-line text-xs">
          <div className="relative px-3 py-1.5 text-success">
            Yes
            <Handle id="yes" type="source" position={Position.Right} className="!h-3 !w-3 !bg-success" />
          </div>
          <div className="relative px-3 py-1.5 text-danger">
            No
            <Handle id="no" type="source" position={Position.Right} className="!h-3 !w-3 !bg-danger" />
          </div>
        </div>
      ) : kind !== "handover" ? (
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-accent" />
      ) : null}
    </div>
  );
}

const nodeTypes = { block: BlockNode };

const toRf = (n: FlowNode): Node<Data> => ({ id: n.id, type: "block", position: n.position, data: { ...n.data, kind: n.type }, deletable: n.type !== "trigger" });
const fromRf = (n: Node<Data>): FlowNode => {
  const { kind, ...data } = n.data;
  return { id: n.id, type: kind, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data };
};

export function Builder(props: {
  id: string;
  initialName: string;
  initialStatus: "draft" | "live";
  initialTrigger: FlowTrigger;
  initialNodes: FlowNode[];
  initialEdges: FlowEdge[];
  initialProblems: string[];
  services: { id: string; name: string }[];
}) {
  const [name, setName] = useState(props.initialName);
  const [status, setStatus] = useState(props.initialStatus);
  const [trigger, setTrigger] = useState<FlowTrigger>(props.initialTrigger);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<Node<Data>>(props.initialNodes.map(toRf));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(props.initialEdges.map((e) => ({ ...e, sourceHandle: e.sourceHandle ?? null })));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<Data>>[]) => onNodesChangeRaw(changes.filter((c) => !(c.type === "remove" && c.id === "t"))),
    [onNodesChangeRaw],
  );
  const onConnect = useCallback(
    (c: Connection) =>
      // one connection per output
      setEdges((eds) => addEdge({ ...c, id: `e${nowMs()}` }, eds.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null))))),
    [setEdges],
  );

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);
  const update = (patch: Record<string, unknown>) => setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)));

  function add(kind: Kind) {
    const id = `${kind[0]}${nowMs().toString(36)}`;
    const last = nodes[nodes.length - 1];
    setNodes((ns) => [...ns, toRf({ id, type: kind, position: { x: (last?.position.x ?? 0) + 280, y: last?.position.y ?? 120 }, data: { ...(DEFAULTS[kind] ?? {}) } })]);
    setSelectedId(id);
  }

  function save(publish: "keep" | "live" | "draft") {
    setSaved(null);
    start(async () => {
      const r = await saveFlow(props.id, { name, trigger, nodes: nodes.map(fromRf), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })) }, publish);
      setProblems(r.problems);
      if (r.status) setStatus(r.status);
      if (r.ok) setSaved(publish === "live" ? "Saved and live." : publish === "draft" ? "Paused." : "Saved.");
    });
  }

  return (
    <ServicesCtx.Provider value={props.services}>
      <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <Link href="/bots" aria-label="Back to flows" className="text-muted">
          <ArrowLeft size={18} />
        </Link>
        <Input aria-label="Flow name" value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-64 font-medium" />
        <StatusBadge status={status} />
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-sm text-success">{saved}</span>}
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => save("keep")}>
            Save
          </Button>
          {status === "live" ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => save("draft")}>
              Pause
            </Button>
          ) : (
            <Button size="sm" disabled={pending} onClick={() => save("live")}>
              Save and set live
            </Button>
          )}
        </div>
      </header>
      {(problems.length > 0 || (props.initialProblems.length > 0 && status === "draft" && problems.length === 0 && !saved)) && (
        <div className="border-b border-line bg-surface px-4 py-2">
          <Alert tone="warning">
            {problems.length ? "Fix these before going live:" : "Before this can go live:"}
            <ul className="ml-4 list-disc">
              {(problems.length ? problems : props.initialProblems).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 space-y-1 overflow-y-auto border-r border-line bg-surface p-3" aria-label="Blocks">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Add a block</div>
          {(Object.keys(META) as Kind[])
            .filter((k) => k !== "trigger")
            .map((k) => {
              const Icon = META[k].icon;
              return (
                <button key={k} onClick={() => add(k)} className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-2">
                  <Icon size={16} className="mt-0.5 text-accent" aria-hidden />
                  <span>
                    <span className="block text-sm">{META[k].label}</span>
                    <span className="block text-[11px] text-muted">{META[k].hint}</span>
                  </span>
                </button>
              );
            })}
          <p className="pt-3 text-[11px] text-muted">Drag from a dot on the right of a block to the left of another to connect them. Select a block and press Backspace to delete it.</p>
        </aside>
        <div className="min-w-0 flex-1 bg-bg">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-line bg-surface p-4" aria-label="Block settings">
          {!selected || selected.data.kind === "trigger" ? (
            <TriggerPanel trigger={trigger} setTrigger={setTrigger} />
          ) : (
            <NodePanel
              data={selected.data}
              update={update}
              remove={() => {
                setNodes((ns) => ns.filter((n) => n.id !== selected.id));
                setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
                setSelectedId(null);
              }}
            />
          )}
        </aside>
      </div>
      </div>
    </ServicesCtx.Provider>
  );
}

function TriggerPanel({ trigger, setTrigger }: { trigger: FlowTrigger; setTrigger: (t: FlowTrigger) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">When does this flow start?</h2>
      <Field label="Start when" htmlFor="trigger-kind">
        <Select
          id="trigger-kind"
          value={trigger.kind}
          onChange={(e) => setTrigger(e.target.value === "keyword" ? { kind: "keyword", keywords: [] } : { kind: "any_new_conversation" })}
        >
          <option value="keyword">The customer sends a keyword</option>
          <option value="any_new_conversation">Any new conversation starts</option>
        </Select>
      </Field>
      {trigger.kind === "keyword" && (
        <Field label="Keywords" htmlFor="kw" hint="Comma separated. Matches the whole message or any single word in it, ignoring case.">
          <Input
            id="kw"
            defaultValue={trigger.keywords.join(", ")}
            onChange={(e) => setTrigger({ kind: "keyword", keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
          />
        </Field>
      )}
      <p className="text-xs text-muted">
        Keyword flows win over “any new conversation” flows. While a bot is waiting for an answer, the customer&apos;s reply goes to the bot. If they reply with something that isn&apos;t one of the options, the chat is handed to your team.
      </p>
    </div>
  );
}

function ServicePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const services = useContext(ServicesCtx);
  return (
    <Field label="Service" htmlFor="svc" hint={services.length ? undefined : "Add services in Appointments → Settings first."}>
      <Select id="svc" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function NodePanel({ data, update, remove }: { data: Data; update: (p: Record<string, unknown>) => void; remove: () => void }) {
  const kind = data.kind;
  const list = (key: "buttons" | "rows", max: number, maxLen: number) => {
    const items = (data[key] as string[]) ?? [];
    return (
      <div className="space-y-2">
        <div className="text-[13px] font-medium">{key === "buttons" ? "Buttons" : "Options"}</div>
        {items.map((b, i) => (
          <div key={i} className="flex gap-1">
            <Input aria-label={`Option ${i + 1}`} value={b} maxLength={maxLen} onChange={(e) => update({ [key]: items.map((x, j) => (j === i ? e.target.value : x)) })} />
            <Button type="button" size="sm" variant="ghost" aria-label="Remove option" onClick={() => update({ [key]: items.filter((_, j) => j !== i) })}>
              ×
            </Button>
          </div>
        ))}
        {items.length < max && (
          <button className="text-sm text-accent" onClick={() => update({ [key]: [...items, ""] })}>
            + Add
          </button>
        )}
        <p className="text-[11px] text-muted">
          Up to {max}, {maxLen} characters each (WhatsApp&apos;s limit). Each one gets its own connection.
        </p>
      </div>
    );
  };
  const text = (label: string, hint?: string) => (
    <Field label={label} htmlFor="node-text" hint={hint ?? "Use {field} to insert a saved answer, e.g. {preferred_day}."}>
      <Textarea id="node-text" rows={4} value={String(data.text ?? "")} onChange={(e) => update({ text: e.target.value })} />
    </Field>
  );
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">{META[kind].label}</h2>
      {(kind === "message" || kind === "buttons" || kind === "list" || kind === "question") && text("Message")}
      {(kind === "products" || kind === "booking") &&
        text(
          "Message",
          kind === "products"
            ? "Lists up to 10 in-stock products from your catalog. The pick becomes an order and the customer gets a payment link."
            : "Lists the next 10 free times. The pick is booked and confirmed. Saved answers go into the booking notes.",
        )}
      {kind === "booking" && <ServicePicker value={String(data.serviceId ?? "")} onChange={(v) => update({ serviceId: v })} />}
      {kind === "order_status" && <p className="text-sm text-muted">Replies with the status and payment of the customer&apos;s most recent order, then continues.</p>}
      {kind === "handover" && text("Message before handing over (optional)", "The conversation moves to the inbox as waiting for a person.")}
      {kind === "buttons" && list("buttons", 3, 20)}
      {kind === "list" && (
        <>
          <Field label="Menu button label" htmlFor="lb">
            <Input id="lb" maxLength={20} value={String(data.button ?? "")} onChange={(e) => update({ button: e.target.value })} />
          </Field>
          {list("rows", 10, 24)}
        </>
      )}
      {(kind === "buttons" || kind === "list") && (
        <Field label="Save the choice as (optional)" htmlFor="sa">
          <Input id="sa" value={String(data.saveAs ?? "")} onChange={(e) => update({ saveAs: e.target.value.replace(/\W/g, "_") })} placeholder="choice" />
        </Field>
      )}
      {kind === "question" && (
        <Field label="Save the answer as" htmlFor="sa" hint="Letters, numbers and underscores. Appears in lead notes.">
          <Input id="sa" value={String(data.saveAs ?? "")} onChange={(e) => update({ saveAs: e.target.value.replace(/\W/g, "_") })} />
        </Field>
      )}
      {kind === "condition" && (
        <>
          <Field label="Saved answer" htmlFor="cv">
            <Input id="cv" value={String(data.variable ?? "")} onChange={(e) => update({ variable: e.target.value })} />
          </Field>
          <Field label="Is equal to" htmlFor="ce" hint="Ignoring case.">
            <Input id="ce" value={String(data.equals ?? "")} onChange={(e) => update({ equals: e.target.value })} />
          </Field>
        </>
      )}
      {kind === "tag" && (
        <Field label="Tag" htmlFor="tg">
          <Input id="tg" value={String(data.tag ?? "")} onChange={(e) => update({ tag: e.target.value.toLowerCase() })} />
        </Field>
      )}
      {kind === "lead" && (
        <Field label="Lead title" htmlFor="lt" hint="Answers saved earlier are added to the lead's notes.">
          <Input id="lt" value={String(data.title ?? "")} onChange={(e) => update({ title: e.target.value })} />
        </Field>
      )}
      {kind === "ticket" && (
        <Field label="Ticket subject" htmlFor="ts">
          <Input id="ts" value={String(data.subject ?? "")} onChange={(e) => update({ subject: e.target.value })} />
        </Field>
      )}
      <Button variant="ghost" size="sm" className="text-danger" onClick={remove}>
        <Trash2 size={14} /> Delete block
      </Button>
    </div>
  );
}
