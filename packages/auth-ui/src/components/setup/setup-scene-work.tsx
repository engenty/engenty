import {
  ChevronDown,
  Download,
  FileText,
  Maximize2,
  Pencil,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Ghost, type SceneCopy, TITLE_BAR } from "./setup-scene-bits";

/** Steps through `loop` while `active`; the first phase otherwise. */
export function useSceneLoop<Phase extends string>(
  loop: readonly { ms: number; phase: Phase }[],
  active: boolean
): Phase {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    const timer = setTimeout(
      () => setStep((value) => (value + 1) % loop.length),
      loop[step]?.ms ?? 4000
    );
    return () => clearTimeout(timer);
  }, [active, loop, step]);
  return (active ? loop[step]?.phase : undefined) ?? (loop[0]?.phase as Phase);
}

/** The engenty screen: its profile, then a conversation, then the draft it opened. */
export const ENGENTY_LOOP = [
  { ms: 2400, phase: "profile" },
  { ms: 3400, phase: "chat" },
  { ms: 6500, phase: "artifact" },
] as const;

export type EngentyPhase = (typeof ENGENTY_LOOP)[number]["phase"];

/**
 * The setup screen: the engenty's conversation is open; its name is clicked
 * and its settings open in the pane, with its browser's live preview; the
 * preview is clicked and the browser fills the pane; the site wants a
 * sign-in, so the chat shows the credentials card, whose values go straight
 * into the page.
 */
export const SETUP_LOOP = [
  { ms: 2600, phase: "chat" },
  { ms: 900, phase: "click" },
  { ms: 3400, phase: "settings" },
  { ms: 700, phase: "preview" },
  { ms: 2600, phase: "browser" },
  { ms: 5200, phase: "signIn" },
] as const;

export type SetupPhase = (typeof SETUP_LOOP)[number]["phase"];

/** How much of the window a side pane takes; the page makes room for it. */
export const END_PANE_WIDTH = "44%";

const GAP = 6;

export function IconButton({ icon: Icon }: { icon: typeof X }) {
  return (
    <span className="flex size-6 items-center justify-center rounded-[6px] text-ink-3">
      <Icon className="size-3.5" />
    </span>
  );
}

/** The app's side pane: a raised card with its top bar, sliding in when `open`. */
export function EndPane({
  actions,
  children,
  open,
  title,
}: {
  actions: ReactNode;
  children: ReactNode;
  open: boolean;
  title: ReactNode;
}) {
  return (
    <section
      className="absolute flex flex-col overflow-hidden rounded-[10px] bg-card shadow-[0_12px_32px_-14px_oklch(0%_0_0/0.4)] ring-1 ring-ink/8"
      style={{
        bottom: GAP,
        opacity: open ? 1 : 0,
        right: GAP,
        top: TITLE_BAR + GAP,
        transform: open ? "translateX(0)" : "translateX(30%)",
        transition:
          "transform 900ms cubic-bezier(0.4, 0, 0.2, 1), opacity 700ms ease",
        width: `calc(${END_PANE_WIDTH} - ${GAP * 2}px)`,
      }}
    >
      <header className="flex h-8 shrink-0 items-center gap-1 border-ink/8 border-b px-1.5">
        <div className="flex min-w-0 flex-1 items-center">{title}</div>
        {actions}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** The draft the engenty opened: the artifact pane with its picker and tools. */
export function ArtifactPane({
  copy,
  open,
}: {
  copy: SceneCopy;
  open: boolean;
}) {
  return (
    <EndPane
      actions={
        <>
          <IconButton icon={Pencil} />
          <IconButton icon={Download} />
          <IconButton icon={Maximize2} />
          <IconButton icon={X} />
        </>
      }
      open={open}
      title={
        <span className="flex min-w-0 items-center gap-1.5 px-1">
          <FileText className="size-3.5 shrink-0 text-ink-3" />
          <span className="truncate font-medium text-[11.5px] text-ink">
            {copy.paneTitle}
          </span>
          <ChevronDown className="size-3 shrink-0 text-ink-3" />
          <span className="shrink-0 rounded-full bg-ink/[0.06] px-1.5 py-px text-[9px] text-ink-3">
            {copy.scopeSpace}
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-3.5">
        <span className="w-fit rounded-full bg-amber-500/15 px-1.5 py-px text-[9.5px] text-amber-700">
          {copy.paneBadge}
        </span>
        <div className="space-y-2">
          <Ghost width={170} />
          <Ghost width={130} />
        </div>
        <div className="divide-y divide-ink/6 rounded-[8px] ring-1 ring-ink/8">
          {[110, 80, 120].map((width) => (
            <div className="flex items-center gap-3 px-3 py-2" key={width}>
              <Ghost width={width} />
              <span className="ml-auto">
                <Ghost width={36} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </EndPane>
  );
}
