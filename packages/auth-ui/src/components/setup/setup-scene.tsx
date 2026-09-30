// The picture beside every wizard screen: the app being set up, drawn small
// and filling in as the person types — their name, the copilot (in the face
// they pick and its pilot goggles, in the app bar, its panel beside the page;
// grey and asleep until the AI is connected), the space's tile in its colour
// and icon, the engenty hired into it, its first apps. The part the current screen
// changes is ringed. In front stands the cast in 3D: the copilot and, once one
// is being hired, the space's engenty.

import { spaceKeyFromName } from "@engenty/ai-core/browser";
import { railSpaceInitials } from "@engenty/app-shell";
import {
  cn,
  Engenty,
  type EngentyKind,
  FluffyEngenty,
  MockShell,
  NewSpaceTile,
  PersonDot,
} from "@engenty/ui-core";
import { LayoutGrid, Mic, PhoneOff } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AuthLocale } from "../../lib/auth-i18n";
import type { SpaceWorkRules } from "../../lib/initial-setup-workspace";
import { SETUP_COPY, type SetupStage } from "../../lib/setup-wizard-i18n";
import { type AppCardId, appIcon } from "./setup-apps-step";
import {
  BRAND_CREAM,
  BRAND_EMBER,
  initialsOf,
  MONO,
  modKey,
} from "./setup-bits";
import { AppNav, AppPage } from "./setup-scene-apps";
import {
  Bubble,
  Ghost,
  OpenedPane,
  type SceneCopy,
  TITLE_BAR,
} from "./setup-scene-bits";
import {
  BUILD_LOOP,
  BuildChat,
  ResultPane,
  WizardScreen,
  WorkflowDialog,
} from "./setup-scene-build";
import {
  BrowserChat,
  DeskBar,
  DeskComposer,
  type DeskEngenty,
  DeskHero,
  EngentyChat,
  SetupPane,
} from "./setup-scene-desk";
import {
  ArtifactPane,
  END_PANE_WIDTH,
  ENGENTY_LOOP,
  SETUP_LOOP,
  useSceneLoop,
} from "./setup-scene-work";

export interface SetupStory {
  admin: string;
  /** The app card chosen on the apps screen; the picture shows it at work. */
  appCard: AppCardId | null;
  /** The space's apps as picked: each one and what it brings along. */
  apps: readonly { id: string; label: string }[];
  copilot: "idle" | "starting" | "ready" | "failed";
  copilotLook: EngentyKind;
  /** The engenty as it is being hired; null when none (yet, or skipped). */
  engenty: { job: string; kind: EngentyKind; name: string } | null;
  /** Label of the connected provider; null while the copilot has no model. */
  provider: string | null;
  space: string;
  /** The space tile's colour, and its icon (null: the name's initials). */
  spaceLook: { color: string; icon: string | null };
  /** The space computer's internet access, and when engenties ask. */
  work: SpaceWorkRules;
}

const STAGES: readonly SetupStage[] = [
  "welcome",
  "admin",
  "provider",
  "copilot",
  "space",
  "engenty",
  "setup",
  "apps",
  "ready",
];

/**
 * The copilot screen's loop: closed, the shortcut pressed, then each layout
 * the app offers — a window beside the app bar's copilot, the sidebar, full
 * screen with something opened in the pane, and voice — then closed again.
 */
type CopilotMode =
  | "closed"
  | "shortcut"
  | "voiceShortcut"
  | "window"
  | "sidebar"
  | "full"
  | "voice";

type Layout = Exclude<CopilotMode, "closed" | "shortcut" | "voiceShortcut">;

const LAYOUTS: readonly Layout[] = ["window", "sidebar", "full", "voice"];

const LOOP: readonly { mode: CopilotMode; ms: number }[] = [
  { mode: "closed", ms: 1800 },
  { mode: "shortcut", ms: 1400 },
  { mode: "window", ms: 5200 },
  { mode: "sidebar", ms: 5200 },
  { mode: "full", ms: 5600 },
  { mode: "closed", ms: 1400 },
  { mode: "voiceShortcut", ms: 1400 },
  { mode: "voice", ms: 5200 },
];

/** The space's own tabs, as the real sidebar has them; Work is open. */
const TABS = ["work", "data"] as const;

/** Width of the drawn app bar (MockShell's rail): the window opens beside it. */
const APP_BAR = 56;

