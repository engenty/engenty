"use client";

// A person's copilot, as a face in a room: the blob everyone knows from the
// app bar, wearing the person's initials — so the room reads "Matthias'
// Copilot" at a glance, and never mistakes it for a second, anonymous copilot.

import { BlobAvatar, cn } from "@engenty/ui-core";

export function alterEgoInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

export function AlterEgoFace({
  className,
  size = 24,
  userName,
}: {
  className?: string;
  /** Height of the face in px; the initials badge scales with it. */
  size?: number;
  userName: string | null | undefined;
}) {
  const badge = Math.max(10, Math.round(size * 0.55));
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-grid shrink-0 place-items-center",
        className
      )}
      style={{ height: size, width: (size * 7) / 6 }}
    >
      <BlobAvatar
        character="ember"
        className="[&_.blob-shadow]:hidden"
        size={size}
      />
      {userName ? (
        <span
          className="absolute -right-1 -bottom-1 grid place-items-center rounded-full border border-background bg-foreground font-semibold text-[9px] text-background leading-none"
          style={{
            fontSize: Math.max(8, Math.round(badge * 0.55)),
            height: badge,
            width: badge,
          }}
        >
          {alterEgoInitials(userName)}
        </span>
      ) : null}
    </span>
  );
}
