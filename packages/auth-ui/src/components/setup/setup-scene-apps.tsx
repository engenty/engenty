// The apps screen's picture: the chosen app open in the space, as the app
// shows a module: its name heads the space's sidebar, its own nav sits under
// the space's tabs,
// its list on the page. The knowledge base lists articles, contacts its
// people, commercial its offers with their state.

import { cn } from "@engenty/ui-core";
import { AppWindow, FileText, Sparkles } from "lucide-react";
import type { AppCardId } from "./setup-apps-step";
import type { SceneCopy } from "./setup-scene-bits";

const STATUS_TONE = {
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  draft: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  sent: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
} as const;

const PERSON_HUES = [250, 20, 150, 300];

/** The module's nav, under the space's tabs; the column's title names it. */
export function AppNav({
  app,
  copy,
}: {
  app: AppCardId;
  copy: SceneCopy["appView"];
}) {
  return (
    <div
      className="fade-in flex animate-in flex-col gap-0.5 duration-500"
      key={app}
    >
      {copy[app].nav.map((item, index) => (
        <span
          className={cn(
            "rounded-[6px] px-2 py-1 text-[11px]",
            index === 0 ? "bg-ink/[0.07] text-ink" : "text-ink-2"
          )}
          key={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

const APP_TONES = [
  "oklch(62% 0.13 280)",
  "oklch(64% 0.12 160)",
  "oklch(66% 0.13 50)",
];

/** The space's own apps as tiles, and the tile that asks an engenty for one. */
function BuildGrid({ copy }: { copy: SceneCopy["appView"]["build"] }) {
  return (
    <div className="grid grid-cols-2 gap-2 p-2">
      {copy.rows.map((row, index) => (
        <div
          className="flex flex-col gap-1.5 rounded-[8px] bg-ink/[0.03] p-2 ring-1 ring-ink/8"
          key={row.name}
        >
          <span
            className="flex size-6 items-center justify-center rounded-[6px] text-white"
            style={{ background: APP_TONES[index % APP_TONES.length] }}
          >
            <AppWindow className="size-3.5" />
          </span>
          <span className="truncate text-[10.5px] text-ink">{row.name}</span>
          <span className="truncate text-[9px] text-ink-3">{row.by}</span>
        </div>
      ))}
      <div className="flex flex-col items-center justify-center gap-1 rounded-[8px] border border-ink/20 border-dashed p-2 text-center text-[9.5px] text-ink-3">
        <Sparkles className="size-3.5 text-primary" />
        {copy.newApp}
      </div>
    </div>
  );
}

/** The module's page: the list its first nav entry shows. */
export function AppPage({
  app,
  copy,
}: {
  app: AppCardId;
  copy: SceneCopy["appView"];
}) {
  return (
    <div
      className="fade-in flex animate-in flex-col divide-y divide-ink/6 rounded-[8px] ring-1 ring-ink/8 duration-500"
      key={app}
    >
      {app === "build" ? <BuildGrid copy={copy.build} /> : null}
      {app === "knowledge"
        ? copy.knowledge.rows.map((title) => (
            <div className="flex items-center gap-2 px-2.5 py-2" key={title}>
              <FileText className="size-3.5 shrink-0 text-ink-3" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[11px] text-ink">{title}</span>
                <span className="block h-1.5 w-2/3 rounded-full bg-ink/8" />
              </span>
            </div>
          ))
        : null}
      {app === "contacts"
        ? copy.contacts.rows.map((row, index) => (
            <div
              className="flex items-center gap-2 px-2.5 py-1.5"
              key={row.name}
            >
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full font-medium text-[8px] text-white"
                style={{
                  background: `oklch(60% 0.12 ${PERSON_HUES[index % PERSON_HUES.length]})`,
                }}
              >
                {row.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink">
                {row.name}
              </span>
              <span className="truncate text-[10px] text-ink-3">
                {row.company}
              </span>
            </div>
          ))
        : null}
      {app === "commercial"
        ? copy.commercial.rows.map((row) => (
            <div
              className="flex items-center gap-2 px-2.5 py-2"
              key={row.number}
            >
              <span className="font-mono text-[9.5px] text-ink-3">
                {row.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink">
                {row.customer}
              </span>
              <span className="text-[10.5px] text-ink tabular-nums">
                {row.amount}
              </span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[9px]",
                  STATUS_TONE[row.status]
                )}
              >
                {copy.commercial.status[row.status]}
              </span>
            </div>
          ))
        : null}
    </div>
  );
}