interface PanelBox {
  bottom: number;
  left: string;
  radius: number;
  top: number;
  width: string;
}

/** The window, next to the app bar's copilot: where it opens from and folds into. */
const WINDOW_BOX: PanelBox = {
  bottom: 12,
  left: `${APP_BAR + 8}px`,
  radius: 12,
  top: TITLE_BAR + 70,
  width: "40%",
};

/** Where the copilot's panel sits in the window, per mode. */
const PANEL_BOX: Record<CopilotMode, PanelBox> = {
  closed: WINDOW_BOX,
  shortcut: WINDOW_BOX,
  voiceShortcut: WINDOW_BOX,
  window: WINDOW_BOX,
  sidebar: { bottom: 0, left: "70%", radius: 0, top: TITLE_BAR, width: "30%" },
  full: { bottom: 0, left: "0%", radius: 0, top: TITLE_BAR, width: "100%" },
  voice: WINDOW_BOX,
};

/** Where the 3D copilot stands on the band, and where it turns its head. */
const CAST_SPOT: Record<
  CopilotMode,
  { bottom: number; left: string; look: { x: number; y: number } }
> = {
  closed: { bottom: -118, left: "22%", look: { x: -0.6, y: -1 } },
  shortcut: { bottom: -118, left: "22%", look: { x: -0.6, y: -1 } },
  voiceShortcut: { bottom: -118, left: "22%", look: { x: -0.6, y: -1 } },
  window: { bottom: -118, left: "40%", look: { x: -0.4, y: -1 } },
  sidebar: { bottom: -118, left: "82%", look: { x: 0.3, y: -1 } },
  full: { bottom: -122, left: "54%", look: { x: 0, y: -1 } },
  voice: { bottom: -114, left: "46%", look: { x: -1, y: -0.4 } },
};

/**
 * Runs the loop while the copilot screen shows. The space and engenty screens
 * are about the space, so the copilot stays closed there; elsewhere its
 * window is open.
 */
function useCopilotMode(stage: SetupStage): CopilotMode {
  const active = stage === "copilot";
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    const current = LOOP[step];
    const timer = setTimeout(
      () => setStep((value) => (value + 1) % LOOP.length),
      current?.ms ?? 4000
    );
    return () => clearTimeout(timer);
  }, [active, step]);
  if (active) {
    return LOOP[step]?.mode ?? "closed";
  }
  return stage === "space" ||
    stage === "engenty" ||
    stage === "setup" ||
    stage === "apps"
    ? "closed"
    : "window";
}

/** A little hop whenever `trigger` changes, unless motion is reduced. */
function useHop(trigger: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const node = ref.current;
    if (
      !node ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    node.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-12px)", offset: 0.4 },
        { transform: "translateY(0)" },
      ],
      { duration: 900, easing: "ease-in-out" }
    );
  }, [trigger]);
  return ref;
}

/** The copilot's panel, docked the way `mode` says. */
function CopilotPanel({
  awake,
  box,
  copy,
  look,
  mode,
  provider,
  spot,
  thread,
}: {
  awake: boolean;
  box: PanelBox;
  copy: SceneCopy;
  look: EngentyKind;
  mode: CopilotMode;
  provider: string | null;
  spot: boolean;
  thread: ReactNode;
}) {
  const full = mode === "full";
  const hidden =
    mode === "voice" ||
    mode === "closed" ||
    mode === "shortcut" ||
    mode === "voiceShortcut";
  return (
    <div
      className="fade-in absolute flex animate-in overflow-hidden bg-card shadow-[0_18px_40px_-12px_oklch(0%_0_0/0.35)] ring-1 ring-ink/10 duration-500"
      style={{
        borderRadius: box.radius,
        bottom: box.bottom,
        left: box.left,
        opacity: hidden ? 0 : 1,
        top: box.top,
        transform: hidden ? "scale(0.3)" : "scale(1)",
        transformOrigin: "bottom left",
        transition:
          "top 1000ms ease, left 1000ms ease, bottom 1000ms ease, width 1000ms ease, border-radius 1000ms ease, opacity 700ms ease, transform 900ms ease",
        width: box.width,
      }}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col",
          full ? "w-[36%] border-ink/8 border-r" : "flex-1"
        )}
      >
        <Spot
          className="m-1.5 flex min-w-0 items-center gap-2 px-1.5 py-1"
          on={spot}
        >
          <span
            className="transition-[filter] duration-700"
            style={{ filter: awake ? "none" : "grayscale(1)" }}
          >
            <Engenty animated={awake} goggles kind={look} size={24} />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-medium text-[12.5px] text-ink">
              {copy.copilot}
            </span>
            <span className="truncate text-[10.5px] text-ink-3">
              {awake && provider
                ? copy.runsOn(provider)
                : awake
                  ? copy.live
                  : copy.noModel}
            </span>
          </span>
        </Spot>
        <div className="flex flex-1 flex-col gap-2 overflow-hidden px-2.5 py-1.5">
          {full ? (
            <>
              <Bubble mine small>
                {copy.openAsk}
              </Bubble>
              <Bubble small>{copy.opened}</Bubble>
            </>
          ) : (
            thread
          )}
        </div>
        <div className="mx-2 mb-2 flex items-center gap-2 rounded-[8px] bg-ink/[0.06] px-2.5 py-1.5 text-[11px] text-ink-4">
          <span className="flex-1">{copy.composer}</span>
          <Mic className="size-3.5 text-ink-4" />
        </div>
      </div>
      {full ? <OpenedPane copy={copy} /> : null}
    </div>
  );
}

