"use client";

// The agent's browser window, drawn in the chat (`AgUiBrowserPreview`): beside
// a decision the run is parked on, or as `browser_show`'s own output.
//
// - setup: the browser's state, Start / Stop, the Space's two switches.
// - live: the live view with take over; a stopped browser shows setup.
// - screenshot: one frame with the agent's marks drawn over it.
//
// A live view is a socket per card, so a card from an earlier turn waits for
// a click before it connects; `autoConnect` is for the card in play now.
import type {
  AgUiBrowserAnnotation,
  AgUiBrowserPreview,
} from "@engenty/ag-ui-bridge";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Dialog, DialogContent, DialogTitle } from "@engenty/ui-core";
import { Globe, Maximize2, Pause, Play } from "lucide-react";
import { useState } from "react";
import type { BrowserTarget } from "./browser-target.js";
import {
  useUserBrowserMutations,
  useUserBrowserStatusQuery,
} from "./user-browser-api.js";
import { setUserBrowserPaneOpen } from "./user-browser-pane-store.js";
import { UserBrowserConsents } from "./user-browser-section.js";
import { UserBrowserView } from "./user-browser-view.js";

export type ScreenshotPreview = Extract<
  AgUiBrowserPreview,
  { kind: "browser_screenshot" }
>;

/** What a chat widget draws; a login form or secret form is its own card. */
export type BrowserViewPreview = Exclude<
  AgUiBrowserPreview,
  { kind: "browser_credentials" } | { kind: "secret_request" }
>;

function targetOf(preview: BrowserViewPreview): BrowserTarget {
  return { agentId: preview.agent_id, spaceId: preview.space_id };
}

