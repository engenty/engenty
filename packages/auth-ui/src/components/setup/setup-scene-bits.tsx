// Small pieces the setup picture is drawn with: placeholder lines, chat
// bubbles, a record opened in a pane, the window's title-bar height.

import { cn } from "@engenty/ui-core";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import type { AuthLocale } from "../../lib/auth-i18n";
import type { SETUP_COPY } from "../../lib/setup-wizard-i18n";

export type SceneCopy = (typeof SETUP_COPY)[AuthLocale]["scene"];

/** Height of the drawn window's title bar; the panel starts below it. */
export const TITLE_BAR = 36;

export function Ghost({ width }: { width: number }) {
  return (
    <span className="block h-2 rounded-full bg-ink/10" style={{ width }} />
  );
}

export function Bubble({
  children,
  mine = false,
  small = false,
}: {
  children: ReactNode;
  mine?: boolean;
  /** The copilot panel's size: the same in every layout. */
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "fade-in slide-in-from-bottom-1 animate-in duration-500",
        small
          ? "max-w-[92%] rounded-[10px] px-2.5 py-1.5 text-[11px] leading-snug"
          : "max-w-[280px] rounded-[12px] px-3 py-2 text-[12.5px] leading-relaxed",
        mine
          ? "self-end rounded-tr-[4px] bg-primary text-primary-foreground"
          : "rounded-tl-[4px] bg-ink/[0.06] text-ink"
      )}
    >
      {children}
    </div>
  );
}

/** A record the copilot opened in its pane, next to the conversation. */
export function OpenedPane({ copy }: { copy: SceneCopy }) {
  return (
    <div className="fade-in slide-in-from-right-4 flex min-w-0 flex-1 animate-in flex-col gap-3 fill-mode-both p-4 delay-300 duration-500">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-ink-3" />
        <span className="truncate font-medium text-[13px] text-ink">
          {copy.paneTitle}
        </span>
        <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[9.5px] text-amber-700">
          {copy.paneBadge}
        </span>
      </div>
      <div className="space-y-2">
        <Ghost width={210} />
        <Ghost width={160} />
      </div>
      <div className="divide-y divide-ink/6 rounded-[8px] ring-1 ring-ink/8">
        {[120, 90, 140].map((width) => (
          <div className="flex items-center gap-3 px-3 py-2" key={width}>
            <Ghost width={width} />
            <span className="ml-auto">
              <Ghost width={40} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
