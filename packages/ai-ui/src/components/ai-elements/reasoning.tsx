// AI Elements Reasoning — collapsible thinking block; opens while streaming, closes when done.
"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@engenty/ui-core";
import { ChevronRight } from "lucide-react";
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
import { MessageResponse } from "./message";
import { Shimmer } from "./shimmer";

interface ReasoningContextValue {
  duration: number | undefined;
  isOpen: boolean;
  isStreaming: boolean;
  setIsOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

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

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  duration?: number;
  isStreaming?: boolean;
};

const AUTO_CLOSE_DELAY_MS = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    children,
    className,
    defaultOpen,
    duration: durationProp,
    isStreaming = false,
    onOpenChange,
    open,
    ...props
  }: ReasoningProps) => {
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

    const contextValue = useMemo(
      () => ({
        duration,
        isOpen: isOpen ?? false,
        isStreaming,
        setIsOpen,
      }),
      [duration, isOpen, isStreaming, setIsOpen]
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn("group/reasoning w-full", className)}
          onOpenChange={setIsOpen}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  }
);

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (
  isStreaming: boolean,
  duration?: number
): ReactNode => {
  if (isStreaming || duration === 0) {
    return "Thinking";
  }
  if (duration === undefined) {
    return "Thought briefly";
  }
  return `Thought for ${duration}s`;
};

export const ReasoningTrigger = memo(
  ({
    children,
    className,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { duration, isOpen, isStreaming } = useReasoning();
    const label = getThinkingMessage(isStreaming, duration);

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
            <span className="min-w-0 truncate">
              {isStreaming ? (
                <Shimmer as="span" duration={2} spread={2}>
                  {typeof label === "string" ? label : "Thinking"}
                </Shimmer>
              ) : (
                label
              )}
            </span>
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 opacity-70 transition-transform",
                isOpen && "rotate-90"
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  }
);

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string;
};

export const ReasoningContent = memo(
  ({ children, className, ...props }: ReasoningContentProps) => (
    <CollapsibleContent
      className={cn("pt-1 pb-0.5 data-[state=closed]:animate-out", className)}
      {...props}
    >
      <div className="border-border-soft border-l-2 pl-3">
        <MessageResponse className="text-muted-foreground text-sm leading-relaxed">
          {children}
        </MessageResponse>
      </div>
    </CollapsibleContent>
  )
);

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
