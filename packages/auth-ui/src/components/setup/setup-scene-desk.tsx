// An engenty's desk, drawn like the app's: a top bar with its face and name
// and the desk's tools, a header with its face, name, "open" badge, job and
// role, the conversation (its words plain, the person's in bubbles) and the
// composer. A click on its name opens its settings in the side pane: its
// browser with the space's two grants, its routines and connections; a click
// on the browser's preview opens the browser in the pane.

import { cn, Engenty, type EngentyKind } from "@engenty/ui-core";
import {
  ArrowLeft,
  Brain,
  ChevronDown,
  Crown,
  EllipsisVertical,
  FileText,
  Gauge,
  Globe,
  Lock,
  Maximize2,
  Mic,
  Monitor,
  MousePointerClick,
  Play,
  Plus,
  RotateCw,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SpaceWorkRules } from "../../lib/initial-setup-workspace";
import { Bubble, type SceneCopy } from "./setup-scene-bits";
import {
  EndPane,
  type EngentyPhase,
  IconButton,
  type SetupPhase,
} from "./setup-scene-work";

export interface DeskEngenty {
  job: string;
  kind: EngentyKind;
  name: string;
}

/** The desk's top bar: its face and name (clicked on the setup screen), its tools. */
export function DeskBar({
  copy,
  engenty,
  pressed,
}: {
  copy: SceneCopy["desk"];
  engenty: DeskEngenty;
  pressed: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex w-full items-center gap-1">
        <span
          className={cn(
            "-mx-1 flex min-w-0 items-center gap-1.5 rounded-[7px] px-1 py-0.5 transition-[background-color,box-shadow] duration-300",
            pressed && "bg-ink/[0.07] ring-2 ring-primary/50"
          )}
        >
          <Engenty animated={false} kind={engenty.kind} size={16} />
          <span className="truncate text-[12px] text-ink">{engenty.name}</span>
        </span>
        <span className="ml-auto flex items-center">
          <IconButton icon={Monitor} />
          <IconButton icon={EllipsisVertical} />
        </span>
      </div>
      <OpenBadge copy={copy} />
    </div>
  );
}

function OpenBadge({ copy }: { copy: SceneCopy["desk"] }) {
  return (
    <span className="flex w-fit items-center gap-1 rounded-full bg-primary/12 px-1.5 py-px text-[9.5px] text-primary">
      <Users className="size-2.5" />
      {copy.open}
    </span>
  );
}

/** The desk's header: face, name, badge, job, role. */
export function DeskHero({
  copy,
  engenty,
}: {
  copy: SceneCopy["desk"];
  engenty: DeskEngenty;
}) {
  return (
    <div className="flex items-start gap-3">
      <Engenty animated kind={engenty.kind} size={36} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-heading font-semibold text-[15px] text-ink leading-tight">
          {engenty.name || "…"}
        </span>
        <OpenBadge copy={copy} />
        <p className="line-clamp-2 text-[10.5px] text-ink-3 leading-snug">
          {engenty.job}
        </p>
        <span className="flex items-center gap-1 truncate text-[9.5px] text-ink-3">
          <Crown className="size-2.5 shrink-0 text-amber-500" />
          {copy.role}
        </span>
      </div>
    </div>
  );
}

/** The engenty's words, plain, as the desk shows them. */
function Said({ children }: { children: ReactNode }) {
  return (
    <p className="fade-in slide-in-from-bottom-1 animate-in text-[11px] text-ink leading-relaxed duration-500">
      {children}
    </p>
  );
}

/** Who speaks, above their turn. */
function Sender({ mine = false, name }: { mine?: boolean; name: string }) {
  return (
    <span className={cn("text-[9.5px] text-ink-3", mine && "self-end")}>
      {name}
    </span>
  );
}

/** The collapsed row a turn's tool calls fold into. */
function ToolRow({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
      <Brain className="size-3" />
      {label}
      <ChevronDown className="ml-auto size-3" />
    </span>
  );
}

function Chip({
  children,
  primary = false,
}: {
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[10.5px]",
        primary
          ? "bg-primary text-primary-foreground"
          : "text-ink-2 ring-1 ring-ink/12"
      )}
    >
      {children}
    </span>
  );
}

