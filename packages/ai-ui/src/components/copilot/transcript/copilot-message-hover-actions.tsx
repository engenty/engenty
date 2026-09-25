"use client";

import { readA2uiRenderMeta } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
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
  Database,
  Link2,
  MoreHorizontal,
  PanelRight,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useOptionalAgentHost } from "../../../agent-provider/engenty-agent.js";
import { ENGENTY_COPILOT_HOST_KEY } from "../../../agent-provider/host-keys.js";
import { activateArtifact } from "../../../artifacts/artifact-store.js";
import { MessageAction, MessageActions } from "../../ai-elements/message";
import { extractCopilotMessageCopyText } from "./copilot-thread-copy";
import { observeElementResize } from "./shared-resize-observer.js";

/**
 * The stored artifact a message presents — a teaser (`show_ui` with an
 * artifact_id) or an artifact card — so its menu can act on the asset.
 */
function artifactIdOfMessage(parts: readonly unknown[] | undefined) {
  for (const part of parts ?? []) {
    const output =
      part && typeof part === "object"
        ? (part as { output?: unknown }).output
        : undefined;
    const fromTeaser = readA2uiRenderMeta(output)?.artifact_id;
    if (fromTeaser) {
      return fromTeaser;
    }
    const direct =
      output && typeof output === "object"
        ? (output as { artifact_id?: unknown }).artifact_id
        : undefined;
    if (typeof direct === "string" && direct.trim()) {
      return direct.trim();
    }
  }
  return null;
}

/** `/s/<key>/data?artifact=<id>` for the Space this page is in, else null. */
function spaceDataArtifactHref(artifactId: string): string | null {
  const key = window.location.pathname.match(/^\/s\/([^/]+)/)?.[1];
  return key
    ? `/s/${key}/data?${new URLSearchParams({ artifact: artifactId })}`
    : null;
}

// A bubble at least this many lines tall stacks its actions beside it; a
// shorter one lines them up. Leaving takes a line less than entering, so a
// bubble that rewraps against the wider gutter does not flip back and forth.
const TALL_ENTER_LINES = 4.5;
const TALL_LEAVE_LINES = 3.5;

