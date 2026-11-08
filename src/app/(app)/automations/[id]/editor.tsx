"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { AutomationStep, AutomationTrigger } from "@/db/schema";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { saveAutomation } from "../actions";
import { TRIGGER_LABEL, TRIGGER_VARS } from "../labels";

type State = { name: string; trigger: AutomationTrigger; minutes: number; steps: AutomationStep[]; live: boolean };

const NEW_STEP: Record<AutomationStep["type"], AutomationStep> = {
  wait: { type: "wait", minutes: 60 },
  send_text: { type: "send_text", text: "" },
  send_template: { type: "send_template", templateId: "" },
  add_tag: { type: "add_tag", tag: "" },
  assign: { type: "assign", userId: "" },
  if_tag: { type: "if_tag", tag: "" },
};
const STEP_LABEL: Record<AutomationStep["type"], string> = {
  wait: "Wait",
  send_text: "Send a message",
  send_template: "Send a template",
  add_tag: "Tag the contact",
  assign: "Assign the chat",
  if_tag: "Continue only if tagged",
};

export function Editor({ id, initial, templates, team }: { id: string; initial: State; templates: { id: string; name: string }[]; team: { id: string; name: string }[] }) {
  const [s, setS] = useState<State>(initial);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const setStep = (i: number, step: AutomationStep) => setS({ ...s, steps: s.steps.map((x, j) => (j === i ? step : x)) });
  const move = (i: number, by: number) => {
    const steps = [...s.steps];
    const [x] = steps.splice(i, 1);
    steps.splice(i + by, 0, x);
    setS({ ...s, steps });
  };
  const save = (live: boolean) =>
    start(async () => {
      const r = await saveAutomation(id, { ...s, live });
      if (r.ok) setS({ ...s, live });
      setMsg(r.ok ? { tone: "success", text: live ? "Saved and live." : "Saved as draft." } : { tone: "danger", text: r.error });
    });
  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card className="space-y-4 p-5">
        <Field label="Name" htmlFor="aname">
          <Input id="aname" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
        </Field>
        <Field label="When" htmlFor="trig">
          <Select id="trig" value={s.trigger} onChange={(e) => setS({ ...s, trigger: e.target.value as AutomationTrigger })}>
            {Object.entries(TRIGGER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {s.trigger === "no_reply" && (
          <Field label="For at least (minutes)" htmlFor="mins" hint="Counts from our last message. Runs once per unanswered message.">
            <Input id="mins" type="number" min={5} value={s.minutes} onChange={(e) => setS({ ...s, minutes: Number(e.target.value) })} />
          </Field>
        )}
      </Card>
      {s.steps.map((step, i) => (
        <Card key={i} className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
            <Select aria-label="Step type" value={step.type} onChange={(e) => setStep(i, NEW_STEP[e.target.value as AutomationStep["type"]])} className="h-8 max-w-56">
              {Object.entries(STEP_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={14} />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === s.steps.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={14} />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Remove step" onClick={() => setS({ ...s, steps: s.steps.filter((_, j) => j !== i) })}>
                <X size={14} />
              </Button>
            </div>
          </div>
          {step.type === "wait" && (
            <div className="flex items-center gap-2 text-sm">
              <Input aria-label="Minutes" type="number" min={1} value={step.minutes} onChange={(e) => setStep(i, { ...step, minutes: Number(e.target.value) })} className="w-28" />
              minutes ({step.minutes >= 1440 ? `${(step.minutes / 1440).toFixed(1)} days` : `${(step.minutes / 60).toFixed(1)} hours`})
            </div>
          )}
          {step.type === "send_text" && (
            <Textarea
              aria-label="Message"
              rows={3}
              value={step.text}
              onChange={(e) => setStep(i, { ...step, text: e.target.value })}
              placeholder={`Use ${TRIGGER_VARS[s.trigger].map((v) => `{${v}}`).join(", ")}. Free text only reaches people who messaged you in the last 24 hours; use a template for later.`}
            />
          )}
          {step.type === "send_template" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select aria-label="Template" value={step.templateId} onChange={(e) => setStep(i, { ...step, templateId: e.target.value })}>
                <option value="">Choose an approved template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Template variables"
                value={(step.variables ?? ["name"]).join(", ")}
                onChange={(e) => setStep(i, { ...step, variables: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                placeholder="name, order_number"
                title={`Fills {{1}}, {{2}}… in order. Available: ${TRIGGER_VARS[s.trigger].join(", ")}`}
              />
            </div>
          )}
          {(step.type === "add_tag" || step.type === "if_tag") && (
            <Input aria-label="Tag" value={step.tag} onChange={(e) => setStep(i, { ...step, tag: e.target.value.toLowerCase() })} placeholder="vip" />
          )}
          {step.type === "assign" && (
            <Select aria-label="Teammate" value={step.userId} onChange={(e) => setStep(i, { ...step, userId: e.target.value })}>
              <option value="">Choose…</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Card>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setS({ ...s, steps: [...s.steps, { type: "send_text", text: "" }] })} disabled={s.steps.length >= 20}>
          + Add step
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => save(false)}>
            {s.live ? "Pause" : "Save draft"}
          </Button>
          <Button disabled={pending} onClick={() => save(true)}>
            {s.live ? "Save" : "Save & go live"}
          </Button>
        </div>
      </div>
    </div>
  );
}
