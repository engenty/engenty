"use client";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  Check,
  Copy,
  Link2,
  type LucideIcon,
  MoreHorizontal,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { MessageAction, MessageActions } from "../../ai-elements/message";
import { extractCopilotMessageCopyText } from "./copilot-thread-copy";

const MAX_INLINE_HOVER_ACTIONS = 2;

interface HoverAction {
  icon: LucideIcon;
  id: "copy" | "link";
  label: string;
  onSelect: () => void;
}

function CopilotMessageHoverActions({
  msg,
  surface,
}: {
  msg: { id: string; parts?: readonly unknown[]; role: string };
  surface: "default" | "chat";
}) {
  const [copiedKind, setCopiedKind] = useState<"copy" | "link" | null>(null);
  const text = useMemo(
    () => extractCopilotMessageCopyText(msg.parts),
    [msg.parts]
  );

  const flashCopied = useCallback((kind: "copy" | "link") => {
    setCopiedKind(kind);
    window.setTimeout(() => {
      setCopiedKind((current) => (current === kind ? null : current));
    }, 1400);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!text) {
      return;
    }
    await navigator.clipboard.writeText(text);
    flashCopied("copy");
  }, [flashCopied, text]);

  const handleCopyLink = useCallback(async () => {
    const url = new URL(window.location.href);
    url.hash = `message-${msg.id}`;
    await navigator.clipboard.writeText(url.toString());
    flashCopied("link");
  }, [flashCopied, msg.id]);

  if (!text) {
    return null;
  }

  const actions: HoverAction[] = [
    {
      icon: copiedKind === "copy" ? Check : Copy,
      id: "copy",
      label: copiedKind === "copy" ? "Copied" : "Copy message",
      onSelect: () => {
        void handleCopy();
      },
    },
    {
      icon: copiedKind === "link" ? Check : Link2,
      id: "link",
      label: copiedKind === "link" ? "Link copied" : "Copy link",
      onSelect: () => {
        void handleCopyLink();
      },
    },
  ];
  const showMenu = actions.length > MAX_INLINE_HOVER_ACTIONS;

  return (
    <MessageActions
      className={cn(
        "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100",
        surface === "chat"
          ? cn(
              "pointer-events-none absolute top-0.5 z-10 group-focus-within:pointer-events-auto group-hover:pointer-events-auto has-[[data-state=open]]:pointer-events-auto",
              msg.role === "user" ? "right-full mr-0.5" : "right-0"
            )
          : cn(
              "mt-1",
              msg.role === "user" ? "justify-end self-end" : "justify-start"
            )
      )}
    >
      {showMenu ? (
        <HoverActionsMenu
          actions={actions}
          side={msg.role === "user" ? "left" : "right"}
        />
      ) : (
        actions.map((action) => (
          <MessageAction
            className="rounded-full"
            key={action.id}
            label={action.label}
            onClick={action.onSelect}
            size="icon-xs"
            tooltip={action.label}
          >
            <action.icon className="size-3.5" />
          </MessageAction>
        ))
      )}
    </MessageActions>
  );
}

function HoverActionsMenu({
  actions,
  side,
}: {
  actions: HoverAction[];
  side: "left" | "right";
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Message actions"
          className="rounded-full"
          size="icon-xs"
          variant="ghost"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44" side={side}>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            onClick={() => {
              action.onSelect();
            }}
          >
            <action.icon className="size-3.5" />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Bubble/body plus the hover actions that sit beside it on the chat surface. */
export function CopilotMessageHoverBody({
  align,
  children,
  msg,
  surface,
}: {
  /** Override lane: colleague markers keep a user role but sit like assistant. */
  align?: "end" | "start";
  children: ReactNode;
  msg: { id: string; parts?: readonly unknown[]; role: string };
  surface: "default" | "chat";
}) {
  const side = align ?? (msg.role === "user" ? "end" : "start");
  return (
    <div
      className={cn(
        "relative w-fit max-w-full",
        side === "end" && "ml-auto",
        surface === "chat" && side === "start" && "w-full pr-14"
      )}
    >
      {children}
      <CopilotMessageHoverActions
        msg={side === "end" ? msg : { ...msg, role: "assistant" }}
        surface={surface}
      />
    </div>
  );
}
