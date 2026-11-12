"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { BellRing, CircleHelp, Download, Moon, Share, SquarePlus, Sun } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { useHelp } from "@/components/help-drawer";
import { useToast } from "@/components/toast";
import { RowIcon } from "@/components/mobile/grouped";
import { currentSubscription, disablePush, enablePush, pushSupported, useInstall } from "@/components/mobile/pwa";
import { cx } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { usePlatform } from "@/lib/platform";

const rowBtn = "tap flex min-h-12 w-full items-center gap-3 pl-4 text-left active:bg-fill";
const rowBody = "flex min-h-12 min-w-0 flex-1 items-center gap-3 border-b border-line py-2.5 pr-4 group-last/row:border-0";

export function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const current = theme === "dark" ? "dark" : "light";
  return (
    <li className="group/row">
      <div className={cx(rowBtn, "active:bg-transparent")}>
        <RowIcon>{current === "dark" ? <Moon /> : <Sun />}</RowIcon>
        <span className={rowBody}>
          <span className="row-title flex-1">Appearance</span>
          <span role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-0.5 rounded-[9px] bg-fill p-0.5">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={current === t}
                onClick={() => (haptic("tap"), setTheme(t))}
                className={cx("tap h-8 rounded-[7px] px-3 text-13 font-medium capitalize", current === t ? "bg-surface text-ink shadow-xs" : "text-muted")}
              >
                {t}
              </button>
            ))}
          </span>
        </span>
      </div>
    </li>
  );
}

export function HelpRow() {
  const help = useHelp();
  return (
    <li className="group/row">
      <button type="button" onClick={help.open} className={rowBtn}>
        <RowIcon>
          <CircleHelp />
        </RowIcon>
        <span className={rowBody}>
          <span className="row-title flex-1">Help for this app</span>
        </span>
      </button>
    </li>
  );
}

/** Android/Chrome: the real install dialog. iOS Safari has no prompt, so it shows the Share → Add to Home Screen steps. Hidden once installed. */
export function InstallRow() {
  const { state, prompt } = useInstall();
  const { isApple } = usePlatform();
  const [steps, setSteps] = useState(false);
  if (state === "installed") return null;
  return (
    <li className="group/row">
      <button
        type="button"
        onClick={async () => {
          haptic("tap");
          if (state === "prompt") await prompt();
          else setSteps(true);
        }}
        className={rowBtn}
      >
        <RowIcon tone="bg-accent-soft text-accent-text">
          <Download />
        </RowIcon>
        <span className={rowBody}>
          <span className="min-w-0 flex-1">
            <span className="row-title block">Install app</span>
            <span className="row-meta block">Open WhatsFlow from your home screen, full screen</span>
          </span>
        </span>
      </button>
      {steps && (
        <BottomSheet title="Add to Home Screen" onClose={() => setSteps(false)}>
          <ol className="space-y-4 px-5 pb-8 text-base">
            {isApple ? (
              <>
                <li className="flex items-start gap-3">
                  <Step n={1} />
                  <span>
                    Tap <Share size={18} className="inline align-[-3px] text-accent-text" aria-label="Share" /> Share in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Step n={2} />
                  <span>
                    Scroll down and tap <SquarePlus size={18} className="inline align-[-3px]" aria-hidden /> <b className="font-semibold">Add to Home Screen</b>.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Step n={3} />
                  <span>
                    Tap <b className="font-semibold">Add</b>. WhatsFlow opens full screen from your home screen, and can send you notifications.
                  </span>
                </li>
              </>
            ) : (
              <li className="flex items-start gap-3">
                <Step n={1} />
                <span>
                  Open your browser&apos;s menu and choose <b className="font-semibold">Install app</b> or <b className="font-semibold">Add to Home screen</b>.
                </span>
              </li>
            )}
          </ol>
        </BottomSheet>
      )}
    </li>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-full bg-fill text-13 font-semibold">{n}</span>;
}

/** Per-device switch: subscribes or unsubscribes this browser only. */
export function NotificationsToggle({ vapidKey, variant = "row" }: { vapidKey: string | null; variant?: "row" | "card" }) {
  const toast = useToast();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && pushSupported();
  useEffect(() => {
    let live = true;
    currentSubscription().then((s) => live && setOn(Boolean(s) && Notification.permission === "granted"));
    return () => {
      live = false;
    };
  }, []);
  const reason = !vapidKey ? "Not set up on this server yet." : !supported ? "Not available in this browser. On iPhone, install the app first." : null;
  const toggle = async () => {
    if (!vapidKey || busy) return;
    setBusy(true);
    haptic("tap");
    if (on) {
      await disablePush();
      setOn(false);
      toast.success("Notifications off for this device");
    } else {
      const err = await enablePush(vapidKey);
      if (err) toast.error(err);
      else {
        setOn(true);
        toast.success("Notifications on for this device");
      }
    }
    setBusy(false);
  };
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(on)}
      aria-label="Notifications on this device"
      disabled={Boolean(reason) || on === null || busy}
      onClick={toggle}
      className={cx("tap relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50", on ? "bg-accent" : "bg-fill-strong")}
    >
      <span aria-hidden className={cx("absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-200", on && "translate-x-5")} />
    </button>
  );
  const text = (
    <span className="min-w-0 flex-1">
      <span className={cx(variant === "row" ? "row-title" : "text-sm font-medium", "block")}>Notifications on this device</span>
      <span className={cx(variant === "row" ? "row-meta" : "text-13 text-muted", "block")}>{reason ?? "New customer messages and chats assigned to you."}</span>
    </span>
  );
  if (variant === "card")
    return (
      <div className="flex items-center gap-4">
        {text}
        {sw}
      </div>
    );
  return (
    <li className="group/row">
      <div className={cx(rowBtn, "active:bg-transparent")}>
        <RowIcon>
          <BellRing />
        </RowIcon>
        <span className={rowBody}>
          {text}
          {sw}
        </span>
      </div>
    </li>
  );
}