/**
 * Voice, the way the app does it: the panel folds into the copilot itself,
 * rings pulsing while it talks, with mute and hang-up beside it and the live
 * caption of what was just said.
 */
function VoiceCall({ copy, look }: { copy: SceneCopy; look: EngentyKind }) {
  return (
    <div
      className="fade-in slide-in-from-bottom-2 absolute bottom-3 flex animate-in items-end gap-3 fill-mode-both delay-200 duration-500"
      style={{ left: APP_BAR + 10 }}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-col gap-0.5 rounded-[10px] bg-card p-1 shadow-md ring-1 ring-ink/10">
          <span className="flex size-7 items-center justify-center rounded-[7px] text-ink-2">
            <Mic className="size-3.5" />
          </span>
          <span className="flex size-7 items-center justify-center rounded-[7px] text-destructive">
            <PhoneOff className="size-3.5" />
          </span>
        </div>
        <span className="relative flex size-14 items-center justify-center">
          {[0, 500, 1000].map((delay) => (
            <span
              className="absolute inset-0 animate-ping rounded-full border-2 border-[#3358d4]"
              key={delay}
              style={{ animationDelay: `${delay}ms`, animationDuration: "2s" }}
            />
          ))}
          <span className="relative flex size-14 items-center justify-center rounded-full bg-card shadow-lg ring-1 ring-ink/10">
            <Engenty animated goggles kind={look} size={40} />
          </span>
        </span>
      </div>
      <div className="mb-3 max-w-[200px] rounded-[12px] rounded-bl-[4px] bg-paper px-3 py-2 text-[12px] text-ink shadow-md ring-1 ring-ink/10">
        {copy.voiceSaid}
      </div>
    </div>
  );
}

function reached(stage: SetupStage, target: SetupStage): boolean {
  return STAGES.indexOf(stage) >= STAGES.indexOf(target);
}

const YOU_HUE = "oklch(52% 0.12 264)";
const SPOT_RING = "oklch(64% 0.195 35)";

/** Rings the part of the window the current screen is about. */
function Spot({
  children,
  className,
  on,
}: {
  children: ReactNode;
  className?: string;
  on: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] transition-[box-shadow] duration-500",
        className
      )}
      style={{
        boxShadow: on
          ? `0 0 0 2px ${SPOT_RING}, 0 0 0 7px oklch(64% 0.195 35 / 0.16)`
          : "0 0 0 0 transparent",
      }}
    >
      {children}
    </div>
  );
}

/** The space's tile, as the rail draws it: its colour, its icon or initials. */
function SpaceFace({
  look,
  name,
  size,
}: {
  look: SetupStory["spaceLook"];
  name: string;
  size: number;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[8px] text-white transition-colors duration-300",
        look.icon ? "" : "font-heading font-semibold"
      )}
      style={{
        background: look.color,
        fontSize: look.icon ? size * 0.5 : size * 0.32,
        height: size,
        width: size,
      }}
    >
      {look.icon ?? railSpaceInitials(name)}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-1.5 font-mono text-[9.5px] text-ink-3 uppercase tracking-[0.12em]">
      {children}
    </p>
  );
}