export function BrowserChatWidget({
  autoConnect = false,
  caption,
  preview,
}: {
  autoConnect?: boolean;
  caption?: string;
  preview: BrowserViewPreview;
}) {
  return (
    <figure className="m-0 space-y-1.5">
      {preview.kind === "browser_screenshot" ? (
        <BrowserScreenshot preview={preview} />
      ) : preview.mode === "live" ? (
        <BrowserLive autoConnect={autoConnect} target={targetOf(preview)} />
      ) : (
        <BrowserSetup target={targetOf(preview)} />
      )}
      {caption ? (
        <figcaption className="text-muted-foreground text-xs">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** State, Start / Stop and the Space's switches — what "set it up" means. */
function BrowserSetup({ target }: { target: BrowserTarget }) {
  const { t } = useTranslation("ai-ui");
  const status = useUserBrowserStatusQuery(target, 30_000);
  const { start, stop } = useUserBrowserMutations(target);
  const state = status.data?.state ?? "absent";
  const busy = start.isPending || stop.isPending || status.isPending;
  return (
    <div className="ui-canvas-raised space-y-3 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <Globe aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-sm">{t("browser.chat.title")}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
          {t(`browser.panel.state.${state}`)}
        </span>
        {state === "running" ? (
          <Button
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => stop.mutate()}
            size="sm"
            variant="outline"
          >
            <Pause aria-hidden className="mr-1 size-3" />
            {t("browser.panel.stop")}
          </Button>
        ) : (
          <Button
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => start.mutate()}
            size="sm"
          >
            <Play aria-hidden className="mr-1 size-3 fill-current" />
            {t("browser.panel.start")}
          </Button>
        )}
      </div>
      {start.isError ? (
        <p className="text-destructive text-xs">
          {t("browser.panel.startFailed")}
        </p>
      ) : null}
      <UserBrowserConsents target={target} />
    </div>
  );
}

/** The live window; a browser that is not running shows its setup instead. */
function BrowserLive({
  autoConnect,
  target,
}: {
  autoConnect: boolean;
  target: BrowserTarget;
}) {
  const { t } = useTranslation("ai-ui");
  const status = useUserBrowserStatusQuery(target, 30_000);
  const [watching, setWatching] = useState(autoConnect);
  if (status.data && status.data.state !== "running") {
    return <BrowserSetup target={target} />;
  }
  if (!watching) {
    return (
      <Button
        className="h-8 text-xs"
        onClick={() => setWatching(true)}
        size="sm"
        variant="outline"
      >
        <Play aria-hidden className="mr-1 size-3" />
        {t("browser.chat.watchLive")}
      </Button>
    );
  }
  return (
    <div className="space-y-1">
      <UserBrowserView className="h-80" resizePage={false} target={target} />
      <div className="flex justify-end">
        <Button
          className="h-7 text-xs"
          onClick={() => setUserBrowserPaneOpen(true)}
          size="sm"
          variant="ghost"
        >
          <Maximize2 aria-hidden className="mr-1 size-3" />
          {t("browser.chat.openPane")}
        </Button>
      </div>
    </div>
  );
}

const MARK_COLORS: Record<AgUiBrowserAnnotation["color"], string> = {
  amber: "#f59e0b",
  blue: "#3b82f6",
  green: "#16a34a",
  red: "#dc2626",
};

/**
 * The agent's marks, in page pixels over an image of the same frame. Each
 * labelled mark carries a numbered badge; the words sit in the legend under
 * the image, where they stay readable at any size and never cover the page.
 * Line and badge size follow the frame width.
 */
function BrowserMarks({ preview }: { preview: ScreenshotPreview }) {
  const { height, width } = preview;
  const unit = width / 400;
  const badges = badgeNumbers(preview.annotations);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <title>
        {preview.annotations.map((mark) => mark.label ?? "").join(" · ")}
      </title>
      <defs>
        {Object.entries(MARK_COLORS).map(([name, color]) => (
          <marker
            id={`browser-mark-arrow-${name}`}
            key={name}
            markerHeight="4"
            markerWidth="4"
            orient="auto"
            refX="3"
            refY="2"
          >
            <path d="M0,0 L4,2 L0,4 z" fill={color} />
          </marker>
        ))}
      </defs>
      {preview.annotations.map((mark, index) => {
        const color = MARK_COLORS[mark.color];
        const badge = badges[index];
        const stroke = { fill: "none", stroke: color, strokeWidth: unit * 1.5 };
        const radius = unit * 7;
        // Arrow: from up-left of the element to its left edge; the badge
        // sits on the tail. Other shapes wear it just outside — right of
        // them (where a field's label is not), else left, else above —
        // never on the page content they mark.
        const tipX = mark.x;
        const tipY = mark.y + mark.height / 2;
        const tailX = Math.max(radius, tipX - unit * 40);
        const tailY = Math.max(radius, tipY - unit * 25);
        const gap = unit * 3;
        const rightX = mark.x + mark.width + gap + radius;
        const roomRight = rightX + radius <= width;
        const roomLeft = mark.x - radius - gap >= radius;
        const besideY = mark.y + Math.min(radius, mark.height / 2);
        let badgeX = mark.x + radius;
        let badgeY = Math.max(radius, mark.y - radius - gap);
        if (mark.shape === "arrow") {
          badgeX = tailX;
          badgeY = tailY;
        } else if (roomRight) {
          badgeX = rightX;
          badgeY = besideY;
        } else if (roomLeft) {
          badgeX = mark.x - radius - gap;
          badgeY = besideY;
        }
        return (
          <g key={`${mark.x}-${mark.y}-${index}`}>
            {mark.shape === "box" ? (
              <rect
                height={mark.height}
                rx={unit * 2}
                width={mark.width}
                x={mark.x}
                y={mark.y}
                {...stroke}
              />
            ) : null}
            {mark.shape === "highlight" ? (
              <rect
                fill={color}
                fillOpacity={0.22}
                height={mark.height}
                rx={unit * 2}
                stroke={color}
                strokeWidth={unit}
                width={mark.width}
                x={mark.x}
                y={mark.y}
              />
            ) : null}
            {mark.shape === "circle" ? (
              <ellipse
                cx={mark.x + mark.width / 2}
                cy={mark.y + mark.height / 2}
                rx={mark.width / 2 + unit * 4}
                ry={mark.height / 2 + unit * 4}
                {...stroke}
              />
            ) : null}
            {mark.shape === "arrow" ? (
              <line
                markerEnd={`url(#browser-mark-arrow-${mark.color})`}
                x1={tailX}
                x2={tipX - unit * 2}
                y1={tailY}
                y2={tipY}
                {...stroke}
              />
            ) : null}
            {badge ? (
              <g>
                <circle
                  cx={badgeX}
                  cy={badgeY}
                  fill={color}
                  r={radius}
                  stroke="#ffffff"
                  strokeWidth={unit}
                />
                <text
                  dominantBaseline="central"
                  fill="#ffffff"
                  fontSize={radius * 1.2}
                  fontWeight={700}
                  textAnchor="middle"
                  x={badgeX}
                  y={badgeY}
                >
                  {badge}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** The badge number of each mark: labelled marks count 1, 2, …; others none. */
function badgeNumbers(
  annotations: readonly AgUiBrowserAnnotation[]
): (number | null)[] {
  let next = 0;
  return annotations.map((mark) => {
    if (!mark.label) {
      return null;
    }
    next += 1;
    return next;
  });
}

/** The labels, numbered like their badges. */
function BrowserMarksLegend({ preview }: { preview: ScreenshotPreview }) {
  const badges = badgeNumbers(preview.annotations);
  const rows = preview.annotations.flatMap((mark, index) => {
    const badge = badges[index];
    return badge && mark.label
      ? [{ badge, color: mark.color, label: mark.label }]
      : [];
  });
  if (rows.length === 0) {
    return null;
  }
  return (
    <ol className="space-y-1 border-t px-2 py-1.5 text-xs">
      {rows.map((row) => (
        <li className="flex items-start gap-1.5" key={row.badge}>
          <span
            aria-hidden
            className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full font-bold text-[10px] text-white"
            style={{ backgroundColor: MARK_COLORS[row.color] }}
          >
            {row.badge}
          </span>
          <span className="min-w-0">{row.label}</span>
        </li>
      ))}
    </ol>
  );
}

function BrowserScreenshotImage({ preview }: { preview: ScreenshotPreview }) {
  const { t } = useTranslation("ai-ui");
  return (
    <div className="relative">
      <img
        alt={t("browser.chat.screenshotAlt", {
          page: preview.title ?? preview.url ?? "",
        })}
        className="block h-auto w-full"
        height={preview.height}
        src={preview.image}
        width={preview.width}
      />
      <BrowserMarks preview={preview} />
    </div>
  );
}

/** One frame with the agent's marks; a click shows it larger. */
export function BrowserScreenshot({ preview }: { preview: ScreenshotPreview }) {
  const { t } = useTranslation("ai-ui");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label={t("browser.chat.enlarge")}
        className="block w-full overflow-hidden rounded-lg border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(true)}
        type="button"
      >
        <BrowserScreenshotImage preview={preview} />
        <BrowserMarksLegend preview={preview} />
        {preview.url ? (
          <span className="block truncate border-t bg-muted/40 px-2 py-1 text-muted-foreground text-xs">
            {preview.url}
          </span>
        ) : null}
      </button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-w-[calc(100%-2rem)] gap-3 p-4 sm:max-w-[min(92vw,1280px)]">
          <DialogTitle className="truncate font-semibold text-base">
            {preview.title ?? t("browser.chat.screenshotTitle")}
          </DialogTitle>
          <div className="max-h-[80vh] overflow-auto rounded-md border">
            <BrowserScreenshotImage preview={preview} />
            <BrowserMarksLegend preview={preview} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
