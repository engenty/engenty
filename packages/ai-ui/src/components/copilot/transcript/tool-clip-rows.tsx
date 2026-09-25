"use client";

// Clips as the transcript draws them: centered one-liners between the turns,
// the way a chat app notes "X joined". A run of clips from one group folds
// into one line with a count. The block pads itself a little, so the same
// air sits around it wherever it lands — between rows or inside a turn.

import { useTranslation } from "@engenty/i18n/ui";
import { Link } from "react-router-dom";
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
      continue;
    }
    lines.push({ clip, count: 1, key });
  }
  return lines;
}

export function ToolClipRows({
  clips,
}: {
  clips: readonly { clip: ToolClip; key: string }[];
}) {
  const { t } = useTranslation("ai-ui");
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
            <Icon aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </>
        );
        const className =
          "inline-flex max-w-full items-center gap-1.5 text-muted-foreground text-xs";
        return clip.href && count === 1 ? (
          <Link
            className={`${className} hover:text-foreground`}
            data-testid="tool-clip"
            key={key}
            to={clip.href}
          >
            {body}
          </Link>
        ) : (
          <span className={className} data-testid="tool-clip" key={key}>
            {body}
          </span>
        );
      })}
    </div>
  );
}
