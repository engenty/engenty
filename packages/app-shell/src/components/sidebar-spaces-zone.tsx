/**
 * Zone ② of the app rail — the spaces (PLAN-spaces.md Phase 5a).
 *
 * **A place must not look like a tool.** Space tiles are FILLED (the space's
 * colour behind its icon or initials); global apps keep their line glyphs.
 * Without that split the rail reads as one undifferentiated list of a dozen
 * things, which is the exact failure the pre-spaces rail already had.
 *
 * Overflow is a **chooser**, not an animation. Hidden tiles used to unfold on
 * hover and shove everything below them — including `+` — which is the failure
 * this control exists to avoid. The **current** tile is the full switcher
 * (every space, add, manage). When at least two spaces sit past the budget,
 * a horizontal ellipsis (`⋯`) opens the same list. One leftover space stays a
 * real tile; burying a single place behind a menu costs more than it saves.
 */
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@engenty/ui-core";
import { Check, MoreHorizontal, Plus, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppBarChromeContext } from "../context/app-bar-chrome-context";
import type {
  RailSpace,
  RailSpaceIndicator,
  RailSpaceTile,
  ResolveRailSpacesResult,
} from "../lib/rail-spaces";
import {
  RAIL_TILE_ACTIVE_RING_CLASSNAME,
  RAIL_TILE_ACTIVE_RING_INSET_CLASSNAME,
  RAIL_TILE_SPACE_REST_CLASSNAME,
} from "../lib/rail-tile-chrome";
import { SpaceIconFace } from "./space-icon-face";

/** Show `⋯` only when at least this many spaces sit past the visible budget. */
const RAIL_OVERFLOW_MIN_HIDDEN = 2;

export interface SidebarSpacesZoneLabels {
  allSpaces: string;
  /** Footer row that opens the full spaces list. */
  manage?: string;
  newSpace: string;
  /** Accessible name of the zone itself. */
  spaces: string;
  stack: (hiddenCount: number) => string;
  /** Current rail tile — opens the space chooser. */
  switchSpace: string;
}

export interface SidebarSpacesZoneProps {
  /** Admin-only: shows the `＋ New space` tile. */
  canCreate?: boolean;
  /** Empty-state copy for a member on a tenant with no spaces. */
  emptyHint?: string;
  labels: SidebarSpacesZoneLabels;
  onCreateSpace?: () => void;
  onNavigate?: () => void;
  /** Opens the full space list (search + manage). */
  onOpenSwitcher?: () => void;
  /** Skeleton tiles at the budget count, so the rail does not reflow. */
  pending?: boolean;
  resolved: ResolveRailSpacesResult;
  spaceHref: (space: { id: string; key: string }) => string;
}

/**
 * A dot for activity, a count only for mentions.
 *
 * A count on a *place* is a sum of unrelated things and teaches people to
 * ignore it; a mention is addressed to you personally, so it keeps its number.
 */
function SpaceIndicator({ indicator }: { indicator: RailSpaceIndicator }) {
  if (indicator.mentions) {
    return (
      <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-semibold text-[9px] text-primary-foreground leading-none">
        {indicator.mentions > 99 ? "99+" : indicator.mentions}
      </span>
    );
  }
  if (indicator.unread) {
    return (
      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-sidebar" />
    );
  }
  return null;
}

function tileStyle(color?: string | null) {
  return color
    ? { backgroundColor: color, color: "#fff" }
    : // No colour chosen: a neutral filled tile, still a PLACE, still distinct
      // from the line glyphs above and below it.
      undefined;
}

const TILE_BASE =
  "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg font-semibold text-xs";

/**
 * Discord-style edge pill + shadow chrome on the tile. The pill sits on the
 * rail's outer edge (`-translate-x-1.5` / `-translate-y-1.5` cancel the
 * app-bar `px-1.5` / `py-1.5`). Quiet tiles carry a soft contrast halo; hover
 * is a fuller shadow, still thinner than the current tile's 2px outline.
 * Hover also grows a short stub so you can see which place you are about to
 * enter. The slot stretches across the bar so `top-0` / `bottom-0` / `left-0`
 * / `right-0` are the padded content edge, not the tile.
 */
