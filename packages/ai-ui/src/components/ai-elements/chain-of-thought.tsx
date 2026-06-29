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
import { Brain, Check, ChevronDown, DotIcon, Loader2, X } from "lucide-react";
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
        setIsOpen(true);
      }
    }, [isExplicitlyClosed, isOpen, isStreaming, setIsOpen]);

    useEffect(() => {
      if (
        hasEverStreamedRef.current &&
        !isStreaming &&
        isOpen &&
        !hasAutoClosed
      ) {
        const timer = window.setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY_MS);
        return () => window.clearTimeout(timer);
      }
    }, [hasAutoClosed, isOpen, isStreaming, setIsOpen]);

    const ctx = useMemo(
      () => ({
        duration,
        isOpen: isOpen ?? false,
        isStreaming,
        setIsOpen,
      }),
      [duration, isOpen, isStreaming, setIsOpen]
    );

    return (
      <ChainOfThoughtContext.Provider value={ctx}>
        <Collapsible
          className={cn("group/cot w-full", className)}
          onOpenChange={setIsOpen}
          open={isOpen}
          {...props}
        >
          {children}
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
      <div className="ml-[1px] space-y-0.5 border-border/40 border-l-2 pl-3">
        {children}
      </div>
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

function StepStatusIcon({
  Icon = DotIcon,
  status,
}: {
  Icon?: LucideIcon;
  status?: ChainOfThoughtStepStatus;
}) {
  if (status === "active") {
    return (
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
    );
  }
  if (status === "complete") {
    return <Check className="size-3.5 shrink-0 text-muted-foreground/60" />;
  }
  if (status === "error") {
    return <X className="size-3.5 shrink-0 text-destructive/80" />;
  }
  return <Icon className="size-3.5 shrink-0 text-muted-foreground/50" />;
}

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
    icon,
    label,
    status,
    ...props
  }: ChainOfThoughtStepProps) => {
    const isActive = status === "active";

    return (
      <div className={cn("py-0.5", className)} {...props}>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <StepStatusIcon Icon={icon} status={status} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              status === "complete" && "text-muted-foreground",
              status === "error" && "text-destructive/85",
              status !== "complete" &&
                status !== "error" &&
                "text-foreground/85"
            )}
          >
            {isActive ? (
              <Shimmer as="span" duration={2} spread={2}>
                {label}
              </Shimmer>
            ) : (
              label
            )}
          </span>
          {description ? (
            <span className="ml-1 shrink-0 text-muted-foreground/55 text-xs">
              {description}
            </span>
          ) : null}
        </div>
        {children ? <div className="mt-1 ml-5">{children}</div> : null}
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
      <div className="overflow-hidden rounded-md border border-border/40 bg-muted/30">
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
