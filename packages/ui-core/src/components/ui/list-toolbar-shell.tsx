import { ListFilter, MoreVertical, X } from "lucide-react";
import {
  Children,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { cn } from "../../utils";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { ListToolbarIconButton } from "./list-toolbar";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type OverflowPlacement = "toolbar" | "menu";

interface ListToolbarContextValue {
  hasSelection: boolean;
  overflowPlacement: OverflowPlacement;
  selectedCount: number;
}

const ListToolbarContext = createContext<ListToolbarContextValue | null>(null);

function useListToolbarContext(component: string): ListToolbarContextValue {
  const ctx = useContext(ListToolbarContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <ListToolbar>`);
  }
  return ctx;
}

/** Selection + overflow placement for compound toolbar regions. */
function useListToolbar(): ListToolbarContextValue {
  return useListToolbarContext("useListToolbar");
}

// ---------------------------------------------------------------------------
// Markers (for Children.toArray type checks)
// ---------------------------------------------------------------------------

const MAIN_AREA = "ListToolbarMainArea";
const ACTIONS = "ListToolbarActions";
const FILTER_ROW = "ListToolbarFilterRow";
const IDLE_CONTROLS = "ListToolbarIdleControls";
const BULK_ACTIONS = "ListToolbarBulkActions";
const OVERFLOW_ITEM = "ListToolbarOverflowItem";

function getDisplayName(type: unknown): string | undefined {
  if (typeof type === "function" || (typeof type === "object" && type)) {
    return (type as { displayName?: string }).displayName;
  }
  return undefined;
}

function isElementOfType(
  child: ReactNode,
  displayName: string
): child is ReactElement<{ children?: ReactNode; className?: string }> {
  return isValidElement(child) && getDisplayName(child.type) === displayName;
}

function findChild(
  children: ReactNode,
  displayName: string
): ReactElement | undefined {
  return Children.toArray(children).find((child) =>
    isElementOfType(child, displayName)
  ) as ReactElement | undefined;
}

function collectOverflowItems(idleControls: ReactElement | undefined): ReactNode[] {
  if (!idleControls) {
    return [];
  }
  return Children.toArray(
    (idleControls.props as { children?: ReactNode }).children
  )
    .filter((child) => isElementOfType(child, OVERFLOW_ITEM))
    .map((child) => (child.props as { children?: ReactNode }).children);
}

// ---------------------------------------------------------------------------
// ListToolbar (root)
// ---------------------------------------------------------------------------

interface ListToolbarProps {
  children: ReactNode;
  className?: string;
  /** When > 0, idle controls hide and bulk actions + overflow show. */
  selectedCount?: number;
}

function ListToolbar({
  children,
  className,
  selectedCount = 0,
}: ListToolbarProps) {
  const hasSelection = selectedCount > 0;
  const ctx = useMemo<ListToolbarContextValue>(
    () => ({
      hasSelection,
      overflowPlacement: "toolbar",
      selectedCount,
    }),
    [hasSelection, selectedCount]
  );

  const mainArea = findChild(children, MAIN_AREA);
  const actions = findChild(children, ACTIONS);
  const filterRow = findChild(children, FILTER_ROW);
  const other = Children.toArray(children).filter(
    (child) =>
      !(
        isElementOfType(child, MAIN_AREA) ||
        isElementOfType(child, ACTIONS) ||
        isElementOfType(child, FILTER_ROW)
      )
  );

  return (
    <ListToolbarContext.Provider value={ctx}>
      <div
        className={cn(
          "mb-3 flex min-w-0 flex-col gap-2 sm:mb-4 sm:gap-3",
          className
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center",
            hasSelection ? "md:flex-nowrap md:overflow-x-auto" : "md:flex-wrap"
          )}
        >
          {mainArea}
          {actions}
          {other}
        </div>
        {filterRow}
      </div>
    </ListToolbarContext.Provider>
  );
}
ListToolbar.displayName = "ListToolbar";

// ---------------------------------------------------------------------------
// ListToolbarMainArea
// ---------------------------------------------------------------------------

interface ListToolbarMainAreaProps {
  children: ReactNode;
  className?: string;
}

function ListToolbarMainArea({ children, className }: ListToolbarMainAreaProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2",
        className
      )}
      data-slot="list-toolbar-main"
    >
      {children}
    </div>
  );
}
ListToolbarMainArea.displayName = MAIN_AREA;

// ---------------------------------------------------------------------------
// ListToolbarSearch
// ---------------------------------------------------------------------------

interface ListToolbarSearchProps {
  children: ReactNode;
  className?: string;
}

function ListToolbarSearch({ children, className }: ListToolbarSearchProps) {
  return (
    <div
      className={cn(
        // Compact when idle; widen on focus so typing has room. Never `w-full` /
        // `flex-1` while idle — that steals the main row from filters/summary.
        "relative min-w-0 w-full max-w-[14rem] basis-full transition-[max-width] duration-200 ease-out sm:w-56 sm:max-w-[14rem] sm:basis-auto focus-within:max-w-md sm:focus-within:w-full sm:focus-within:max-w-md md:focus-within:max-w-lg",
        className
      )}
      data-slot="list-toolbar-search"
    >
      {children}
    </div>
  );
}
ListToolbarSearch.displayName = "ListToolbarSearch";

// ---------------------------------------------------------------------------
// ListToolbarFilterToggle
// ---------------------------------------------------------------------------

interface ListToolbarFilterToggleProps {
  active?: boolean;
  "aria-label": string;
  "aria-pressed"?: boolean;
  className?: string;
  onClick?: () => void;
  /** Show the primary active-filter dot. */
  showDot?: boolean;
}

function ListToolbarFilterToggle({
  active = false,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
  className,
  onClick,
  showDot = false,
}: ListToolbarFilterToggleProps) {
  return (
    <ListToolbarIconButton
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={cn(
        "absolute top-1/2 right-1 -translate-y-1/2",
        active && "text-foreground",
        className
      )}
      onClick={onClick}
      // Keep the mouse press from moving focus into the search wrapper.
      //
      // This button is anchored to the right edge of ListToolbarSearch, which
      // widens on `focus-within` (measured: 196px → 448px). Taking focus on
      // mousedown therefore slides the button ~250px right, out from under the
      // cursor — mouseup lands somewhere else and the browser never synthesizes
      // a click. The first press only expanded the field; the filter row stayed
      // shut. Suppressing the focus keeps the button still, so the click lands.
      //
      // Mouse focus only: Tab still reaches the button and Enter/Space still
      // fire onClick, which is position-independent.
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <span className="relative inline-flex">
        <ListFilter className="h-4 w-4" />
        {showDot ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
          />
        ) : null}
      </span>
    </ListToolbarIconButton>
  );
}
ListToolbarFilterToggle.displayName = "ListToolbarFilterToggle";

// ---------------------------------------------------------------------------
// ListToolbarSummary
// ---------------------------------------------------------------------------

interface ListToolbarSummaryProps {
  children: ReactNode;
  className?: string;
}

function ListToolbarSummary({ children, className }: ListToolbarSummaryProps) {
  return (
    <p
      className={cn(
        "min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums",
        className
      )}
      data-slot="list-toolbar-summary"
    >
      {children}
    </p>
  );
}
ListToolbarSummary.displayName = "ListToolbarSummary";

// ---------------------------------------------------------------------------
// ListToolbarActions
// ---------------------------------------------------------------------------

interface ListToolbarActionsProps {
  children: ReactNode;
  className?: string;
  /** aria-label for the selection overflow "more" trigger. */
  moreLabel?: string;
}

function ListToolbarActions({
  children,
  className,
  moreLabel = "More",
}: ListToolbarActionsProps) {
  const { hasSelection, selectedCount } =
    useListToolbarContext("ListToolbarActions");
  const idle = findChild(children, IDLE_CONTROLS);
  const bulk = findChild(children, BULK_ACTIONS);
  const overflowNodes = collectOverflowItems(idle);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:ml-auto md:shrink-0 md:justify-end",
        hasSelection
          ? "md:max-w-none md:flex-nowrap md:overflow-x-auto"
          : "md:max-w-[min(100%,42rem)]",
        className
      )}
      data-slot="list-toolbar-actions"
    >
      {hasSelection ? bulk : null}
      {hasSelection && overflowNodes.length > 0 ? (
        <div className="flex shrink-0">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <ListToolbarIconButton aria-label={moreLabel} type="button">
                <MoreVertical />
              </ListToolbarIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[min(22rem,calc(100vw-2rem))] p-2"
            >
              <ListToolbarContext.Provider
                value={{
                  hasSelection: true,
                  overflowPlacement: "menu",
                  selectedCount,
                }}
              >
                <div className="flex flex-col gap-1">{overflowNodes}</div>
              </ListToolbarContext.Provider>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      {hasSelection ? null : idle}
    </div>
  );
}
ListToolbarActions.displayName = ACTIONS;

// ---------------------------------------------------------------------------
// ListToolbarIdleControls
// ---------------------------------------------------------------------------

interface ListToolbarIdleControlsProps {
  children: ReactNode;
  className?: string;
}

function ListToolbarIdleControls({
  children,
  className,
}: ListToolbarIdleControlsProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-slot="list-toolbar-idle"
    >
      {children}
    </div>
  );
}
ListToolbarIdleControls.displayName = IDLE_CONTROLS;

// ---------------------------------------------------------------------------
// ListToolbarOverflowItem
// ---------------------------------------------------------------------------

interface ListToolbarOverflowItemProps {
  children: ReactNode;
}

/**
 * Marks children that move into the selection overflow "more" menu when rows
 * are selected. When idle, renders inline inside IdleControls.
 */
function ListToolbarOverflowItem({ children }: ListToolbarOverflowItemProps) {
  return <>{children}</>;
}
ListToolbarOverflowItem.displayName = OVERFLOW_ITEM;

// ---------------------------------------------------------------------------
// ListToolbarBulkActions
// ---------------------------------------------------------------------------

interface ListToolbarBulkActionsProps {
  children?: ReactNode;
  className?: string;
  clearSelectionLabel: string;
  onClearSelection?: () => void;
}

function ListToolbarBulkActions({
  children,
  className,
  clearSelectionLabel,
  onClearSelection,
}: ListToolbarBulkActionsProps) {
  return (
    <>
      {children}
      <Button
        aria-label={clearSelectionLabel}
        className={cn("shrink-0 gap-1", className)}
        onClick={onClearSelection}
        size="sm"
        type="button"
        variant="ghost"
      >
        <X className="h-3.5 w-3.5" />
        {clearSelectionLabel}
      </Button>
    </>
  );
}
ListToolbarBulkActions.displayName = BULK_ACTIONS;

// ---------------------------------------------------------------------------
// ListToolbarFilterRow
// ---------------------------------------------------------------------------

interface ListToolbarFilterRowProps {
  children: ReactNode;
  className?: string;
}

function ListToolbarFilterRow({
  children,
  className,
}: ListToolbarFilterRowProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5",
        className
      )}
      data-slot="list-toolbar-filter-row"
    >
      {children}
    </div>
  );
}
ListToolbarFilterRow.displayName = FILTER_ROW;

export {
  ListToolbar,
  ListToolbarActions,
  ListToolbarBulkActions,
  ListToolbarFilterRow,
  ListToolbarFilterToggle,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarOverflowItem,
  ListToolbarSearch,
  ListToolbarSummary,
  useListToolbar,
};
export type {
  ListToolbarActionsProps,
  ListToolbarBulkActionsProps,
  ListToolbarFilterRowProps,
  ListToolbarFilterToggleProps,
  ListToolbarIdleControlsProps,
  ListToolbarMainAreaProps,
  ListToolbarOverflowItemProps,
  ListToolbarProps,
  ListToolbarSearchProps,
  ListToolbarSummaryProps,
  OverflowPlacement,
};
