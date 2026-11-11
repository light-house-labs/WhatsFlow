"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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
import { ArrowLeft, Bot, CalendarClock, GitBranch, PackageSearch, Plus, ShoppingBag, HelpCircle, List, MessageSquare, MousePointerClick, Play, Tag, Ticket, Trash2, UserRound, Users, X } from "lucide-react";
import type { FlowEdge, FlowNode, FlowTrigger } from "@/db/schema";
import { Button, Field, Input, SectionLabel, Select, StatusBadge, Textarea, cx } from "@/components/ui";
import { HelpButton } from "@/components/help-drawer";
import { Tour, type TourStep } from "@/components/tour";
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

const TOUR: TourStep[] = [
  { target: ['[data-tour="palette"]'], side: "right", title: "Your blocks", body: "Everything a flow can do: send messages, ask questions, take orders, book times and hand over to your team." },
  { target: ['[data-tour="add-block"]'], side: "right", title: "Add a block", body: "Click any block to drop it on the canvas, to the right of the last one. You can drag it anywhere after." },
  { target: ['.react-flow__node[data-id="t"]', '[data-tour="canvas"]'], side: "right", title: "Connect blocks", body: "Drag from the dot on the right of a block to the left edge of the next. Each button or option gets its own dot." },
  { target: ['[data-tour="settings"]'], side: "left", title: "Edit its settings", body: "Click a block to change its message, buttons or saved answer here. With nothing selected, this sets when the flow starts." },
  { target: ['[data-tour="test"]'], side: "bottom", title: "Test it", body: "Saves the flow and opens the sandbox phone so you can chat with it. Drafts work too, so test before setting it live." },
];

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
  const ring = selected ? "outline-2 outline-accent" : "";
  // Start/trigger: solid green pill
  if (kind === "trigger") {
    return (
      <div className={cx("relative inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-on-accent outline-offset-2", ring)}>
        <Icon size={13} strokeWidth={1.75} aria-hidden />
        <span className="text-13 font-semibold">{m.label}</span>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }
  // Messages get a green tint header; logic and actions a neutral fill
  const messaging = kind === "message" || kind === "buttons" || kind === "list" || kind === "question" || kind === "products" || kind === "booking" || kind === "order_status";
  return (
    <div className={cx("w-60 overflow-hidden rounded-lg border border-line bg-surface text-ink outline-offset-2 transition-[outline-color] duration-150", ring)}>
      <Handle type="target" position={Position.Left} />
      <div className={cx("flex items-center gap-2 px-3 py-2", messaging ? "bg-accent-soft" : "bg-fill")}>
        <Icon size={13} strokeWidth={1.75} aria-hidden className={messaging ? "text-accent-text" : "text-muted"} />
        <span className={cx("section-label flex-1 truncate", messaging ? "text-accent-text" : "text-muted")}>{m.label}</span>
        {kind === "handover" && <span className="section-label text-xs text-muted">End</span>}
      </div>
      <div className={cx("line-clamp-3 px-3 py-2.5 text-13 leading-snug", preview ? "font-semibold" : "text-muted")}>{preview || "Click to edit"}</div>
      {options.length > 0 ? (
        <div className="pb-1">
          {options.map((o, i) => (
            <div key={i} className="relative mx-1 rounded-lg bg-fill px-3 py-1.5 text-xs [&:not(:first-child)]:mt-1">
              {o || <span className="section-label text-muted">Empty</span>}
              <Handle id={String(i)} type="source" position={Position.Right} />
            </div>
          ))}
        </div>
      ) : kind === "condition" ? (
        <div className="space-y-1 px-1 pb-1">
          <div className="section-label relative rounded-lg bg-fill px-3 py-1.5 text-accent-text">
            Yes
            <Handle id="yes" type="source" position={Position.Right} />
          </div>
          <div className="section-label relative rounded-lg bg-fill px-3 py-1.5 text-muted">
            No
            <Handle id="no" type="source" position={Position.Right} className="wf-handle-no" />
          </div>
        </div>
      ) : kind !== "handover" ? (
        <Handle type="source" position={Position.Right} />
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
  const router = useRouter();

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
  // Display only: edges in and out of the selected block read as the active path.
  const shownEdges = useMemo(
    () => (selectedId ? edges.map((e) => (e.source === selectedId || e.target === selectedId ? { ...e, className: "wf-path" } : e)) : edges),
    [edges, selectedId],
  );
  const update = (patch: Record<string, unknown>) => setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)));

  function add(kind: Kind) {
    const id = `${kind[0]}${nowMs().toString(36)}`;
    const last = nodes[nodes.length - 1];
    setNodes((ns) => [...ns, toRf({ id, type: kind, position: { x: (last?.position.x ?? 0) + 280, y: last?.position.y ?? 120 }, data: { ...(DEFAULTS[kind] ?? {}) } })]);
    setSelectedId(id);
  }

  function save(publish: "keep" | "live" | "draft", then?: () => void) {
    setSaved(null);
    start(async () => {
      const r = await saveFlow(props.id, { name, trigger, nodes: nodes.map(fromRf), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })) }, publish);
      setProblems(r.problems);
      if (r.status) setStatus(r.status);
      if (r.ok) setSaved(publish === "live" ? "Saved and live." : publish === "draft" ? "Paused." : "Saved.");
      if (r.ok) then?.();
    });
  }

  return (
    <ServicesCtx.Provider value={props.services}>
      <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <Link href="/bots" aria-label="Back to flows" className="grid size-8 place-items-center rounded-xs text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink">
          <ArrowLeft size={16} strokeWidth={1.75} />
        </Link>
        <div className="h-6 w-px bg-line" aria-hidden />
        <Input
          aria-label="Flow name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-72 border-transparent bg-transparent px-2 text-base font-semibold hover:border-line"
        />
        <StatusBadge status={status} />
        <div className="ml-auto flex items-center gap-2">
          {saved && (
            <span role="status" className="section-label mr-1 text-accent-text">
              {saved}
            </span>
          )}
          <Button data-tour="test" variant="secondary" size="sm" disabled={pending} onClick={() => save("keep", () => router.push(`/settings/sandbox?test=${props.id}`))} title="Save, then try this flow on the sandbox phone. Works on drafts.">
            <Play size={14} /> Test
          </Button>
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
          <div className="h-6 w-px bg-line" aria-hidden />
          <HelpButton />
        </div>
      </header>
      {(problems.length > 0 || (props.initialProblems.length > 0 && status === "draft" && problems.length === 0 && !saved)) && (
        <div role="alert" className="flex gap-4 bg-danger-soft text-danger px-4 py-2.5">
          <div className="section-label shrink-0 pt-px text-danger">
            {problems.length ? "Fix these before going live:" : "Before this can go live:"}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-13 text-ink">
            {(problems.length ? problems : props.initialProblems).map((p) => (
              <li key={p} className="flex items-baseline gap-2">
                <span aria-hidden className="inline-block size-1.5 shrink-0 translate-y-[-1px] bg-danger" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside data-tour="palette" className="w-60 shrink-0 overflow-y-auto border-r border-line bg-surface" aria-label="Blocks">
          <SectionLabel as="div" className="px-4 pb-2 pt-4">
            Add a block
          </SectionLabel>
          <div className="border-t border-line">
            {(Object.keys(META) as Kind[])
              .filter((k) => k !== "trigger")
              .map((k, i) => {
                const Icon = META[k].icon;
                return (
                  <button
                    key={k}
                    data-tour={i === 0 ? "add-block" : undefined}
                    onClick={() => add(k)}
                    className="group flex w-full items-start gap-2.5 border-b border-line px-4 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2"
                  >
                    <Icon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted transition-colors duration-150 group-hover:text-ink" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-13 font-medium leading-snug">{META[k].label}</span>
                      <span className="block text-xs leading-snug text-muted">{META[k].hint}</span>
                    </span>
                    <Plus size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                  </button>
                );
              })}
          </div>
          <p className="px-4 py-4 text-xs leading-relaxed text-muted">Drag from a dot on the right of a block to the left of another to connect them. Select a block and press Backspace to delete it.</p>
        </aside>
        <div data-tour="canvas" className="wf-canvas min-w-0 flex-1 bg-canvas">
          <ReactFlow
            nodes={nodes}
            edges={shownEdges}
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
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside data-tour="settings" className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface p-5" aria-label="Block settings">
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
      <Tour id="flow-builder" steps={TOUR} />
    </ServicesCtx.Provider>
  );
}

function TriggerPanel({ trigger, setTrigger }: { trigger: FlowTrigger; setTrigger: (t: FlowTrigger) => void }) {
  return (
    <div className="space-y-5">
      <div className="border-b border-line pb-4">
        <SectionLabel as="div">{META.trigger.label}</SectionLabel>
        <h2 className="type-heading mt-2">When does this flow start?</h2>
      </div>
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
      <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
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
        <div className="section-label text-muted">{key === "buttons" ? "Buttons" : "Options"}</div>
        {items.map((b, i) => (
          <div key={i} className="flex gap-1">
            <Input aria-label={`Option ${i + 1}`} value={b} maxLength={maxLen} onChange={(e) => update({ [key]: items.map((x, j) => (j === i ? e.target.value : x)) })} />
            <button
              type="button"
              aria-label="Remove option"
              className="grid size-9 shrink-0 place-items-center rounded-md border border-line-strong bg-surface text-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
              onClick={() => update({ [key]: items.filter((_, j) => j !== i) })}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
        {items.length < max && (
          <Button type="button" size="sm" variant="ghost" onClick={() => update({ [key]: [...items, ""] })}>
            <Plus size={14} strokeWidth={1.75} /> Add
          </Button>
        )}
        <p className="text-xs text-muted">
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
    <div className="space-y-5">
      <div className="border-b border-line pb-4">
        <SectionLabel as="div">Block</SectionLabel>
        <h2 className="type-heading mt-2">{META[kind].label}</h2>
        <p className="mt-1 text-xs text-muted">{META[kind].hint}</p>
      </div>
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
      <div className="border-t border-line pt-4">
        <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={remove}>
          <Trash2 size={14} strokeWidth={1.75} /> Delete block
        </Button>
      </div>
    </div>
  );
}
