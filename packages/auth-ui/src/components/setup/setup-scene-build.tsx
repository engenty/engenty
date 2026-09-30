// The engenty Apps card's story, drawn like the app: the space's engenty is
// asked for a routine and answers; its workflow shows in a dialog; the
// routine runs as a wizard, one question per screen across the whole window;
// its last screen says it is done, and the result opens in the side pane.

import { cn, EngentyLogoMark } from "@engenty/ui-core";
import {
  Check,
  Clock,
  Download,
  FileText,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";
import { Bubble, Ghost, type SceneCopy, TITLE_BAR } from "./setup-scene-bits";
import { EndPane, IconButton } from "./setup-scene-work";

/** The story's beats, with how long each one shows. */
export const BUILD_LOOP = [
  { ms: 3200, phase: "ask" },
  { ms: 3800, phase: "workflow" },
  { ms: 3400, phase: "wizard" },
  { ms: 5200, phase: "result" },
] as const;

export type BuildPhase = (typeof BUILD_LOOP)[number]["phase"];

/** The ask on the engenty's desk, and its answer. */
export function BuildChat({
  copy,
  phase,
}: {
  copy: SceneCopy["build"];
  phase: BuildPhase;
}) {
  return (
    <div className="flex h-full flex-col justify-end gap-2">
      <Bubble mine small>
        {copy.ask}
      </Bubble>
      <p className="fade-in animate-in fill-mode-both text-[11px] text-ink delay-700 duration-500">
        {copy.reply}
      </p>
      {phase === "workflow" ? (
        <span className="flex w-fit items-center gap-1.5 rounded-[8px] px-2 py-1 text-[10.5px] text-ink-2 ring-1 ring-ink/10">
          <Sparkles className="size-3 text-primary" />
          {copy.workflow.title}
        </span>
      ) : null}
    </div>
  );
}

/** The routine's workflow in a dialog over the window. */
export function WorkflowDialog({
  copy,
  open,
}: {
  copy: SceneCopy["build"]["workflow"];
  open: boolean;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/40 transition-opacity duration-500"
      style={{
        opacity: open ? 1 : 0,
        pointerEvents: "none",
        top: TITLE_BAR,
      }}
    >
      <div
        className="flex w-[62%] flex-col gap-2.5 rounded-[12px] bg-card p-3.5 shadow-2xl ring-1 ring-ink/10 transition-transform duration-500"
        style={{ transform: open ? "scale(1)" : "scale(0.94)" }}
      >
        <div className="flex items-start gap-2">
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/12 text-primary">
            <Sparkles className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-heading font-semibold text-[13px] text-ink">
              {copy.title}
            </span>
            <span className="flex items-center gap-1 text-[9.5px] text-ink-3">
              <Clock className="size-2.5" />
              {copy.schedule}
            </span>
          </span>
        </div>
        <ol className="flex flex-col">
          {copy.steps.map((step, index) => (
            <li className="flex items-stretch gap-2" key={step}>
              <span className="flex flex-col items-center">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-ink/[0.08] font-mono text-[8.5px] text-ink-2">
                  {index + 1}
                </span>
                {index < copy.steps.length - 1 ? (
                  <span className="w-px flex-1 bg-ink/12" />
                ) : null}
              </span>
              <span className="pb-2 text-[10.5px] text-ink leading-4">
                {step}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex justify-end gap-1.5">
          <span className="rounded-[6px] px-2 py-1 text-[10px] text-ink-2">
            {copy.cancel}
          </span>
          <span className="rounded-[6px] bg-primary px-2.5 py-1 text-[10px] text-primary-foreground">
            {copy.run}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The wizard's screens across the whole page: a question, then the ending. */
export function WizardScreen({
  copy,
  phase,
}: {
  copy: SceneCopy["build"];
  phase: BuildPhase;
}) {
  if (phase === "result") {
    return (
      <div
        className="fade-in slide-in-from-bottom-2 flex h-full animate-in flex-col items-start justify-center gap-2.5 px-2 duration-500"
        key="done"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <Check className="size-4" strokeWidth={2.5} />
        </span>
        <span className="font-heading font-semibold text-[17px] text-ink tracking-tight">
          {copy.done.title}
        </span>
        <p className="text-[11px] text-ink-2">{copy.done.summary}</p>
        <span className="text-[10.5px] text-ink underline underline-offset-4">
          {copy.done.open}
        </span>
      </div>
    );
  }
  return (
    <div
      className="fade-in slide-in-from-bottom-2 flex h-full animate-in flex-col justify-center gap-3 px-6 duration-500"
      key="gate"
    >
      <div className="flex items-center gap-2 text-[9.5px] text-ink-3">
        <EngentyLogoMark size={14} />
        {copy.wizard.step}
      </div>
      <span className="font-heading font-semibold text-[16px] text-ink leading-tight tracking-tight">
        {copy.wizard.question}
      </span>
      <div className="flex flex-col gap-1.5">
        {copy.wizard.choices.map((choice, index) => (
          <span
            className={cn(
              "flex items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-[11px] ring-1",
              index === 0
                ? "bg-primary/5 text-primary ring-primary"
                : "text-ink ring-ink/10"
            )}
            key={choice}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[3px] font-mono text-[9px]",
                index === 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-ink/[0.07] text-ink-3"
              )}
            >
              {index + 1}
            </span>
            {choice}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The routine's result in the side pane: the report it wrote. */
export function ResultPane({
  copy,
  open,
}: {
  copy: SceneCopy["build"]["result"];
  open: boolean;
}) {
  return (
    <EndPane
      actions={
        <>
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
            {copy.title}
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-3.5">
        <span className="w-fit rounded-full bg-amber-500/15 px-1.5 py-px text-[9.5px] text-amber-700">
          {copy.badge}
        </span>
        {[0, 1, 2].map((block) => (
          <div className="space-y-1.5" key={block}>
            <Ghost width={90} />
            <Ghost width={170} />
            <Ghost width={140} />
          </div>
        ))}
      </div>
    </EndPane>
  );
}