/** The engenty screen's conversation: asked for an offer, it opens the draft. */
export function EngentyChat({
  copy,
  phase,
}: {
  copy: SceneCopy;
  phase: EngentyPhase;
}) {
  if (phase === "profile") {
    return null;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <Bubble mine small>
        {copy.engentyAsk}
      </Bubble>
      {phase === "artifact" ? (
        <>
          <Said>{copy.engentyDone}</Said>
          <span className="fade-in flex w-fit animate-in items-center gap-1.5 rounded-[8px] px-2 py-1 text-[10.5px] text-ink-2 ring-1 ring-ink/10 duration-500">
            <FileText className="size-3 text-ink-3" />
            {copy.paneTitle}
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * The chat's credentials card, as a login parks on it: where the values go,
 * the fields, and the promise that they go straight into the page, never to
 * the engenty.
 */
function CredentialsCard({ copy }: { copy: SceneCopy["computer"] }) {
  const card = copy.card;
  return (
    <section className="fade-in slide-in-from-bottom-1 flex animate-in flex-col gap-1.5 rounded-[8px] bg-card p-2 shadow-sm ring-1 ring-ink/10 duration-500">
      <span className="font-medium text-[11px] text-ink">{card.title}</span>
      <span className="flex items-center gap-1 text-[9px] text-ink-3">
        <Lock className="size-2.5 shrink-0" />
        <span className="truncate">
          {card.goesTo}{" "}
          <strong className="font-medium text-ink">{copy.tab}</strong>
        </span>
      </span>
      {[
        { label: copy.email, value: copy.emailValue },
        { label: copy.password, value: "••••••••" },
      ].map((field) => (
        <span className="flex flex-col gap-0.5" key={field.label}>
          <span className="text-[8.5px] text-ink-2">{field.label}</span>
          <span className="rounded-[4px] px-1.5 py-0.5 text-[9.5px] text-ink ring-1 ring-ink/12">
            {field.value}
          </span>
        </span>
      ))}
      <span className="text-[8.5px] text-ink-3 leading-snug">
        {card.private}
      </span>
      <span className="flex items-center justify-end gap-1.5">
        <span className="px-1.5 text-[9px] text-ink-2">{card.decline}</span>
        <span className="rounded-[4px] bg-primary px-2 py-0.5 text-[9px] text-primary-foreground">
          {card.fill}
        </span>
      </span>
    </section>
  );
}

/**
 * The setup screen's conversation: the engenty heads for the web. Without
 * the autostart grant it asks first, and the person says yes; the site
 * wants a sign-in, and the chat shows the credentials card for it.
 */
export function BrowserChat({
  autostart,
  copy,
  desk,
  engenty,
  person,
  phase,
}: {
  autostart: boolean;
  copy: SceneCopy["computer"];
  desk: SceneCopy["desk"];
  engenty: string;
  person: string;
  phase: SetupPhase;
}) {
  const answered = phase !== "chat" && phase !== "click";
  return (
    // Anchored to the bottom like a chat: the newest turn always shows.
    <div className="flex h-full flex-col justify-end gap-1.5">
      <Sender name={engenty} />
      {phase === "signIn" ? null : <ToolRow label={desk.toolUsed} />}
      <Said>{copy.fetch}</Said>
      {autostart || phase === "signIn" ? null : (
        <>
          <Said>{copy.askStart}</Said>
          {answered ? (
            <>
              <Sender mine name={person} />
              <Bubble mine small>
                {copy.start}
              </Bubble>
            </>
          ) : (
            <div className="flex gap-1.5">
              <Chip primary>{copy.start}</Chip>
              <Chip>{copy.notNow}</Chip>
            </div>
          )}
        </>
      )}
      {phase === "signIn" ? <CredentialsCard copy={copy} /> : null}
    </div>
  );
}

/** The desk's composer: who reads along, and the voice button. */
export function DeskComposer({
  approval,
  copy,
  engenty,
  space,
}: {
  /** The approval mode's name, as the composer's pill shows it. */
  approval: string;
  copy: SceneCopy;
  engenty: DeskEngenty;
  space: string;
}) {
  return (
    <div className="mx-4 mb-2 flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded-full bg-card py-1 pr-1 pl-1 shadow-[0_4px_14px_-6px_oklch(0%_0_0/0.18)] ring-1 ring-ink/10">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-3">
          <Plus className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-ink-4">
          {copy.composerTo(engenty.name || "…")} · {copy.desk.readable(space)}
        </span>
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Mic className="size-3" />
        </span>
      </div>
      <div className="flex items-center gap-3 px-2 text-[9.5px] text-ink-3">
        <span className="flex items-center gap-0.5">
          <Gauge className="size-2.5" />
          {copy.desk.effort}
          <ChevronDown className="size-2.5" />
        </span>
        <span className="flex items-center gap-0.5">
          <ShieldCheck className="size-2.5" />
          {copy.desk.approval(approval)}
          <ChevronDown className="size-2.5" />
        </span>
      </div>
    </div>
  );
}

/** A switch, drawn: on or off, as the setup form has it. */
function Toggle({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className={cn(
          "relative inline-flex h-3 w-5 shrink-0 rounded-full transition-colors duration-300",
          on ? "bg-primary" : "bg-ink/20"
        )}
      >
        <span
          className="absolute top-0.5 size-2 rounded-full bg-white shadow-sm transition-[left] duration-300"
          style={{ left: on ? 10 : 2 }}
        />
      </span>
      <span className="truncate text-[9px] text-ink-3">{label}</span>
    </span>
  );
}

function Section({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="font-semibold text-[10.5px] text-ink">{title}</span>
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </div>
  );
}

const TEASER_TONES = [
  "oklch(70% 0.08 60)",
  "oklch(60% 0.07 150)",
  "oklch(55% 0.06 20)",
] as const;

/** The website, drawn small: a masthead, a lead story, a row of teasers. */
function NewsPage({ compact = false }: { compact?: boolean }) {
  const bar = compact ? "h-1" : "h-1.5";
  return (
    <div className="flex h-full flex-col gap-1.5 bg-white p-2 text-[oklch(25%_0.01_60)]">
      <div className="flex items-center gap-1.5 border-black/10 border-b pb-1">
        <span
          className={cn(
            "font-bold font-heading tracking-tight",
            compact ? "text-[8px]" : "text-[11px]"
          )}
        >
          mywebsite.com
        </span>
        {[20, 16, 24].map((width) => (
          <span
            className={cn("block rounded-full bg-black/10", bar)}
            key={width}
            style={{ width }}
          />
        ))}
      </div>
      <div className="flex gap-1.5">
        <span className="aspect-[4/3] w-1/2 rounded-[2px] bg-[linear-gradient(135deg,oklch(62%_0.09_240),oklch(45%_0.08_250))]" />
        <div className="flex flex-1 flex-col gap-1">
          {[1, 0.8, 0.9, 0.6].map((part) => (
            <span
              className={cn("block rounded-full bg-black/12", bar)}
              key={part}
              style={{ width: `${part * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {TEASER_TONES.map((tone) => (
          <span
            className="aspect-video rounded-[2px]"
            key={tone}
            style={{ background: tone }}
          />
        ))}
      </div>
    </div>
  );
}

/** The site's sign-in form over the page, its fields marked for the card. */
function SignInForm({ copy }: { copy: SceneCopy["computer"] }) {
  return (
    <div className="fade-in absolute inset-0 flex animate-in items-center justify-center bg-black/35 duration-500">
      <div className="flex w-[70%] flex-col gap-1.5 rounded-[4px] bg-white p-2.5 text-[oklch(25%_0.01_60)] shadow-lg">
        <span className="font-semibold text-[10.5px]">{copy.signIn}</span>
        {[copy.email, copy.password].map((field, index) => (
          <span
            className="relative rounded-[3px] px-1.5 py-1 text-[8.5px] text-black/40 ring-2 ring-[oklch(64%_0.195_35)]"
            key={field}
          >
            {field}
            <span className="absolute -top-1.5 -right-1.5 flex size-3 items-center justify-center rounded-full bg-[oklch(64%_0.195_35)] font-mono text-[7px] text-white">
              {index + 1}
            </span>
          </span>
        ))}
        <span className="rounded-[3px] bg-[oklch(45%_0.12_250)] py-1 text-center text-[8.5px] text-white">
          {copy.signIn}
        </span>
      </div>
    </div>
  );
}

/** The engenty's settings: face, job, its browser with the space's grants, routines, connections. */
function SettingsContent({
  copy,
  engenty,
  pressed,
  work,
}: {
  copy: SceneCopy["computer"];
  engenty: DeskEngenty;
  pressed: boolean;
  work: SpaceWorkRules;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-2.5">
      <div className="flex items-start gap-2">
        <Engenty animated={false} kind={engenty.kind} size={22} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-[12px] text-ink">
            {engenty.name}
          </span>
          <span className="line-clamp-2 text-[9.5px] text-ink-2 leading-snug">
            {engenty.job}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-col gap-1.5 rounded-[8px] bg-ink/[0.04] p-1.5">
          <div
            className={cn(
              "relative h-[92px] overflow-hidden rounded-[5px] bg-black px-5 py-1 transition-[box-shadow] duration-300",
              pressed && "ring-2 ring-primary"
            )}
          >
            <div className="h-full overflow-hidden rounded-[3px]">
              <NewsPage compact />
            </div>
            <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/70 px-1 text-[7px] text-white">
              <Play className="size-1.5 fill-current" />
              {copy.driving}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <Toggle label={copy.autostart} on={work.browser.autostart} />
            <Toggle label={copy.unattended} on={work.browser.unattended} />
          </div>
        </div>
        <span className="text-center text-[9px] text-ink-3">
          {copy.screenCaption(engenty.name)}
        </span>
      </div>
      <Section
        action={<Plus className="size-3 text-ink-3" />}
        title={
          <>
            {copy.routines} <span className="font-normal text-ink-3">0</span>
          </>
        }
      >
        <p className="rounded-[6px] bg-card px-2 py-1.5 text-[9.5px] text-ink-3 ring-1 ring-ink/6">
          {copy.noRoutines}
        </p>
      </Section>
      <Section
        action={
          <span className="text-[9.5px] text-primary">{copy.connect}</span>
        }
        title={copy.connections}
      >
        <p className="text-[9px] text-ink-3">{copy.connectionsHint}</p>
        <p className="rounded-[6px] bg-card px-2 py-1.5 text-[9.5px] text-ink-3 ring-1 ring-ink/6">
          {copy.noConnections}
        </p>
      </Section>
    </div>
  );
}

/** The browser in the pane: tabs, address with who drives, take over, the page. */
function BrowserContent({
  copy,
  signIn,
}: {
  copy: SceneCopy["computer"];
  signIn: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-1 border-ink/8 border-b px-1.5 py-1">
        <IconButton icon={ArrowLeft} />
        <IconButton icon={RotateCw} />
        <span className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[9.5px]">
          <Lock className="size-2.5 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate text-ink-2">{copy.url}</span>
          <span className="flex min-w-0 shrink items-center gap-1 text-ink-3">
            <span className="size-1 shrink-0 animate-pulse rounded-full bg-emerald-500" />
            <span className="truncate">{copy.driving}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[9.5px] text-ink-2 ring-1 ring-ink/12">
          <MousePointerClick className="size-2.5" />
          {copy.takeOver}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center bg-black px-2">
        <div className="relative overflow-hidden rounded-[3px]">
          <NewsPage />
          {signIn ? <SignInForm copy={copy} /> : null}
        </div>
      </div>
    </>
  );
}

/**
 * The setup screen's side pane, as the desk opens it: the engenty's settings,
 * then (from the preview) its browser in the same pane.
 */
export function SetupPane({
  copy,
  engenty,
  phase,
  work,
}: {
  copy: SceneCopy["computer"];
  engenty: DeskEngenty;
  phase: SetupPhase;
  work: SpaceWorkRules;
}) {
  const browser = phase === "browser" || phase === "signIn";
  return (
    <EndPane
      actions={
        browser ? (
          <>
            <IconButton icon={Maximize2} />
            <IconButton icon={X} />
          </>
        ) : (
          <>
            <IconButton icon={Settings} />
            <IconButton icon={X} />
          </>
        )
      }
      open={phase !== "chat" && phase !== "click"}
      title={
        browser ? (
          <span className="flex min-w-0 items-center gap-1">
            <span className="flex min-w-0 items-center gap-1 rounded-[6px] bg-ink/[0.07] px-1.5 py-1 text-[10px] text-ink">
              <Globe className="size-2.5 shrink-0 text-ink-3" />
              <span className="truncate">{copy.tab}</span>
            </span>
          </span>
        ) : null
      }
    >
      <div
        className="fade-in flex min-h-0 flex-1 animate-in flex-col duration-500"
        key={browser ? "browser" : "settings"}
      >
        {browser ? (
          <BrowserContent copy={copy} signIn={phase === "signIn"} />
        ) : (
          <SettingsContent
            copy={copy}
            engenty={engenty}
            pressed={phase === "preview"}
            work={work}
          />
        )}
      </div>
    </EndPane>
  );
}
