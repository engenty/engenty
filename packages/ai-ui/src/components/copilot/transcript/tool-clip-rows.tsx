"use client";

// Clips as the transcript draws them: centered one-liners between the turns,
// the way a chat app notes "X joined". A run of clips from one group folds
// into one line with a count. The block pads itself a little, so the same
// air sits around it wherever it lands — between rows or inside a turn.

import { useTranslation } from "@engenty/i18n/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { spaceAgentDeskPath } from "../../../features/agent-form/hire-spaces.js";
import { ChatAgentFace } from "./chat-agent-face.js";
import type { ToolClip } from "./tool-clips.js";

interface ClipLine {
  clip: ToolClip;
  count: number;
  key: string;
}

export function foldToolClips(
  clips: readonly { clip: ToolClip; key: string }[]
): ClipLine[] {
  const lines: ClipLine[] = [];
  for (const { clip, key } of clips) {
    const last = lines.at(-1);
    if (last && clip.group && last.clip.group?.key === clip.group.key) {
      last.count += 1;
      if (clip.details) {
        last.clip = {
          ...last.clip,
          details: [...(last.clip.details ?? []), ...clip.details],
        };
      }
      continue;
    }
    lines.push({ clip, count: 1, key });
  }
  return lines;
}

const CLIP_CLASS =
  "inline-flex max-w-full items-center gap-1.5 text-muted-foreground text-xs";

const CLOSE_DELAY_MS = 150;

/** A clip whose details open on hover, and on click for touch. */
function ClipDetails(props: { children: ReactNode; details: string[] }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        className={`${CLIP_CLASS} cursor-pointer hover:text-foreground`}
        data-testid="tool-clip"
        onPointerEnter={show}
        onPointerLeave={hideSoon}
        type="button"
      >
        {props.children}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 max-w-[calc(100vw-2rem)] p-3 text-xs"
        data-testid="tool-clip-details"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={cancelClose}
        onPointerLeave={hideSoon}
        side="top"
      >
        <ul className="flex flex-col gap-1.5">
          {props.details.map((detail, index) => (
            <li
              className="whitespace-pre-wrap break-words"
              // Details are plain text in call order; one may repeat.
              key={index}
            >
              {detail}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function ToolClipRows({
  clips,
}: {
  clips: readonly { clip: ToolClip; key: string }[];
}) {
  const { t } = useTranslation("ai-ui");
  const { currentSpace } = useWorkspaceContext();
  const lines = foldToolClips(clips);
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col items-center gap-2 py-1">
      {lines.map(({ clip, count, key }) => {
        const values = Object.fromEntries(
          Object.entries(clip.values ?? {}).map(([name, value]) => [
            name,
            // A value that is itself a clip key (a page name) is translated.
            value.startsWith("toolClip.") ? t(value) : value,
          ])
        );
        const label =
          count > 1 && clip.group
            ? t(clip.group.key, { count, ...values })
            : t(clip.textKey, values);
        const Icon = clip.icon;
        const body = (
          <>
            {clip.agent ? (
              <ChatAgentFace
                agentId={clip.agent.id}
                engenty={clip.agent.engenty}
                name={values.name}
                size={16}
              />
            ) : (
              <Icon aria-hidden className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{label}</span>
          </>
        );
        if (clip.details && clip.details.length > 0) {
          return (
            <ClipDetails details={clip.details} key={key}>
              {body}
            </ClipDetails>
          );
        }
        const href =
          clip.agent && currentSpace?.key
            ? spaceAgentDeskPath(currentSpace.key, clip.agent.id)
            : clip.href;
        return href && count === 1 ? (
          <Link
            className={`${CLIP_CLASS} hover:text-foreground`}
            data-testid="tool-clip"
            key={key}
            to={href}
          >
            {body}
          </Link>
        ) : (
          <span className={CLIP_CLASS} data-testid="tool-clip" key={key}>
            {body}
          </span>
        );
      })}
    </div>
  );
}