function CopilotMessageHoverActions({
  beside = false,
  msg,
  surface,
  tall,
}: {
  beside?: boolean;
  msg: { id: string; parts?: readonly unknown[]; role: string };
  surface: "default" | "chat";
  tall: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const [copiedKind, setCopiedKind] = useState<
    "copy" | "link" | "artifact" | null
  >(null);
  const text = useMemo(
    () => extractCopilotMessageCopyText(msg.parts),
    [msg.parts]
  );
  const artifactId = useMemo(() => artifactIdOfMessage(msg.parts), [msg.parts]);
  const hostKey = useOptionalAgentHost()?.hostKey ?? ENGENTY_COPILOT_HOST_KEY;
  const artifactHref = artifactId ? spaceDataArtifactHref(artifactId) : null;
  const navigate = useNavigate();

  const flashCopied = useCallback((kind: "copy" | "link" | "artifact") => {
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

  const handleCopyArtifactLink = useCallback(async () => {
    if (!artifactHref) {
      return;
    }
    await navigator.clipboard.writeText(
      new URL(artifactHref, window.location.origin).toString()
    );
    flashCopied("artifact");
  }, [artifactHref, flashCopied]);

  if (!(text || artifactId)) {
    return null;
  }

  const copyLabel =
    copiedKind === "copy"
      ? t("messageActions.copied")
      : t("messageActions.copy");
  const CopyIcon = copiedKind === "copy" ? Check : Copy;

  return (
    <MessageActions
      className={cn(
        "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100",
        beside
          ? // Beside the bubble's foot on a wide lane; under it on a narrow
            // one, where there is no room to the right.
            cn(
              "pointer-events-none @max-[36rem]/chat-lane:static absolute bottom-0 left-full z-10 @max-[36rem]/chat-lane:mt-1 @max-[36rem]/chat-lane:ml-0 ml-1 @max-[36rem]/chat-lane:hidden group-focus-within:pointer-events-auto @max-[36rem]/chat-lane:group-focus-within:flex group-hover:pointer-events-auto has-[[data-state=open]]:pointer-events-auto",
              tall && "@min-[36rem]/chat-lane:flex-col"
            )
          : surface === "chat"
            ? cn(
                "pointer-events-none absolute top-0.5 z-10 group-focus-within:pointer-events-auto group-hover:pointer-events-auto has-[[data-state=open]]:pointer-events-auto",
                msg.role === "user" ? "right-full mr-0.5" : "right-0",
                tall && "flex-col"
              )
            : cn(
                "mt-1",
                msg.role === "user" ? "justify-end self-end" : "justify-start"
              )
      )}
    >
      {text ? (
        <MessageAction
          className="rounded-full"
          label={copyLabel}
          onClick={() => {
            void handleCopy();
          }}
          size="icon-xs"
          tooltip={copyLabel}
        >
          <CopyIcon className="size-3.5" />
        </MessageAction>
      ) : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("messageActions.more")}
            className="rounded-full"
            size="icon-xs"
            variant="ghost"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56"
          side={msg.role === "user" ? "left" : "right"}
        >
          {artifactId ? (
            <>
              <DropdownMenuItem
                onClick={() => activateArtifact(hostKey, artifactId)}
              >
                <PanelRight className="size-3.5" />
                {t("messageActions.openInPane")}
              </DropdownMenuItem>
              {artifactHref ? (
                <DropdownMenuItem onClick={() => navigate(artifactHref)}>
                  <Database className="size-3.5" />
                  {t("messageActions.openInData")}
                </DropdownMenuItem>
              ) : null}
              {artifactHref ? (
                <DropdownMenuItem
                  onClick={() => {
                    void handleCopyArtifactLink();
                  }}
                >
                  {copiedKind === "artifact" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Link2 className="size-3.5" />
                  )}
                  {copiedKind === "artifact"
                    ? t("messageActions.linkCopied")
                    : t("messageActions.copyArtifactLink")}
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
          <DropdownMenuItem
            onClick={() => {
              void handleCopyLink();
            }}
          >
            {copiedKind === "link" ? (
              <Check className="size-3.5" />
            ) : (
              <Link2 className="size-3.5" />
            )}
            {copiedKind === "link"
              ? t("messageActions.linkCopied")
              : t("messageActions.copyLink")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MessageActions>
  );
}

/** Whether the element has grown past about four lines of its own text. */
function useIsTall(ref: RefObject<HTMLElement | null>): boolean {
  const [tall, setTall] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const lineHeight =
        Number.parseFloat(getComputedStyle(element).lineHeight) || 20;
      const lines = element.getBoundingClientRect().height / lineHeight;
      setTall((current) =>
        current ? lines >= TALL_LEAVE_LINES : lines >= TALL_ENTER_LINES
      );
    };
    measure();
    return observeElementResize(element, measure);
  }, [ref]);
  return tall;
}

/** Bubble/body plus the hover actions that sit beside it on the chat surface. */
export function CopilotMessageHoverBody({
  align,
  beside = false,
  children,
  msg,
  surface,
}: {
  /** Override lane: colleague markers keep a user role but sit like assistant. */
  align?: "end" | "start";
  /** Agent bubble: the actions sit just right of it, at its foot. */
  beside?: boolean;
  children: ReactNode;
  msg: { id: string; parts?: readonly unknown[]; role: string };
  surface: "default" | "chat";
}) {
  const side = align ?? (msg.role === "user" ? "end" : "start");
  const ref = useRef<HTMLDivElement>(null);
  const tall = useIsTall(ref);
  return (
    <div
      // Touch has no hover: a tap focuses the bubble, and focus shows its
      // actions the way hovering does.
      className={cn(
        "outline-none",
        "relative w-fit max-w-full",
        side === "end" && "ml-auto",
        surface === "chat" && side === "start" && !beside && "w-full pr-14",
        // On a wide lane the agent's actions sit right of the bubble: keep
        // them their room — a column beside a tall bubble, a row beside a
        // short one.
        beside &&
          (tall
            ? "@min-[36rem]/chat-lane:max-w-[calc(100%-2.25rem)]"
            : "@min-[36rem]/chat-lane:max-w-[calc(100%-4rem)]")
      )}
      ref={ref}
      tabIndex={surface === "chat" ? -1 : undefined}
    >
      {children}
      <CopilotMessageHoverActions
        beside={beside}
        msg={side === "end" ? msg : { ...msg, role: "assistant" }}
        surface={surface}
        tall={tall}
      />
    </div>
  );
}
