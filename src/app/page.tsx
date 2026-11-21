import Link from "next/link";
import { Bot, CheckCircle2, Inbox, KanbanSquare, Megaphone, ShieldCheck, Ticket } from "lucide-react";
import { Logo } from "@/components/logo";
import { Beams } from "@/components/beams";
import { ButtonLink } from "@/components/ui";

const FEATURES = [
  { icon: Inbox, title: "One inbox for the whole team", body: "Every WhatsApp chat in one place. Assign, label, leave notes, and see who's waiting too long." },
  { icon: Bot, title: "Bots that hand over", body: "Answer the common questions at 11pm, capture what people need, then pass to a person with the full chat." },
  { icon: KanbanSquare, title: "Pipeline from chat", body: "Turn a conversation into a lead in one click. Track value, owner and the next follow-up." },
  { icon: Ticket, title: "Tickets with context", body: "Support requests keep the chat, the photo and the order together, with an owner and a status." },
  { icon: Megaphone, title: "Broadcasts that respect people", body: "Approved templates, segments, scheduled sends, opt-outs honoured automatically." },
  { icon: ShieldCheck, title: "Connection you can check", body: "A live checklist shows if your token, number and webhook work, and tells you how to fix what doesn't." },
];

const PROMISES = [
  "Open source. Read every line, run it on your own server.",
  "No seat limits, no feature tiers, no trial clock.",
  "Your data lives in your own Postgres database. Export it any time.",
  "Built on the official WhatsApp Cloud API, so your number stays yours.",
];

const TAGS = ["Shared inbox", "Bots", "Broadcasts", "Pipeline"];

export default function Home() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Logo byline />
          <nav className="flex items-center gap-2">
            <ButtonLink variant="ghost" arrow={false} href="/login">
              Log in
            </ButtonLink>
            <ButtonLink href="/signup" className="rounded-full! px-4">
              Get started
            </ButtonLink>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <Beams className="pointer-events-none absolute inset-0 h-full w-full text-ink" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-24 text-center sm:pt-32">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="size-1.5 rounded-full bg-[var(--wf-brand)]" aria-hidden />
            The open-source WhatsApp CRM
          </span>
          <h1 className="type-display text-[44px] sm:text-[72px]">
            Your team on WhatsApp, <span className="text-faint">organised.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            A shared inbox, bots, broadcasts, pipeline and tickets for businesses that sell and support on WhatsApp. Free, open source, and yours to run.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/signup" className="h-11 px-6 text-[15px]">
              Create your workspace
            </ButtonLink>
            <ButtonLink variant="secondary" href="#how" className="h-11 border-transparent! bg-fill! px-6 text-[15px] hover:bg-fill-strong!">
              See how it works
            </ButtonLink>
          </div>
          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
            {TAGS.map((t, i) => (
              <li key={t} className="flex items-center gap-5">
                {i > 0 && <span className="size-1 rounded-full bg-line-strong" aria-hidden />}
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how" className="border-y border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="type-display max-w-2xl text-[32px] sm:text-[44px]">
            Everything a WhatsApp team needs. <span className="text-faint">Nothing it doesn&apos;t.</span>
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="group rounded-xl border border-line bg-surface p-6 transition-colors hover:border-line-strong">
                <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-text">
                  <Icon size={18} strokeWidth={1.75} aria-hidden />
                </span>
                <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.01em]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0e0e10] text-[#e4e4e7]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2">
          <div>
            <h2 className="type-display text-[32px] text-white sm:text-[44px]">
              Yours to run. <span className="text-[#71717a]">Not rent.</span>
            </h2>
            <p className="mt-4 max-w-md text-[#a1a1aa]">Most complaints about WhatsApp tools aren&apos;t about features. They&apos;re about getting stuck. Harbor is open source, so you never are.</p>
            <ButtonLink href="/signup" className="mt-8 h-11 px-6 text-[15px]">
              Get started
            </ButtonLink>
          </div>
          <ul className="border-t border-[#2f2f34]">
            {PROMISES.map((p) => (
              <li key={p} className="flex gap-3 border-b border-[#2f2f34] py-4">
                <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--wf-brand)]" size={18} strokeWidth={1.75} aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted">
        <Logo byline />
        <span className="flex items-center gap-4">
          <span>© {new Date().getFullYear()} LightHouse Labs</span>
          <Link href="/status" className="hover:text-ink">
            System status
          </Link>
        </span>
      </footer>
    </div>
  );
}