function Row({ icon, name }: { icon: ReactNode; name: ReactNode }) {
  return (
    <div className="fade-in flex min-w-0 animate-in items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12px] duration-300">
      <span className="flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 150, 300].map((delay) => (
        <span
          className="size-1.5 animate-bounce rounded-full bg-ink-3"
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** One of the 3D engenties standing on the band, with its contact shadow. */
function CastMember({
  asleep = false,
  goggles = false,
  kind,
  look = null,
  show,
  size,
}: {
  asleep?: boolean;
  goggles?: boolean;
  kind: EngentyKind;
  /** Head turned this way instead of following the pointer. */
  look?: { x: number; y: number } | null;
  show: boolean;
  size: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block transition-[opacity,transform,filter] duration-700 ease-out",
        show ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      )}
      style={{
        filter: asleep ? "grayscale(1) brightness(1.08)" : "none",
        height: size,
        width: size,
      }}
    >
      <span
        className="pointer-events-none absolute rounded-[50%]"
        style={{
          background: "rgba(0, 0, 0, 0.32)",
          bottom: size * 0.1,
          filter: `blur(${size * 0.03}px)`,
          height: size * 0.07,
          left: "50%",
          transform: "translateX(-50%)",
          width: size * 0.44,
        }}
      />
      <FluffyEngenty
        coat="jelly"
        goggles={goggles}
        kind={kind}
        look={look}
        quality={size > 160 ? "medium" : "low"}
        size={size}
      />
    </span>
  );
}

