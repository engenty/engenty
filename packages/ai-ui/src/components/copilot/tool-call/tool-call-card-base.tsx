"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Check, ChevronRight, CircleAlert, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { Shimmer } from "../../ai-elements/shimmer";
import type { ToolCallCardProps, ToolCallState } from "./tool-call-card.types";

interface ToolCallCardBaseProps extends Omit<ToolCallCardProps, "toolName"> {
  children?: ReactNode;
  details: string[];
  headline: string;
  icon?: ReactNode;
  tone?: "default" | "entity" | "web_search" | "reasoning";
}

function ToolCallStatusIcon({ state }: { state: ToolCallState }) {
  if (state === "running") {
    return <Spinner className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (state === "pending") {
    return (
      <AnimatedLoaderIcon
        className="shrink-0 text-muted-foreground"
        play="always"
        size="xs"
      />
    );
  }
  if (state === "error") {
    return <CircleAlert className="size-3.5 shrink-0 text-destructive/80" />;
  }
  if (state === "completed") {
    return <Check className="size-3.5 shrink-0 text-muted-foreground/70" />;
  }
  return <Clock3 className="size-3.5 shrink-0 text-muted-foreground/70" />;
}

function ToolCallRowContent({
  headline,
  metadata,
  state,
}: {
  headline: string;
  metadata?: string;
  state: ToolCallState;
}) {
  const isRunning = state === "running" || state === "pending";
  const isCompleted = state === "completed";
  const isError = state === "error";

  return (
    <>
      <ToolCallStatusIcon state={state} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          isCompleted && "text-muted-foreground",
          isError && "text-destructive/85",
          !(isCompleted || isError) && "text-foreground/90"
        )}
      >
        {isRunning ? (
          <Shimmer as="span" duration={2} spread={2}>
            {headline}
          </Shimmer>
        ) : (
          headline
        )}
        {metadata ? (
          <span
            className={cn(
              "ml-2 font-normal",
              isError ? "text-destructive/65" : "text-muted-foreground/65"
            )}
          >
            {metadata}
          </span>
        ) : null}
      </span>
    </>
  );
}

function ToolCallDetailsBody({
  children,
  details,
  headline,
}: {
  children?: ReactNode;
  details: string[];
  headline: string;
}) {
  if (children) {
    return (
      <div className="space-y-2 border-border/50 border-l-2 pl-3 text-xs">
        {children}
      </div>
    );
  }
  if (details.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1 border-border/50 border-l-2 pl-3 text-xs">
      {details.map((row, index) => (
        <p className="text-muted-foreground" key={`${headline}-${index}`}>
          {row}
        </p>
      ))}
    </div>
  );
}

export function ToolCallCardBase({
  children,
  className,
  defaultOpen = false,
  density = "default",
  details,
  // Registry/adapter-only props — destructured out so `{...rest}` does not
  // leak them onto DOM elements (React 19 logs "Unknown prop on a DOM
  // element" for camelCase keys it doesn't recognize).
  displayLabel: _displayLabel,
  errorText: _errorText,
  headline,
  icon: _icon,
  input: _input,
  metadata,
  output: _output,
  fullPageHref: _fullPageHref,
  fullPageLabel: _fullPageLabel,
  progressLines: _progressLines,
  resolvedToolName: _resolvedToolName,
  state = "completed",
  subAgentSectionLabels: _subAgentSectionLabels,
  toolCallId: _toolCallId,
  tone: _tone = "default",
  ...rest
}: ToolCallCardBaseProps) {
  const hasDetails = details.length > 0 || !!children;
  const isRunning = state === "running" || state === "pending";

  const triggerClassName = cn(
    "flex w-full min-w-0 items-center gap-2 rounded-sm py-0.5 text-left text-sm",
    "text-muted-foreground transition-colors hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
    !hasDetails && "cursor-default hover:text-muted-foreground"
  );

  const chevron = hasDetails ? (
    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all group-focus-within/tool-call:opacity-100 group-hover/tool-call:opacity-100 group-data-[state=open]/tool-call:rotate-90 group-data-[state=open]/tool-call:opacity-100" />
  ) : null;

  const rowContent = (
    <ToolCallRowContent headline={headline} metadata={metadata} state={state} />
  );

  const detailsBody = (
    <ToolCallDetailsBody details={details} headline={headline}>
      {children}
    </ToolCallDetailsBody>
  );

  if (density === "compact") {
    const surface = (
      <div
        aria-busy={isRunning || undefined}
        className={cn("group/tool-call w-full", className)}
        {...rest}
      >
        <div className={triggerClassName}>
          {rowContent}
          {chevron}
        </div>
      </div>
    );

    if (!hasDetails) {
      return surface;
    }

    return (
      <Popover modal={false}>
        <PopoverTrigger asChild>
          <button
            aria-busy={isRunning || undefined}
            className="group/tool-call block w-full cursor-pointer rounded-sm p-0 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
            type="button"
          >
            <div className={cn("w-full", className)} {...rest}>
              <div className={triggerClassName}>
                {rowContent}
                {chevron}
              </div>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-72 max-w-[min(100vw-2rem,26rem)] overflow-y-auto text-sm"
          onOpenAutoFocus={(event) => event.preventDefault()}
          side="top"
        >
          {detailsBody}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Collapsible
      className={cn("group/tool-call w-full", className)}
      defaultOpen={defaultOpen}
      {...rest}
    >
      <CollapsibleTrigger
        aria-busy={isRunning || undefined}
        className={triggerClassName}
        disabled={!hasDetails}
        type="button"
      >
        {rowContent}
        {chevron}
      </CollapsibleTrigger>
      {hasDetails ? (
        <CollapsibleContent className="pt-1 pb-0.5">
          {detailsBody}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
