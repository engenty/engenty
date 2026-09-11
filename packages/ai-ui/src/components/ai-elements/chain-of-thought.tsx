// ChainOfThought — collapsible step-by-step AI reasoning panel.
// Adapts the AI Elements chain-of-thought pattern for @engenty/ui-core.
// Replaces the flat Reasoning block + individual ToolCallCard rows with a
// single grouped block that mirrors Claude AI's thought-process sidebar.
"use client";

import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@engenty/ui-core";
import type { LucideIcon } from "lucide-react";
import { Brain, ChevronDown, DotIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Shimmer } from "./shimmer";

/** Set on the transcript scroll viewport while CoT open/close is pinning scroll. */
export const COT_SUPPRESS_AUTOSCROLL_ATTR = "data-engenty-suppress-autoscroll";

const COT_PIN_MS = 420;

function findScrollViewport(from: HTMLElement | null): HTMLElement | null {
  return (
    from?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null
  );
}

/**
 * Keep `anchor` fixed in the viewport while CoT height animates, and suppress
 * transcript auto-scroll so open/close does not jump to the message end.
 */
function pinAnchorDuringHeightChange(
  anchor: HTMLElement,
  viewport: HTMLElement
): () => void {
  const desiredTop = anchor.getBoundingClientRect().top;
  viewport.setAttribute(COT_SUPPRESS_AUTOSCROLL_ATTR, "1");

  const adjust = () => {
    const delta = anchor.getBoundingClientRect().top - desiredTop;
    if (delta !== 0) {
      viewport.scrollTop += delta;
    }
  };

  const ro = new ResizeObserver(adjust);
  const cotRoot = anchor.closest<HTMLElement>(".group\\/cot") ?? anchor;
  ro.observe(cotRoot);
  adjust();

  const timer = window.setTimeout(() => {
    ro.disconnect();
    viewport.removeAttribute(COT_SUPPRESS_AUTOSCROLL_ATTR);
  }, COT_PIN_MS);

  return () => {
    window.clearTimeout(timer);
    ro.disconnect();
    viewport.removeAttribute(COT_SUPPRESS_AUTOSCROLL_ATTR);
  };
}

// --- Context ---

interface ChainOfThoughtContextValue {
  duration: number | undefined;
  isOpen: boolean;
  isStreaming: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
);

export function useChainOfThought(): ChainOfThoughtContextValue {
  const ctx = useContext(ChainOfThoughtContext);
  if (!ctx) {
    throw new Error(
      "ChainOfThought sub-components must be used within <ChainOfThought>"
    );
  }
  return ctx;
}

function useControllableState<T>({
  defaultProp,
  onChange,
  prop,
}: {
  defaultProp?: T;
  onChange?: (next: T) => void;
  prop?: T;
}): [T | undefined, (next: T) => void] {
  const [uncontrolled, setUncontrolled] = useState(defaultProp);
  const value = prop === undefined ? uncontrolled : prop;
  const setValue = useCallback(
    (next: T) => {
      if (prop === undefined) {
        setUncontrolled(next);
      }
      onChange?.(next);
    },
    [onChange, prop]
  );
  return [value, setValue];
}

// --- ChainOfThought (root collapsible) ---

const AUTO_CLOSE_DELAY_MS = 1200;
const MS_IN_S = 1000;

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  defaultOpen?: boolean;
  duration?: number;
  isStreaming?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