export function SetupScene({
  locale,
  stage,
  story,
}: {
  locale: AuthLocale;
  stage: SetupStage;
  story: SetupStory;
}) {
  const copy = SETUP_COPY[locale];
  const c = copy.scene;
  const caption = c.captions[stage];
  const adminShown = reached(stage, "admin") && story.admin.trim() !== "";
  const spaceShown = reached(stage, "space");
  const awake = story.provider !== null;
  const space = story.space.trim() || c.spaceFallback;
  const spaceKey = spaceKeyFromName(space) || "…";
  const firstName = story.admin.trim().split(/\s+/)[0] ?? "";
  const engenty = reached(stage, "engenty") ? story.engenty : null;
  const inSpace = stage === "ready" && engenty !== null;
  const mode = useCopilotMode(stage);
  const engentyPhase = useSceneLoop(ENGENTY_LOOP, stage === "engenty");
  const setupPhase = useSceneLoop(SETUP_LOOP, stage === "setup");
  /** The engenty Apps card's story runs while that card is chosen. */
  const building = stage === "apps" && story.appCard === "build";
  const buildPhase = useSceneLoop(BUILD_LOOP, building);
  /** Its wizard owns the page: no desk around it. */
  const wizardOpen =
    building && (buildPhase === "wizard" || buildPhase === "result");
  // A side pane takes the space sidebar's place while it is open.
  const sideOpen =
    (stage === "engenty" && engenty !== null && engentyPhase === "artifact") ||
    (stage === "setup" && setupPhase !== "chat" && setupPhase !== "click") ||
    (building && buildPhase === "result");
  /** The wizard runs across the whole window, without the space's sidebar. */
  const columnHidden = sideOpen || wizardOpen;
  /** The server setup's screens: the admin's chip instead of a composer. */
  const platformStage = !reached(stage, "copilot");

  const rail = (
    <>
      <Spot className="p-0.5" on={stage === "space"}>
        {spaceShown ? (
          <span className="block rounded-[10px] ring-2 ring-ink/70 ring-offset-2 ring-offset-paper">
            <SpaceFace look={story.spaceLook} name={space} size={36} />
          </span>
        ) : (
          <span className="block size-9 rounded-[8px] bg-ink/[0.06]" />
        )}
      </Spot>
      <NewSpaceTile />
      <div className="relative mt-auto flex flex-col items-center gap-2.5">
        <Spot className="rounded-[10px]" on={stage === "copilot"}>
          <span
            className="flex size-9 items-center justify-center rounded-[10px] bg-card ring-1 ring-ink/10 transition-[filter] duration-700"
            style={{ filter: awake ? "none" : "grayscale(1)" }}
          >
            <Engenty
              animated={awake}
              goggles
              kind={story.copilotLook}
              size={28}
            />
          </span>
        </Spot>
        {stage === "copilot" &&
        (mode === "closed" ||
          mode === "shortcut" ||
          mode === "voiceShortcut") ? (
          <span className="fade-in absolute top-1.5 left-[calc(100%+12px)] flex animate-in items-center gap-1 whitespace-nowrap duration-500">
            {(mode === "voiceShortcut"
              ? [modKey(), "⇧", "O"]
              : [modKey(), "O"]
            ).map((key) => (
              <kbd
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] px-1 font-medium font-sans text-[10.5px] ring-1 transition-all duration-200",
                  mode === "shortcut" || mode === "voiceShortcut"
                    ? "translate-y-px scale-95 bg-primary text-primary-foreground ring-primary"
                    : "bg-card text-ink ring-ink/12"
                )}
                key={key}
              >
                {key}
              </kbd>
            ))}
          </span>
        ) : null}
        {adminShown ? (
          <PersonDot
            hue={YOU_HUE}
            initials={initialsOf(story.admin)}
            size={28}
          />
        ) : null}
      </div>
    </>
  );

  const column = (
    <div className="flex h-full w-48 flex-col gap-3 px-2.5 pt-1.5 pb-3">
      <Spot className="px-1 py-1" on={stage === "space"}>
        {spaceShown ? (
          <div className="flex min-w-0 items-center gap-2">
            <SpaceFace look={story.spaceLook} name={space} size={22} />
            <p className="truncate font-heading font-semibold text-[14px] text-ink">
              {/* An open app names the column, beside the space's tile. */}
              {stage === "apps" && story.appCard
                ? copy.apps.cards[story.appCard].label
                : space}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="size-[22px] rounded-[8px] bg-ink/[0.06]" />
            <Ghost width={90} />
          </div>
        )}
      </Spot>
      <div className="flex rounded-[9px] bg-ink/[0.06] p-0.5">
        {TABS.map((id) => (
          <span
            className={cn(
              "flex-1 rounded-[7px] py-1 text-center font-semibold text-[9px] uppercase tracking-wide",
              id === "work" ? "bg-card text-primary shadow-sm" : "text-ink-3"
            )}
            key={id}
          >
            {c.tabs[id]}
          </span>
        ))}
      </div>
      {stage === "apps" && story.appCard ? (
        <Spot on>
          <AppNav app={story.appCard} copy={c.appView} />
        </Spot>
      ) : (
        <>
          <div className="space-y-1">
            <SectionLabel>{c.engenties}</SectionLabel>
            <Spot on={stage === "engenty"}>
              {engenty ? (
                <Row
                  icon={
                    <Engenty animated={false} kind={engenty.kind} size={18} />
                  }
                  name={engenty.name || "…"}
                />
              ) : (
                <div className="px-1.5 py-1.5">
                  <Ghost width={84} />
                </div>
              )}
            </Spot>
          </div>
          <div className="space-y-1">
            <SectionLabel>{c.apps}</SectionLabel>
            <Spot on={stage === "apps"}>
              {story.apps.length > 0 && reached(stage, "apps") ? (
                story.apps.map((app) => {
                  const Icon = appIcon(app.id) ?? LayoutGrid;
                  return (
                    <Row
                      icon={
                        <Icon
                          className="size-3.5"
                          style={{ color: story.spaceLook.color }}
                        />
                      }
                      key={app.id}
                      name={app.label}
                    />
                  );
                })
              ) : (
                <div className="space-y-2.5 px-1.5 py-1.5">
                  <Ghost width={100} />
                  <Ghost width={76} />
                </div>
              )}
            </Spot>
          </div>
        </>
      )}
    </div>
  );

  const look = story.copilotLook;
  const drawerShown = reached(stage, "provider") && !inSpace;
  const box = PANEL_BOX[mode];
  const spot = CAST_SPOT[mode];
  const hopRef = useHop(mode);

  let drawerThread: ReactNode;
  if (reached(stage, "copilot")) {
    drawerThread = (
      <>
        <Bubble small>{copy.copilot.greeting(firstName || story.admin)}</Bubble>
        {stage === "ready" && story.copilot === "starting" ? (
          <Bubble small>
            <TypingDots />
          </Bubble>
        ) : null}
      </>
    );
  } else {
    drawerThread = (
      <div className="space-y-2 rounded-[12px] bg-ink/[0.06] px-3 py-2.5 opacity-70">
        <Ghost width={140} />
        <Ghost width={96} />
      </div>
    );
  }

  /** An engenty's desk fills the page on its own screens: it heads it, not the space. */
  const engentyOpen =
    stage === "setup" || (stage === "engenty" && engenty !== null);
  /** The desk shows on the engenty screens and while its routine is asked for. */
  const deskShown = engentyOpen || (building && !wizardOpen);
  const deskEngenty: DeskEngenty = engenty
    ? { job: engenty.job, kind: engenty.kind, name: engenty.name || "…" }
    : { job: "", kind: story.copilotLook, name: c.copilot };
  const page = wizardOpen ? (
    <WizardScreen copy={c.build} phase={buildPhase} />
  ) : building ? (
    <BuildChat copy={c.build} phase={buildPhase} />
  ) : stage === "apps" && story.appCard ? (
    <AppPage app={story.appCard} copy={c.appView} />
  ) : engentyOpen ? (
    stage === "setup" ? (
      <BrowserChat
        autostart={story.work.browser.autostart}
        copy={c.computer}
        desk={c.desk}
        engenty={deskEngenty.name}
        person={firstName || story.admin}
        phase={setupPhase}
      />
    ) : (
      <div className="flex flex-col gap-3.5">
        <DeskHero copy={c.desk} engenty={deskEngenty} />
        <EngentyChat copy={c} phase={engentyPhase} />
      </div>
    )
  ) : inSpace ? (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Engenty animated kind={engenty.kind} size={26} />
        <Bubble>{c.engentyGreeting(engenty.name, space)}</Bubble>
      </div>
    </div>
  ) : (
    <div className="space-y-3 opacity-80">
      {[0, 1, 2].map((row) => (
        <div
          className="flex items-center gap-3 rounded-[8px] bg-ink/[0.04] px-3 py-2.5"
          key={row}
        >
          <span className="size-5 rounded-[5px] bg-ink/[0.08]" />
          <div className="flex-1 space-y-1.5">
            <Ghost width={row === 1 ? 120 : 150} />
            <Ghost width={row === 2 ? 60 : 90} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <aside
      className="relative hidden overflow-hidden lg:block"
      style={{ background: BRAND_EMBER }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          background: "#fff",
          filter: "blur(110px)",
          height: 620,
          opacity: 0.12,
          right: -200,
          top: -220,
          width: 620,
        }}
      />
      <div className="sticky top-0 flex h-dvh flex-col justify-center px-10 py-10 xl:px-16">
        <div className="mx-auto w-full max-w-[620px]">
          <div
            className="fade-in slide-in-from-bottom-2 animate-in duration-500"
            key={stage}
          >
            <p
              className="uppercase"
              style={{
                color: BRAND_CREAM,
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: "0.16em",
              }}
            >
              {caption.kicker}
            </p>
            <p className="mt-2 max-w-[520px] whitespace-pre-line font-heading font-semibold text-[28px] text-white leading-[1.15] tracking-tight">
              {caption.line}
            </p>
          </div>

          <div
            className={cn(
              "mt-6 flex justify-end gap-1 transition-opacity duration-500",
              stage === "copilot" ? "opacity-100" : "opacity-0"
            )}
          >
            {LAYOUTS.map((m) => (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11.5px] transition-colors duration-300",
                  m === mode
                    ? "bg-white text-[oklch(30%_0.1_30)]"
                    : "text-white/60"
                )}
                key={m}
              >
                {c.modes[m]}
              </span>
            ))}
          </div>

          <div className="relative mt-3 mb-24">
            <div className="relative overflow-hidden rounded-[14px] shadow-[0_40px_90px_-30px_oklch(0%_0_0/0.55)]">
              <MockShell
                bodyClassName="h-[350px]"
                column={column}
                // An engenty's sidebar takes the space's place while it is open.
                columnClassName={cn(
                  "overflow-hidden bg-sidebar transition-[width] duration-700 ease-in-out",
                  columnHidden ? "w-0" : "w-48"
                )}
                rail={rail}
                title={
                  spaceShown
                    ? `engenty.localhost/s/${spaceKey}`
                    : "engenty.localhost"
                }
              >
                <div
                  className="relative flex h-full flex-col"
                  // The page makes room for a sidebar instead of hiding under it.
                  style={{
                    paddingRight: sideOpen ? END_PANE_WIDTH : 0,
                    transition:
                      "padding-right 900ms cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
                    {wizardOpen ? null : deskShown ? (
                      <DeskBar
                        copy={c.desk}
                        engenty={deskEngenty}
                        pressed={stage === "setup" && setupPhase !== "chat"}
                      />
                    ) : inSpace ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-[13px] text-ink">
                          {engenty.name}
                        </span>
                        <span className="truncate text-[11px] text-ink-3">
                          {space}
                        </span>
                      </span>
                    ) : spaceShown ? (
                      <span className="truncate font-heading font-semibold text-[14px] text-ink">
                        {stage === "apps" && story.appCard
                          ? c.appView[story.appCard].nav[0]
                          : space}
                      </span>
                    ) : (
                      <Ghost width={110} />
                    )}
                    {platformStage ? (
                      <Spot
                        className="ml-auto shrink-0 rounded-full"
                        on={stage === "admin"}
                      >
                        <div className="flex items-center gap-1.5 py-0.5 pr-2 pl-0.5">
                          {adminShown ? (
                            <>
                              <PersonDot
                                hue={YOU_HUE}
                                initials={initialsOf(story.admin)}
                                size={20}
                              />
                              <span className="max-w-[88px] truncate text-[11px] text-ink-2">
                                {firstName}
                              </span>
                              <span className="rounded-full bg-ink/[0.06] px-1.5 py-px text-[9.5px] text-ink-3">
                                {c.admin}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="size-5 rounded-full bg-ink/[0.06]" />
                              <Ghost width={56} />
                            </>
                          )}
                        </div>
                      </Spot>
                    ) : null}
                  </div>
                  <div className="flex-1 overflow-hidden px-4 py-2">{page}</div>
                  {deskShown ? (
                    <DeskComposer
                      approval={
                        copy.setup.approvalChoice[story.work.approvalMode].label
                      }
                      copy={c}
                      engenty={deskEngenty}
                      space={space}
                    />
                  ) : platformStage || stage === "apps" ? null : (
                    <div className="mx-4 mb-3 flex items-center gap-2 rounded-[10px] bg-card px-3 py-2 text-[11px] text-ink-4 shadow-[0_4px_14px_-6px_oklch(0%_0_0/0.18)] ring-1 ring-ink/10">
                      <span className="min-w-0 flex-1 truncate">
                        {c.composer}
                      </span>
                      <Mic className="size-3.5" />
                    </div>
                  )}
                </div>
              </MockShell>
              {drawerShown ? (
                <CopilotPanel
                  awake={awake}
                  box={box}
                  copy={c}
                  look={look}
                  mode={mode}
                  provider={story.provider}
                  spot={stage === "provider"}
                  thread={drawerThread}
                />
              ) : null}
              {drawerShown && mode === "voice" ? (
                <VoiceCall copy={c} look={look} />
              ) : null}
              {stage === "engenty" ? (
                <ArtifactPane copy={c} open={engentyPhase === "artifact"} />
              ) : null}
              {building ? (
                <>
                  <WorkflowDialog
                    copy={c.build.workflow}
                    open={buildPhase === "workflow"}
                  />
                  <ResultPane
                    copy={c.build.result}
                    open={buildPhase === "result"}
                  />
                </>
              ) : null}
              {stage === "setup" ? (
                <SetupPane
                  copy={c.computer}
                  engenty={deskEngenty}
                  phase={setupPhase}
                  work={story.work}
                />
              ) : null}
            </div>

            {engenty ? (
              <span
                className="pointer-events-none absolute -translate-x-1/2"
                // On its own screen it stands on the window's top edge, looking
                // down at its profile; after that it joins the band below.
                style={
                  stage === "engenty"
                    ? { left: "82%", top: -128 }
                    : { bottom: -112, left: "66%" }
                }
              >
                <CastMember
                  key={engenty.kind}
                  kind={engenty.kind}
                  look={stage === "engenty" ? { x: -0.7, y: 0.8 } : null}
                  show
                  size={stage === "engenty" ? 180 : 140}
                />
              </span>
            ) : null}
            <span
              className="pointer-events-none absolute -translate-x-1/2"
              style={{
                bottom: spot.bottom,
                left: spot.left,
                transition:
                  "left 1400ms cubic-bezier(0.4, 0, 0.2, 1), bottom 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <span className="block" ref={hopRef}>
                <CastMember
                  asleep={!awake}
                  goggles
                  key={look}
                  kind={look}
                  look={stage === "copilot" ? spot.look : null}
                  show={stage !== "engenty" && stage !== "setup"}
                  size={190}
                />
              </span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