function RailSpaceSlot({
  children,
  current = false,
}: {
  children: ReactNode;
  current?: boolean;
}) {
  const { orientation, position } = useAppBarChromeContext();
  const horizontal = orientation === "horizontal";
  const pill = (() => {
    switch (position) {
      case "right":
        return {
          current: "h-8",
          hover: "h-0 group-focus-within/space:h-3 group-hover/space:h-3",
          rest: "top-1/2 right-0 w-1 translate-x-1.5 -translate-y-1/2 rounded-l-full",
        };
      case "top":
        return {
          current: "w-8",
          hover: "w-0 group-focus-within/space:w-3 group-hover/space:w-3",
          rest: "top-0 left-1/2 h-1 -translate-x-1/2 -translate-y-1.5 rounded-b-full",
        };
      case "bottom":
        return {
          current: "w-8",
          hover: "w-0 group-focus-within/space:w-3 group-hover/space:w-3",
          rest: "bottom-0 left-1/2 h-1 translate-y-1.5 -translate-x-1/2 rounded-t-full",
        };
      default:
        return {
          current: "h-8",
          hover: "h-0 group-focus-within/space:h-3 group-hover/space:h-3",
          rest: "top-1/2 left-0 w-1 -translate-x-1.5 -translate-y-1/2 rounded-r-full",
        };
    }
  })();
  return (
    <div
      className={cn(
        "group/space relative flex items-center justify-center",
        horizontal ? "h-full" : "w-full"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bg-sidebar-foreground transition-[height,width] duration-200 ease-out",
          pill.rest,
          current ? pill.current : pill.hover
        )}
      />
      <div
        className={cn(
          "rounded-lg transition-shadow",
          current
            ? horizontal
              ? RAIL_TILE_ACTIVE_RING_INSET_CLASSNAME
              : RAIL_TILE_ACTIVE_RING_CLASSNAME
            : RAIL_TILE_SPACE_REST_CLASSNAME
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** What a space looks like: its colour, and its icon or initials. */
function SpaceTileFace({ space }: { space: RailSpace }) {
  return <SpaceIconFace icon={space.icon} name={space.name} />;
}

function SpaceTile({
  className,
  href,
  onNavigate,
  space,
}: {
  className?: string;
  href: string;
  onNavigate?: () => void;
  space: RailSpaceTile;
}) {
  const { tooltipSide } = useAppBarChromeContext();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          aria-current={space.isCurrent ? "page" : undefined}
          className={cn(
            TILE_BASE,
            "transition",
            className,
            // Never dim a filled tile with `opacity`: that composites the
            // whole paint — colour included — and overlapping fills smear.
            space.color ? "" : "bg-sidebar-accent text-sidebar-foreground"
          )}
          onClick={onNavigate}
          style={tileStyle(space.color)}
          to={href}
        >
          <SpaceTileFace space={space} />
          {/* The accessible name is the space NAME, never its initials. */}
          <span className="sr-only">{space.name}</span>
          <SpaceIndicator indicator={space.indicator} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{space.name}</TooltipContent>
    </Tooltip>
  );
}

function SpaceChooserMenuItems({
  canCreate,
  labels,
  onCreateSpace,
  onNavigate,
  onOpenSwitcher,
  spaceHref,
  spaces,
}: {
  canCreate?: boolean;
  labels: SidebarSpacesZoneLabels;
  onCreateSpace?: () => void;
  onNavigate?: () => void;
  onOpenSwitcher?: () => void;
  spaceHref: (space: { id: string; key: string }) => string;
  spaces: readonly RailSpaceTile[];
}) {
  const navigate = useNavigate();
  const showCreate = Boolean(canCreate && onCreateSpace);
  const showManage = Boolean(onOpenSwitcher && labels.manage);

  return (
    <>
      <DropdownMenuLabel>{labels.allSpaces}</DropdownMenuLabel>
      {spaces.map((space) => (
        <DropdownMenuItem
          className={cn("gap-2", space.isCurrent && "font-medium")}
          key={space.id}
          onSelect={() => {
            onNavigate?.();
            navigate(spaceHref(space));
          }}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-5 shrink-0 place-items-center overflow-hidden rounded font-semibold text-[9px]",
              space.color ? "text-white" : "bg-muted text-foreground"
            )}
            style={tileStyle(space.color)}
          >
            <SpaceTileFace space={space} />
          </span>
          <span className="min-w-0 flex-1 truncate">{space.name}</span>
          {space.isCurrent ? (
            <Check aria-hidden className="size-3.5 text-muted-foreground" />
          ) : null}
        </DropdownMenuItem>
      ))}
      {showCreate || showManage ? <DropdownMenuSeparator /> : null}
      {showCreate ? (
        <DropdownMenuItem className="gap-2" onSelect={onCreateSpace}>
          <Plus className="size-4" />
          {labels.newSpace}
        </DropdownMenuItem>
      ) : null}
      {showManage ? (
        <DropdownMenuItem className="gap-2" onSelect={onOpenSwitcher}>
          <Settings2 className="size-4" />
          {labels.manage}
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

function CurrentSpaceChooserTile({
  canCreate,
  labels,
  onCreateSpace,
  onNavigate,
  onOpenSwitcher,
  space,
  spaceHref,
  spaces,
}: {
  canCreate?: boolean;
  labels: SidebarSpacesZoneLabels;
  onCreateSpace?: () => void;
  onNavigate?: () => void;
  onOpenSwitcher?: () => void;
  space: RailSpaceTile;
  spaceHref: (space: { id: string; key: string }) => string;
  spaces: readonly RailSpaceTile[];
}) {
  const { tooltipSide } = useAppBarChromeContext();
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-current="page"
            aria-label={labels.switchSpace}
            className={cn(
              TILE_BASE,
              "transition",
              space.color ? "" : "bg-sidebar-accent text-sidebar-foreground"
            )}
            style={tileStyle(space.color)}
          >
            <SpaceTileFace space={space} />
            <span className="sr-only">{space.name}</span>
            <SpaceIndicator indicator={space.indicator} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>{space.name}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56" side={tooltipSide}>
        <SpaceChooserMenuItems
          canCreate={canCreate}
          labels={labels}
          onCreateSpace={onCreateSpace}
          onNavigate={onNavigate}
          onOpenSwitcher={onOpenSwitcher}
          spaceHref={spaceHref}
          spaces={spaces}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SpaceOverflowChooser({
  canCreate,
  hiddenTotal,
  labels,
  onCreateSpace,
  onNavigate,
  onOpenSwitcher,
  spaces,
  spaceHref,
  stackIndicator,
}: {
  canCreate?: boolean;
  hiddenTotal: number;
  labels: SidebarSpacesZoneLabels;
  onCreateSpace?: () => void;
  onNavigate?: () => void;
  onOpenSwitcher?: () => void;
  spaces: readonly RailSpaceTile[];
  spaceHref: (space: { id: string; key: string }) => string;
  stackIndicator: RailSpaceIndicator;
}) {
  const { tooltipSide } = useAppBarChromeContext();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={labels.stack(hiddenTotal)}
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition",
          "hover:bg-sidebar-accent hover:text-sidebar-foreground",
          "data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-foreground"
        )}
      >
        <MoreHorizontal aria-hidden className="size-4" />
        <SpaceIndicator indicator={stackIndicator} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" side={tooltipSide}>
        <SpaceChooserMenuItems
          canCreate={canCreate}
          labels={labels}
          onCreateSpace={onCreateSpace}
          onNavigate={onNavigate}
          onOpenSwitcher={onOpenSwitcher}
          spaceHref={spaceHref}
          spaces={spaces}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarSpacesZone({
  canCreate = false,
  emptyHint,
  labels,
  onCreateSpace,
  onNavigate,
  onOpenSwitcher,
  pending = false,
  resolved,
  spaceHref,
}: SidebarSpacesZoneProps) {
  const { orientation, position, tooltipSide } = useAppBarChromeContext();
  const horizontal = orientation === "horizontal";
  /** Bottom strip: + and overflow sit toward the modules; tiles toward the brand. */
  const reverseChrome = position === "bottom";
  const { hidden, hiddenTotal, stackIndicator, visible } = resolved;
  const showChooser = hiddenTotal >= RAIL_OVERFLOW_MIN_HIDDEN;
  const extraTiles = showChooser ? [] : hidden;
  const chooserSpaces = [...visible, ...hidden];
  const stripClass = cn(
    "flex items-center gap-1",
    horizontal ? "h-full flex-row" : "flex-col py-1"
  );

  if (pending) {
    return (
      <div className={stripClass}>
        {[0, 1, 2].map((index) => (
          <div
            className="size-9 shrink-0 animate-pulse rounded-lg bg-sidebar-accent/60"
            key={index}
          />
        ))}
      </div>
    );
  }

  if (visible.length === 0 && !canCreate) {
    // Never an empty group with a separator above it: say why it is empty.
    return emptyHint ? (
      <p className="px-1 py-2 text-center text-[10px] text-sidebar-foreground/55 leading-tight">
        {emptyHint}
      </p>
    ) : null;
  }

  const spaceTiles = (
    <>
      {visible.map((space) =>
        space.isCurrent ? (
          <RailSpaceSlot current key={space.id}>
            <CurrentSpaceChooserTile
              canCreate={canCreate}
              labels={labels}
              onCreateSpace={onCreateSpace}
              onNavigate={onNavigate}
              onOpenSwitcher={onOpenSwitcher}
              space={space}
              spaceHref={spaceHref}
              spaces={chooserSpaces}
            />
          </RailSpaceSlot>
        ) : (
          <RailSpaceSlot key={space.id}>
            <SpaceTile
              href={spaceHref(space)}
              onNavigate={onNavigate}
              space={space}
            />
          </RailSpaceSlot>
        )
      )}
      {extraTiles.map((space) => (
        <RailSpaceSlot key={space.id}>
          <SpaceTile
            href={spaceHref(space)}
            onNavigate={onNavigate}
            space={space}
          />
        </RailSpaceSlot>
      ))}
    </>
  );
  const overflowChooser = showChooser ? (
    <SpaceOverflowChooser
      canCreate={canCreate}
      hiddenTotal={hiddenTotal}
      labels={labels}
      onCreateSpace={onCreateSpace}
      onNavigate={onNavigate}
      onOpenSwitcher={onOpenSwitcher}
      spaceHref={spaceHref}
      spaces={chooserSpaces}
      stackIndicator={stackIndicator}
    />
  ) : null;
  const addSpaceButton = canCreate ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={labels.newSpace}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sidebar-border border-dashed text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={onCreateSpace}
          type="button"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{labels.newSpace}</TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <div aria-label={labels.spaces} className={stripClass} role="group">
      {reverseChrome ? (
        <>
          {addSpaceButton}
          {overflowChooser}
          {spaceTiles}
        </>
      ) : (
        <>
          {spaceTiles}
          {overflowChooser}
          {addSpaceButton}
        </>
      )}
    </div>
  );
}