export const ChainOfThought = memo(
  ({
    children,
    className,
    defaultOpen,
    duration: durationProp,
    isStreaming = false,
    onOpenChange,
    open,
    ...props
  }: ChainOfThoughtProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen, setIsOpen] = useControllableState({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const startTimeRef = useRef<number | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const unpinRef = useRef<(() => void) | null>(null);

    const setIsOpenPinned = useCallback(
      (next: boolean) => {
        unpinRef.current?.();
        unpinRef.current = null;
        const root = rootRef.current;
        const header =
          root?.querySelector<HTMLElement>("[data-slot=cot-header]") ?? root;
        const viewport = findScrollViewport(root);
        if (header && viewport) {
          unpinRef.current = pinAnchorDuringHeightChange(header, viewport);
        }
        setIsOpen(next);
      },
      [setIsOpen]
    );

    useEffect(
      () => () => {
        unpinRef.current?.();
        unpinRef.current = null;
      },
      []
    );

    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
        return;
      }
      if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    useEffect(() => {
      if (isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpenPinned(true);
      }
    }, [isExplicitlyClosed, isOpen, isStreaming, setIsOpenPinned]);

    useEffect(() => {
      if (
        hasEverStreamedRef.current &&
        !isStreaming &&
        isOpen &&
        !hasAutoClosed
      ) {
        const timer = window.setTimeout(() => {
          setIsOpenPinned(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY_MS);
        return () => window.clearTimeout(timer);
      }
    }, [hasAutoClosed, isOpen, isStreaming, setIsOpenPinned]);

    const ctx = useMemo(
      () => ({
        duration,
        isOpen: isOpen ?? false,
        isStreaming,
        setIsOpen: setIsOpenPinned,
      }),
      [duration, isOpen, isStreaming, setIsOpenPinned]
    );

    return (
      <ChainOfThoughtContext.Provider value={ctx}>
        <Collapsible
          className={cn("group/cot w-full", className)}
          onOpenChange={setIsOpenPinned}
          open={isOpen}
          {...props}
        >
          <div ref={rootRef}>{children}</div>
        </Collapsible>
      </ChainOfThoughtContext.Provider>
    );
  }
);
ChainOfThought.displayName = "ChainOfThought";

// --- ChainOfThoughtHeader (collapsible trigger) ---

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  getLabel?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetLabel = (isStreaming: boolean, duration?: number): string => {
  if (isStreaming || duration === 0) {
    return "Thinking";
  }
  if (duration === undefined) {
    return "Thought briefly";
  }
  return `Thought for ${duration}s`;
};

export const ChainOfThoughtHeader = memo(
  ({
    children,
    className,
    getLabel = defaultGetLabel,
    ...props
  }: ChainOfThoughtHeaderProps) => {
    const { duration, isOpen, isStreaming } = useChainOfThought();
    const label = getLabel(isStreaming, duration);

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-sm py-0.5 text-left text-muted-foreground text-sm",
          "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
          className
        )}
        data-slot="cot-header"
        type="button"
        {...props}
      >
        {children ?? (
          <>
            <Brain className="size-3.5 shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate">
              {isStreaming ? (
                <Shimmer as="span" duration={2} spread={2}>
                  {typeof label === "string" ? label : "Thinking"}
                </Shimmer>
              ) : (
                label
              )}
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 opacity-50 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  }
);
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";

// --- ChainOfThoughtContent ---

export const ChainOfThoughtContent = memo(
  ({
    children,
    className,
    ...props
  }: ComponentProps<typeof CollapsibleContent>) => (
    <CollapsibleContent
      className={cn("pt-1 pb-0.5 data-[state=closed]:animate-out", className)}
      {...props}
    >
      <div className="space-y-0">{children}</div>
    </CollapsibleContent>
  )
);
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";

// --- ChainOfThoughtStep ---

export type ChainOfThoughtStepStatus =
  | "active"
  | "complete"
  | "error"
  | "pending";

const stepStatusStyles: Record<ChainOfThoughtStepStatus, string> = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  error: "text-destructive/85",
  pending: "text-muted-foreground/50",
};

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  description?: string;
  icon?: LucideIcon;
  label: string;
  status?: ChainOfThoughtStepStatus;
};

export const ChainOfThoughtStep = memo(
  ({
    children,
    className,
    description,
    icon: Icon = DotIcon,
    label,
    status = "complete",
    ...props
  }: ChainOfThoughtStepProps) => {
    const isActive = status === "active";

    return (
      <div
        className={cn(
          "flex gap-2 py-1 text-sm",
          stepStatusStyles[status],
          className
        )}
        {...props}
      >
        {/* Icon column stretches with the step so the connector meets the next icon. */}
        <div className="relative mt-0.5 flex w-4 shrink-0 justify-center self-stretch">
          <Icon
            className={cn(
              "relative z-[1] size-4 shrink-0",
              isActive && "opacity-80",
              status === "error"
                ? "text-destructive/80"
                : "text-muted-foreground"
            )}
          />
          <div className="absolute top-5 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden pt-px">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate">
              {isActive ? (
                <Shimmer as="span" duration={2} spread={2}>
                  {label}
                </Shimmer>
              ) : (
                label
              )}
            </span>
            {description ? (
              <span className="shrink-0 text-muted-foreground/55 text-xs">
                {description}
              </span>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    );
  }
);
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";

// --- ChainOfThoughtSearchResults / ChainOfThoughtSearchResult ---

export const ChainOfThoughtSearchResults = memo(
  ({ children, className, ...props }: ComponentProps<"div">) => (
    <div className={cn("mt-1 flex flex-wrap gap-1", className)} {...props}>
      {children}
    </div>
  )
);
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";

// --- ChainOfThoughtImage ---

export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string;
};

export const ChainOfThoughtImage = memo(
  ({ caption, children, className, ...props }: ChainOfThoughtImageProps) => (
    <div className={cn("mt-1.5 space-y-1", className)} {...props}>
      <div className="overflow-hidden rounded-md border border-border-soft bg-muted/30">
        {children}
      </div>
      {caption ? (
        <p className="text-muted-foreground/70 text-xs leading-snug">
          {caption}
        </p>
      ) : null}
    </div>
  )
);
ChainOfThoughtImage.displayName = "ChainOfThoughtImage";

export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>;

export const ChainOfThoughtSearchResult = memo(
  ({ children, className, ...props }: ChainOfThoughtSearchResultProps) => (
    <Badge
      className={cn(
        "h-5 max-w-[14rem] truncate rounded-full px-2 font-normal text-xs",
        "bg-muted/60 text-muted-foreground hover:bg-muted/80",
        className
      )}
      variant="secondary"
      {...props}
    >
      {children}
    </Badge>
  )
);
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";
