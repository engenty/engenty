"use client";

import { cn } from "@engenty/ui-core";
import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { MessageResponse } from "../../ai-elements/message";
import { Shimmer } from "../../ai-elements/shimmer";

export interface SubAgentRunSectionLabels {
  input: string;
  log: string;
  output: string;
}

export const DEFAULT_SUB_AGENT_RUN_SECTION_LABELS: SubAgentRunSectionLabels = {
  input: "Input",
  log: "Log",
  output: "Output",
};

function SubAgentSectionHeader(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-border/60 border-b px-3 py-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide",
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

const COLLAPSE_MAX_H = "max-h-40";

export function SubAgentTextPanel(props: {
  bodyClassName?: string;
  children?: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  emptyText: string;
  label: string;
  markdown?: boolean;
  text: string | null;
}) {
  const {
    bodyClassName,
    className,
    collapsible,
    emptyText,
    label,
    markdown,
    text,
  } = props;
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!(collapsible && bodyRef.current)) {
      return;
    }
    const el = bodyRef.current;
    setOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [collapsible, text]);

  const isCollapsed = collapsible && !expanded;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border/60 bg-muted/20",
        className
      )}
    >
      <SubAgentSectionHeader>{label}</SubAgentSectionHeader>
      {text ? (
        <>
          <div
            className={cn(
              isCollapsed && COLLAPSE_MAX_H,
              isCollapsed && "overflow-hidden"
            )}
            ref={collapsible ? bodyRef : undefined}
          >
            {markdown ? (
              <div className={cn("px-3 py-2 text-sm", bodyClassName)}>
                <MessageResponse>{text}</MessageResponse>
              </div>
            ) : (
              <p
                className={cn(
                  "whitespace-pre-wrap px-3 py-2 text-foreground text-sm leading-relaxed",
                  bodyClassName
                )}
              >
                {text}
              </p>
            )}
          </div>
          {collapsible && (overflows || expanded) ? (
            <button
              className="flex w-full items-center justify-center gap-1 border-border/60 border-t py-1.5 text-muted-foreground text-xs hover:bg-muted/30"
              onClick={() => setExpanded((v) => !v)}
              type="button"
            >
              {expanded ? (
                <>
                  <ChevronUp aria-hidden className="size-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown aria-hidden className="size-3" />
                  Show more
                </>
              )}
            </button>
          ) : null}
        </>
      ) : (
        <p className="px-3 py-2 text-muted-foreground text-xs">{emptyText}</p>
      )}
    </div>
  );
}

export function SubAgentLogPanel(props: {
  className?: string;
  emptyText: string;
  isActive: boolean;
  label: string;
  lines: string[];
  maxHeightClassName?: string;
}) {
  const {
    className,
    emptyText,
    isActive,
    label,
    lines,
    maxHeightClassName = "max-h-48",
  } = props;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isActive, lines.length]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border/60 bg-muted/20",
        className
      )}
    >
      <SubAgentSectionHeader>
        <Terminal
          aria-hidden
          className="size-3.5 normal-case tracking-normal"
        />
        <span>{label}</span>
        {lines.length > 0 ? (
          <span className="font-normal text-muted-foreground/70 normal-case tracking-normal">
            · {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </SubAgentSectionHeader>
      {lines.length === 0 ? (
        <p className="px-3 py-2 text-muted-foreground text-xs">{emptyText}</p>
      ) : (
        <div
          className={cn(
            "overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed",
            maxHeightClassName
          )}
        >
          {lines.map((line, index) => {
            const isLast = index === lines.length - 1;
            if (isActive && isLast) {
              return (
                <Shimmer as="p" className="text-muted-foreground" key={index}>
                  {line}
                </Shimmer>
              );
            }
            return (
              <p className="text-muted-foreground" key={index}>
                {line}
              </p>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
