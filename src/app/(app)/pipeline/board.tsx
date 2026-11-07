"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarClock, X } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { formatMoney } from "@/lib/plans";
import { addStage, deleteLead, deleteStage, moveLead, renameStage, updateLead } from "./actions";

type Stage = { id: string; name: string; kind: "open" | "won" | "lost" };
type Lead = {
  id: string;
  stageId: string;
  title: string;
  valueMinor: number;
  currency: string;
  ownerId: string | null;
  notes: string | null;
  source: string;
  conversationId: string | null;
  nextFollowUpAt: string | null;
  contact: string;
};

export function Board({ stages, leads, members, canEditStages }: { stages: Stage[]; leads: Lead[]; members: { id: string; name: string }[]; canEditStages: boolean }) {
  const [optimistic, move] = useOptimistic(leads, (state, p: { id: string; stageId: string }) => state.map((l) => (l.id === p.id ? { ...l, stageId: p.stageId } : l)));
  const [, start] = useTransition();
  const [open, setOpen] = useState<Lead | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  function onDragEnd(e: DragEndEvent) {
    const stageId = e.over?.id as string | undefined;
    const id = e.active.id as string;
    if (!stageId || optimistic.find((l) => l.id === id)?.stageId === stageId) return;
    start(async () => {
      move({ id, stageId });
      await moveLead(id, stageId);
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto p-6">
      <DndContext id="pipeline-board" sensors={sensors} onDragEnd={onDragEnd}>
        {stages.map((s) => {
          const items = optimistic.filter((l) => l.stageId === s.id);
          return (
            <Column key={s.id} stage={s} total={items.reduce((a, l) => a + l.valueMinor, 0)} count={items.length} canEdit={canEditStages}>
              {items.map((l) => (
                <LeadCard key={l.id} lead={l} owner={members.find((m) => m.id === l.ownerId)?.name} onOpen={() => setOpen(l)} />
              ))}
            </Column>
          );
        })}
      </DndContext>
      {canEditStages && (
        <form action={addStage} className="w-64 shrink-0 space-y-2">
          <Input name="name" placeholder="New stage" aria-label="New stage name" />
          <div className="flex gap-2">
            <Select name="kind" aria-label="Stage type" className="h-9">
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </Select>
            <Button size="sm" variant="secondary">
              Add
            </Button>
          </div>
        </form>
      )}
      {open && <LeadDrawer lead={open} members={members} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Column({ stage, total, count, canEdit, children }: { stage: Stage; total: number; count: number; canEdit: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [editing, setEditing] = useState(false);
  return (
    <section ref={setNodeRef} className={cx("flex w-72 shrink-0 flex-col rounded-lg bg-surface-2 p-2", isOver && "outline-2 outline-accent")} aria-label={stage.name}>
      <header className="flex items-center gap-2 px-2 py-1.5">
        {editing ? (
          <form action={renameStage} onSubmit={() => setEditing(false)} className="flex flex-1 gap-1">
            <input type="hidden" name="id" value={stage.id} />
            <Input name="name" defaultValue={stage.name} className="h-7 text-[13px]" aria-label="Stage name" autoFocus />
          </form>
        ) : (
          <button className="flex-1 text-left text-sm font-semibold" onDoubleClick={() => canEdit && setEditing(true)} title={canEdit ? "Double-click to rename" : undefined}>
            {stage.name}
            {stage.kind !== "open" && <span className={cx("ml-1 text-xs font-normal", stage.kind === "won" ? "text-success" : "text-muted")}>({stage.kind})</span>}
          </button>
        )}
        <span className="text-xs text-muted">
          {count} · {formatMoney(total)}
        </span>
        {canEdit && count === 0 && (
          <form action={deleteStage}>
            <input type="hidden" name="id" value={stage.id} />
            <button aria-label={`Delete stage ${stage.name}`} className="text-muted hover:text-danger">
              <X size={14} />
            </button>
          </form>
        )}
      </header>
      <div className="min-h-24 flex-1 space-y-2">{children}</div>
    </section>
  );
}

function LeadCard({ lead, owner, onOpen }: { lead: Lead; owner?: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cx("cursor-grab rounded-md border border-line bg-surface p-3 shadow-sm", isDragging && "z-10 opacity-80 shadow-lg")}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <div className="text-sm font-medium">{lead.title}</div>
      <div className="text-xs text-muted">{lead.contact}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="font-medium">{formatMoney(lead.valueMinor, lead.currency)}</span>
        {owner && <span className="text-muted">· {owner}</span>}
        {lead.nextFollowUpAt && (
          <span className={cx("ml-auto inline-flex items-center gap-1", overdue ? "text-danger" : "text-muted")}>
            <CalendarClock size={12} /> {new Date(lead.nextFollowUpAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </div>
  );
}

function LeadDrawer({ lead, members, onClose }: { lead: Lead; members: { id: string; name: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <Card className="h-full w-full max-w-md overflow-y-auto rounded-none p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit lead">
        <div className="mb-4 flex items-center">
          <h2 className="flex-1 font-semibold">{lead.contact}</h2>
          <button onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form action={async (f) => { await updateLead(f); onClose(); }} className="space-y-4">
          <input type="hidden" name="id" value={lead.id} />
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" defaultValue={lead.title} />
          </Field>
          <Field label="Deal value (₹)" htmlFor="value">
            <Input id="value" name="value" inputMode="decimal" defaultValue={String(lead.valueMinor / 100)} />
          </Field>
          <Field label="Owner" htmlFor="ownerId">
            <Select id="ownerId" name="ownerId" defaultValue={lead.ownerId ?? ""}>
              <option value="">No owner</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next follow-up" htmlFor="follow" hint="A reminder note appears in the chat when it's due.">
            <Input id="follow" name="nextFollowUpAt" type="datetime-local" defaultValue={lead.nextFollowUpAt ? toLocalInput(lead.nextFollowUpAt) : ""} />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" defaultValue={lead.notes ?? ""} />
          </Field>
          <p className="text-xs text-muted">Source: {lead.source}</p>
          <div className="flex gap-2">
            <Button>Save</Button>
            {lead.conversationId && (
              <Link href={`/inbox?c=${lead.conversationId}`} className="inline-flex h-10 items-center px-3 text-sm text-accent">
                Open chat
              </Link>
            )}
          </div>
        </form>
        <form action={async (f) => { await deleteLead(f); onClose(); }} className="mt-6">
          <input type="hidden" name="id" value={lead.id} />
          <Button variant="ghost" size="sm" className="text-danger">
            Delete lead
          </Button>
        </form>
      </Card>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
