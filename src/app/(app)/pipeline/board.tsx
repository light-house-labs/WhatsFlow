"use client";

import { SaveForm, SubmitButton } from "@/components/save-form";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarClock, Columns3, Plus, X } from "lucide-react";
import { ButtonLink, Card, EmptyState, Field, Input, Select, Textarea, cx } from "@/components/ui";
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

  const empty =
    stages.length === 0 ? (
      <div className="p-6">
        <EmptyState
          icon={<Columns3 />}
          title="No pipeline stages yet"
          description="Stages are the steps a lead moves through, from new to won."
          primary={{ label: "Set up stages", href: "#new-stage", allow: canEditStages }}
          askAdmin="set up pipeline stages"
        />
      </div>
    ) : null;

  return (
    <>
    {empty}
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
        <SaveForm id="new-stage" action={addStage} success="Stage added" resetOnSuccess className="w-64 shrink-0 space-y-2">
          <Input name="name" placeholder="New stage" aria-label="New stage name" />
          <div className="flex gap-2">
            <Select name="kind" aria-label="Stage type" className="h-8 text-13">
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </Select>
            <SubmitButton size="sm" variant="secondary" savedLabel="Added">
              Add
            </SubmitButton>
          </div>
        </SaveForm>
      )}
      {open && <LeadDrawer lead={open} members={members} onClose={() => setOpen(null)} />}
    </div>
    </>
  );
}

function Column({ stage, total, count, canEdit, children }: { stage: Stage; total: number; count: number; canEdit: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [editing, setEditing] = useState(false);
  return (
    <section ref={setNodeRef} className={cx("flex w-72 shrink-0 flex-col rounded-lg border border-line bg-canvas p-2 transition-colors duration-150", isOver && "bg-accent-soft")} aria-label={stage.name}>
      <header className="flex items-center gap-2 py-2">
        {editing ? (
          <form action={renameStage} onSubmit={() => setEditing(false)} className="flex flex-1 gap-1">
            <input type="hidden" name="id" value={stage.id} />
            <Input name="name" defaultValue={stage.name} className="h-8 text-13" aria-label="Stage name" autoFocus />
          </form>
        ) : (
          <button className="section-label flex-1 text-left text-ink" onDoubleClick={() => canEdit && setEditing(true)} title={canEdit ? "Double-click to rename" : undefined}>
            {stage.name}
            {stage.kind !== "open" && <span className={cx("ml-1", stage.kind === "won" ? "text-accent-text" : "text-muted")}>({stage.kind})</span>}
          </button>
        )}
        <span className="text-xs text-muted tabular-nums">
          {count} · {formatMoney(total)}
        </span>
        {canEdit && count === 0 && (
          <form action={deleteStage}>
            <input type="hidden" name="id" value={stage.id} />
            <button aria-label={`Delete stage ${stage.name}`} className="text-muted hover:text-danger">
              <X size={14} strokeWidth={1.75} />
            </button>
          </form>
        )}
      </header>
      <div className="min-h-24 flex-1 space-y-2">
        {children}
        {count === 0 && (
          <div className="grid min-h-24 place-items-center gap-1 rounded-md border border-dashed border-line px-3 py-4 text-center">
            <span className="text-sm text-muted">No leads</span>
            <Link href="/inbox" className="inline-flex items-center gap-1 text-13 font-medium text-ink hover:underline">
              <Plus size={14} aria-hidden /> Add lead
            </Link>
          </div>
        )}
      </div>
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
      className={cx("cursor-grab rounded-lg border border-line bg-surface p-3 transition-colors duration-150", isDragging && "z-10 opacity-90")}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <div className="text-sm font-medium">{lead.title}</div>
      <div className="text-xs text-muted">{lead.contact}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="font-medium tabular-nums">{formatMoney(lead.valueMinor, lead.currency)}</span>
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
    <div className="fixed inset-0 z-20 flex justify-end bg-[var(--wf-scrim)]" onClick={onClose}>
      <Card className="h-full w-full max-w-md overflow-y-auto rounded-none p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit lead">
        <div className="mb-5 flex items-center border-b border-line pb-4">
          <h2 className="flex-1 type-stat">{lead.contact}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-xs p-1.5 text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <SaveForm action={updateLead} success="Lead saved" onSaved={onClose} className="space-y-4">
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
          <p className="section-label text-faint">Source: {lead.source}</p>
          <div className="flex gap-2">
            <SubmitButton>Save</SubmitButton>
            {lead.conversationId && (
              <ButtonLink href={`/inbox?c=${lead.conversationId}`} variant="ghost" className="ml-2">
                Open chat
              </ButtonLink>
            )}
          </div>
        </SaveForm>
        <SaveForm action={deleteLead} success="Lead deleted" onSaved={onClose} className="mt-8 border-t border-line pt-4">
          <input type="hidden" name="id" value={lead.id} />
          <SubmitButton variant="ghost" size="sm" className="text-danger" savingLabel="Deleting…" savedLabel="Deleted">
            Delete lead
          </SubmitButton>
        </SaveForm>
      </Card>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
