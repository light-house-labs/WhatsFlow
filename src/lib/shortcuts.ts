/** Every keyboard shortcut in the app, defined once. "mod" is Cmd on Apple, Ctrl elsewhere. */
export const SHORTCUTS = {
  search: "mod+k",
  searchSlash: "/",
  help: "shift+/",
  openInNewTab: "mod+enter",
  open: "enter",
  navigate: ["up", "down"],
  close: "esc",
  send: "enter",
  newLine: "shift+enter",
} as const;

export type Combo = string;

type Parsed = {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  key: string;
};

export function parseCombo(combo: Combo): Parsed {
  const parts = combo.toLowerCase().split("+");
  // A trailing "+" key ("mod++") parses as an empty last part.
  const key = parts.pop() || "+";
  return {
    mod: parts.includes("mod"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    ctrl: parts.includes("ctrl"),
    key,
  };
}

const KEY_ALIAS: Record<string, string> = {
  esc: "escape",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  space: " ",
};
const SHIFTED: Record<string, string> = { "/": "?" };

type KeyLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/** Does this keyboard event match the combo on this platform? */
export function matchCombo(
  e: KeyLike,
  combo: Combo,
  isApple: boolean,
): boolean {
  const c = parseCombo(combo);
  const want = KEY_ALIAS[c.key] ?? c.key;
  const wantMeta = isApple && c.mod;
  const wantCtrl = isApple ? c.ctrl : c.mod || c.ctrl;
  if (e.metaKey !== wantMeta || e.ctrlKey !== wantCtrl || e.altKey !== c.alt)
    return false;
  const key = e.key.toLowerCase();
  const symbol = want.length === 1 && !/[a-z0-9]/.test(want);
  if (symbol) {
    // Symbols ride on shift on many layouts, so shift is judged by the character produced.
    return c.shift ? key === (SHIFTED[want] ?? want) : key === want;
  }
  return e.shiftKey === c.shift && key === want;
}

const APPLE_GLYPH: Record<string, string> = {
  mod: "⌘",
  alt: "⌥",
  shift: "⇧",
  ctrl: "⌃",
  enter: "↵",
  backspace: "⌫",
  esc: "esc",
};
const OTHER_LABEL: Record<string, string> = {
  mod: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  ctrl: "Ctrl",
  enter: "Enter",
  backspace: "Backspace",
  esc: "Esc",
};
const ARROW: Record<string, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

/** Display tokens for a combo, e.g. "mod+k" -> ["⌘", "K"] or ["Ctrl", "K"]. */
export function comboLabels(combo: Combo, isApple: boolean): string[] {
  const c = parseCombo(combo);
  const out: string[] = [];
  const name = (t: string) =>
    ARROW[t] ?? (isApple ? APPLE_GLYPH[t] : OTHER_LABEL[t]) ?? t.toUpperCase();
  if (c.ctrl) out.push(name("ctrl"));
  if (c.alt) out.push(name("alt"));
  if (c.shift && c.key !== "/") out.push(name("shift"));
  if (c.mod) out.push(name("mod"));
  out.push(c.shift && c.key === "/" ? "?" : name(c.key));
  return out;
}

/** True for fields where plain-key shortcuts must not fire. */
export function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return Boolean(
    el &&
    (el.isContentEditable ||
      el.closest?.(
        "input, textarea, select, [contenteditable='true'], [contenteditable='']",
      )),
  );
}
