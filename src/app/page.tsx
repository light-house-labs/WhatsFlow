import Link from "next/link";
import { Bot, CheckCircle2, Inbox, KanbanSquare, LifeBuoy, Megaphone, ShieldCheck, Ticket } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink, Card } from "@/components/ui";
import { PLANS, formatMoney } from "@/lib/plans";

const FEATURES = [
  { icon: Inbox, title: "One inbox for the whole team", body: "Every WhatsApp chat in one place. Assign, label, leave notes, and see who's waiting too long." },
  { icon: Bot, title: "Bots that hand over", body: "Answer the common questions at 11pm, capture what people need, then pass to a person with the full chat." },
  { icon: KanbanSquare, title: "Pipeline from chat", body: "Turn a conversation into a lead in one click. Track value, owner and the next follow-up." },
  { icon: Ticket, title: "Tickets with context", body: "Support requests keep the chat, the photo and the order together, with an owner and a status." },
  { icon: Megaphone, title: "Broadcasts that respect people", body: "Approved templates, segments, scheduled sends, opt-outs honoured automatically." },
  { icon: ShieldCheck, title: "Connection you can check", body: "A live checklist shows if your token, number and webhook work, and tells you how to fix what doesn't." },
];

const PROMISES = [
  "Cancel in one click from Billing. No email, no chat, no call.",
  "We never charge you after you cancel.",
  "A downgrade tells you exactly what will be paused, before you confirm.",
  "Real people answer support, on WhatsApp.",
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="#pricing" className="px-3 text-sm text-muted hover:text-ink">
            Pricing
          </Link>
          <ButtonLink variant="ghost" href="/login">
            Log in
          </ButtonLink>
          <ButtonLink href="/signup">Start free trial</ButtonLink>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12">
        <p className="mb-4 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">The honest WhatsApp CRM</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Your team on WhatsApp, organised. And you can leave any time.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          A shared inbox, bots, broadcasts, pipeline and tickets for businesses that sell and support on WhatsApp. One-click cancel. Real people when you need help.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/signup">Try it free for 14 days</ButtonLink>
          <ButtonLink variant="secondary" href="#how">
            See how it works
          </ButtonLink>
        </div>
        <p className="mt-3 text-sm text-muted">No card. A sandbox number is included so you can try every feature before connecting yours.</p>
      </section>

      <section id="how" className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="text-accent" aria-hidden />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">What we promise, in writing</h2>
            <p className="mt-2 text-muted">Most complaints about WhatsApp tools aren&apos;t about features. They&apos;re about getting stuck. So we built the exits first.</p>
          </div>
          <ul className="space-y-3">
            {PROMISES.map((p) => (
              <li key={p} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={18} aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="pricing" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold">Simple pricing</h2>
          <p className="mt-1 text-sm text-muted">Prices exclude GST. WhatsApp&apos;s own per-message fees are charged by Meta at cost and shown before every broadcast.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(["starter", "team", "custom"] as const).map((id) => {
              const p = PLANS[id];
              return (
                <Card key={id} className="flex flex-col p-6">
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                  <div className="mt-4 text-3xl font-semibold">
                    {p.monthlyMinor ? formatMoney(p.monthlyMinor) : "Let's talk"}
                    {p.monthlyMinor > 0 && <span className="text-sm font-normal text-muted"> / month</span>}
                  </div>
                  {p.yearlyMinor > 0 && <p className="text-xs text-muted">or {formatMoney(p.yearlyMinor)} a year (2 months free)</p>}
                  <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink className="mt-6" variant={id === "team" ? "primary" : "secondary"} href={id === "custom" ? "/signup?plan=custom" : "/signup"}>
                    {id === "custom" ? "Talk to us" : "Start free trial"}
                  </ButtonLink>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted">
        <Logo />
        <span className="flex items-center gap-2">
          <LifeBuoy size={14} aria-hidden /> Help from real people, on WhatsApp
        </span>
      </footer>
    </div>
  );
}
