// The form side of the wizard: brand, language and light/dark at the top, the
// progress (platform pair, then the team five; a reached step is a link back),
// one title and one sentence, the screen's form, and the story panel beside it
// on wide screens.

import { cn, EngentyLogoMark, EngentyWordmark } from "@engenty/ui-core";
import type { ReactNode } from "react";
import { AUTH_TRANSLATIONS, type AuthLocale } from "../../lib/auth-i18n";
import { SETUP_COPY, type SetupStage } from "../../lib/setup-wizard-i18n";
import { AuthLocaleSwitch } from "../auth-locale-switch";
import { SetupScene, type SetupStory } from "./setup-scene";
import { ThemeSwitch } from "./setup-theme-switch";

/** The team five, in the progress's order. */
const TEAM_STEPS: readonly SetupStage[] = [
  "copilot",
  "space",
  "engenty",
  "setup",
  "apps",
];

/** Where a stage sits in the progress: the platform pair, then the team five. */
const PLACE: Record<SetupStage, { group: "platform" | "team"; step: number }> =
  {
    welcome: { group: "platform", step: 0 },
    admin: { group: "platform", step: 1 },
    provider: { group: "platform", step: 2 },
    copilot: { group: "team", step: 1 },
    space: { group: "team", step: 2 },
    engenty: { group: "team", step: 3 },
    setup: { group: "team", step: 4 },
    apps: { group: "team", step: 5 },
    ready: { group: "team", step: 6 },
  };

function Progress({
  locale,
  onStep,
  opens,
  stage,
}: {
  locale: AuthLocale;
  onStep?: (stage: SetupStage) => void;
  opens?: (stage: SetupStage) => boolean;
  stage: SetupStage;
}) {
  const copy = SETUP_COPY[locale].progress;
  const place = PLACE[stage];
  const labels = place.group === "platform" ? copy.platform : copy.team;
  return (
    <div className="mb-6">
      <p className="mb-2.5 font-mono text-[10.5px] text-ink-3 uppercase tracking-[0.14em]">
        {place.group === "platform" ? copy.platformTitle : copy.teamTitle}
      </p>
      <ol
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`,
        }}
      >
        {labels.map((label, index) => {
          const step = index + 1;
          const done = place.step > step;
          const active = place.step === step;
          const target = place.group === "team" ? TEAM_STEPS[index] : null;
          const link =
            target && !active && onStep && opens?.(target) ? target : null;
          const face = (
            <>
              <span
                className={cn(
                  "h-1 rounded-full transition-colors duration-500",
                  done ? "bg-ink" : active ? "bg-primary" : "bg-ink/10"
                )}
              />
              <span
                className={cn(
                  "text-[12px] transition-colors",
                  active
                    ? "font-medium text-ink"
                    : done
                      ? "text-ink-2"
                      : "text-ink-4",
                  link && "group-hover:text-ink"
                )}
              >
                {label}
              </span>
            </>
          );
          return (
            <li key={label}>
              {link ? (
                <button
                  className="group flex w-full flex-col gap-2 text-left"
                  onClick={() => onStep?.(link)}
                  type="button"
                >
                  {face}
                </button>
              ) : (
                <span
                  aria-current={active ? "step" : undefined}
                  className="flex flex-col gap-2"
                >
                  {face}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function SetupFrame({
  children,
  lead,
  locale,
  onLocaleChange,
  onStep,
  opens,
  stage,
  story,
  title,
  toolbar,
}: {
  children: ReactNode;
  lead: string;
  locale: AuthLocale;
  /** Absent once the language is saved with the team. */
  onLocaleChange?: (locale: AuthLocale) => void;
  /** Opens a reached step from the progress. */
  onStep?: (stage: SetupStage) => void;
  /** Whether a step in the progress opens. */
  opens?: (stage: SetupStage) => boolean;
  stage: SetupStage;
  story: SetupStory;
  title: string;
  /** Extra chrome, e.g. the preview bar. */
  toolbar?: ReactNode;
}) {
  const copy = SETUP_COPY[locale];
  return (
    <div
      className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(480px,5fr)_minmax(0,6fr)]"
      style={{ background: "var(--color-paper, oklch(98.4% 0.006 70))" }}
    >
      <main className="flex min-h-dvh flex-col px-6 py-6 sm:px-12">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <EngentyLogoMark size={32} />
            <span className="font-bold font-heading text-[19px] text-ink tracking-tight">
              <EngentyWordmark />
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onLocaleChange ? (
              <AuthLocaleSwitch
                label={AUTH_TRANSLATIONS[locale].language}
                locale={locale}
                onChange={onLocaleChange}
              />
            ) : null}
            <ThemeSwitch copy={copy.theme} />
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-[420px]">
            {stage === "welcome" ? null : (
              <Progress
                locale={locale}
                onStep={onStep}
                opens={opens}
                stage={stage}
              />
            )}
            <div
              className="fade-in slide-in-from-bottom-2 animate-in duration-500"
              key={stage}
            >
              <h1 className="font-heading font-semibold text-[32px] text-ink leading-[1.1] tracking-tight">
                {title}
              </h1>
              <p className="mt-3 text-[15px] text-ink-2 leading-relaxed">
                {lead}
              </p>
              <div className="mt-6">{children}</div>
            </div>
          </div>
        </div>

        <footer className="text-[12px] text-ink-4">{copy.footer}</footer>
      </main>

      <SetupScene locale={locale} stage={stage} story={story} />
      {toolbar}
    </div>
  );
}
