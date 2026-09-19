// How far a conversation is visible — the one fact a person must never get
// wrong — read the same everywhere: the chip and the band in the chat header,
// the marker before a name in the sidebar and the Space's chat list. Three
// tiers, one icon family (design canvas "Marker — mit wem + wie sichtbar"):
//
//   private   — closed lock: you and the agent, nobody can join
//   protected — key: the people invited, and no one else
//   open      — hash: a place everyone in the Space reads along in
//
// Open is the default: the hash marks a room that is a place (a channel),
// never a desk — a glyph before most names says nothing. Never colour alone:
// the icon and the word carry the tier in greyscale too.
//
// The chip says two things (design canvas matrix "wer ist drin × wie
// sichtbar"): WHO is in the conversation — one agent, the people of the
// Space with their agents, or a place — and then the tier. A desk in an open
// Space is not a channel: it is a bot, and any number of people can read
// along, so its glyph is people + bot, never the hash.
"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Bot, Hash, KeyRound, Lock, Users } from "lucide-react";
import type { ReactNode } from "react";
import { formatRelativeDateShort } from "../../features/agents-workspace/date-format.js";
import type { ChatKind } from "./chat-kind-badge.js";

export type ChatVisibility = "open" | "private" | "protected";

/**
 * Who the Space itself lets in — what "readable by the Space" amounts to.
 * A personal space is one person; a private space is the people added to it;
 * an open space is everyone in the tenant.
 */
export interface ChatSpaceAudience {
  /** The people in a private space, when known (the viewer included). */
  peopleCount?: number | null;
  personal: boolean;
  visibility: "open" | "private";
}

/**
 * The tier of something the whole Space reads — a desk, or a room open to
 * the Space. In an open Space that is open. In a private one it is as wide
 * as the Space: one person (or a personal space) makes it private, more make
 * it protected. Unknown Space: open, the default.
 */
export function spaceAudienceVisibility(
  space: ChatSpaceAudience | null | undefined
): ChatVisibility {
  if (!space || space.visibility === "open") {
    return "open";
  }
  if (space.personal) {
    return "private";
  }
  return typeof space.peopleCount === "number" && space.peopleCount > 1
    ? "protected"
    : "private";
}

/**
 * The tier a conversation sits in, from what it is, (for a room) whom it is
 * stored as readable by, and how far the Space around it reaches. A DM and
 * the personal copilot are private by nature; a desk is the Space's; a room
 * is its members' or the Space's.
 */
export function chatVisibilityOf(
  kind: ChatKind,
  roomVisibility?: string | null,
  space?: ChatSpaceAudience | null
): ChatVisibility {
  switch (kind) {
    case "copilot":
    case "dm":
      return "private";
    case "room":
      return roomVisibility === "private"
        ? "protected"
        : spaceAudienceVisibility(space);
    default:
      return spaceAudienceVisibility(space);
  }
}

/** The tier's glyph. */
export const CHAT_VISIBILITY_ICONS = {
  open: Hash,
  private: Lock,
  protected: KeyRound,
} as const;

/** Who is in the conversation — the chip's first glyph. */
export type ChatWho = "agent" | "people-agents" | "place";

/**
 * A DM and the copilot are you and one agent. A room is a place. A desk is
 * you and the agent while it is private; once the Space's people read along
 * it is people and the agent.
 */
export function chatWhoOf(kind: ChatKind, visibility: ChatVisibility): ChatWho {
  switch (kind) {
    case "copilot":
    case "dm":
      return "agent";
    case "room":
      return "place";
    default:
      return visibility === "private" ? "agent" : "people-agents";
  }
}

/** The who-glyph: a bot, people with a bot, or the hash of a place. */
function ChatWhoGlyph({ who }: { who: ChatWho }) {
  if (who === "place") {
    return <Hash aria-hidden className="size-3 shrink-0" strokeWidth={2.2} />;
  }
  if (who === "agent") {
    return <Bot aria-hidden className="size-3 shrink-0" strokeWidth={2.2} />;
  }
  // The bot first, then the people reading along, a hair apart.
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5">
      <Bot className="size-3" strokeWidth={2.2} />
      <Users className="size-3" strokeWidth={2.2} />
    </span>
  );
}

/**
 * The tier's colours. `chip` is the pill on the page canvas: private is the
 * flipped ground in miniature, protected a warm ember tint, open a cobalt
 * tint. `band` is the sticky band the chip grows into once the
 * identity has scrolled away — private flips the theme (`tone-flip`), so the
 * band and the topbar over it read in the other theme's palette; protected
 * is the ember tint under an ember rule; open is the card surface (white on
 * paper), no rule. `bandChip` is the chip once it sits on its own band.
 */
const TONES: Record<
  ChatVisibility,
  { band: string; bandChip: string; chip: string; rule: string | null }
> = {
  open: {
    band: "bg-card",
    // Cobalt, the Space's own colour: open means the Space reads along.
    // Grey said nothing.
    bandChip: "bg-primary/10 text-primary",
    chip: "bg-primary/10 text-primary",
    // No rule: at the top of the viewport a neutral 3px line read as a grey
    // bar, not as a tier. The card ground alone says open.
    rule: null,
  },
  private: {
    band: "tone-flip bg-background",
    bandChip: "bg-foreground/15 text-foreground",
    chip: "bg-foreground text-background",
    rule: null,
  },
  protected: {
    band: "bg-ember-tint",
    bandChip: "bg-ember/15 text-ember-strong",
    chip: "bg-ember-tint text-ember-strong",
    rule: "bg-ember",
  },
};

export interface ChatVisibilityCopyInput {
  /** Protected: how many are in (agents and people), when known. */
  memberCount?: number | null;
  /** Private DM: the agent's name — "only you and X". */
  name?: string | null;
  /** Open: the Space's name — "everyone in X". */
  spaceName?: string | null;
  visibility: ChatVisibility;
}

/** The tier's one word and the plain sentence saying who reads along. */
export function useChatVisibilityCopy(input: ChatVisibilityCopyInput) {
  const { t } = useTranslation("ai-ui");
  switch (input.visibility) {
    case "private": {
      const name = input.name?.trim();
      return {
        label: t("chatVisibility.private.label"),
        readers: name
          ? t("chatVisibility.private.readersWith", { name })
          : t("chatVisibility.private.readers"),
      };
    }
    case "protected":
      return {
        label: t("chatVisibility.protected.label"),
        readers:
          typeof input.memberCount === "number" && input.memberCount > 0
            ? t("chatVisibility.protected.readersCount", {
                count: input.memberCount,
              })
            : t("chatVisibility.protected.readers"),
      };
    default: {
      const space = input.spaceName?.trim();
      return {
        label: t("chatVisibility.open.label"),
        readers: space
          ? t("chatVisibility.open.readersIn", { space })
          : t("chatVisibility.open.readers"),
      };
    }
  }
}

/**
 * The glyph before a name in a list row; the word rides in the title. Open
 * is the default and gets no mark — except a room, which as a place wears
 * the hash — so the rows without a mark are what makes the lock and the key
 * read.
 */
export function ChatVisibilityMarker({
  className,
  kind,
  visibility,
}: {
  className?: string;
  /** What the row is — only a room shows the open tier's hash. */
  kind?: ChatKind;
  visibility: ChatVisibility;
}) {
  const copy = useChatVisibilityCopy({ visibility });
  const Icon = CHAT_VISIBILITY_ICONS[visibility];
  if (visibility === "open" && kind !== "room") {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center text-muted-foreground",
        className
      )}
      data-chat-visibility={visibility}
      title={copy.label}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      <span className="sr-only">{copy.label}</span>
    </span>
  );
}

/**
 * The chip's glyphs without the pill — who is in, then the tier's lock or
 * key (open wears none) — for a dense list row where the word rides in the
 * title: the conversation switcher, the Space's chat list.
 */
export function ChatVisibilityGlyphs({
  className,
  kind,
  visibility,
}: {
  className?: string;
  kind: ChatKind;
  visibility: ChatVisibility;
}) {
  const copy = useChatVisibilityCopy({ visibility });
  const TierIcon =
    visibility === "open" ? null : CHAT_VISIBILITY_ICONS[visibility];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-muted-foreground",
        className
      )}
      data-chat-visibility={visibility}
      data-chat-who={chatWhoOf(kind, visibility)}
      title={copy.label}
    >
      <ChatWhoGlyph who={chatWhoOf(kind, visibility)} />
      {TierIcon ? (
        <TierIcon aria-hidden className="size-3 shrink-0" strokeWidth={2.2} />
      ) : null}
      <span className="sr-only">{copy.label}</span>
    </span>
  );
}

export interface ChatVisibilityChipProps extends ChatVisibilityCopyInput {
  className?: string;
  /** What the conversation is — sets the who-glyph. Absent: the tier alone. */
  kind?: ChatKind | null;
  /** On the page canvas (the identity block) or on the tier's own band. */
  surface?: "band" | "canvas";
}

/**
 * Glyphs and word as one pill: who is in (bot, people + bot, a place), the
 * tier's lock or key — open is the default and wears none — and the word.
 */
export function ChatVisibilityChip({
  className,
  kind,
  surface = "canvas",
  ...copyInput
}: ChatVisibilityChipProps) {
  const copy = useChatVisibilityCopy(copyInput);
  const tone = TONES[copyInput.visibility];
  const TierIcon =
    copyInput.visibility === "open"
      ? null
      : CHAT_VISIBILITY_ICONS[copyInput.visibility];
  const who = kind ? chatWhoOf(kind, copyInput.visibility) : null;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 font-semibold text-[11px] leading-none",
        surface === "band" ? tone.bandChip : tone.chip,
        className
      )}
      data-chat-visibility={copyInput.visibility}
      data-chat-who={who ?? undefined}
      title={copy.readers}
    >
      {who ? <ChatWhoGlyph who={who} /> : null}
      {TierIcon ? (
        <TierIcon aria-hidden className="size-3 shrink-0" strokeWidth={2.2} />
      ) : who ? null : (
        // Nothing to draw: the tier alone, open — the hash stands in.
        <Hash aria-hidden className="size-3 shrink-0" strokeWidth={2.2} />
      )}
      <span>{copy.label}</span>
    </span>
  );
}

export interface ChatVisibilityBandProps extends ChatVisibilityCopyInput {
  /** What the page adds after the readers line — a module badge, standing, a status dot. */
  children?: ReactNode;
  className?: string;
  /** The info line's padding; defaults to the transcript's own gutter. */
  gutterClassName?: string;
  /** What the conversation is — the chip's who-glyph. */
  kind?: ChatKind | null;
  /** When the conversation last moved — right-aligned, compact ("vor 3 Min."). */
  lastActivityAt?: string | null;
}

/**
 * The sticky band: the tier's ground under the topbar row, for protected a
 * 3px rule along its top edge, and ONE line — the chip, who reads (truncated,
 * never wrapped; open is the default and says nothing), and on the right the
 * status dot and when the conversation last moved. Opaque: nothing scrolling
 * underneath shows through. The topbar row itself (breadcrumb left, actions
 * right) is the transparent shell topbar floating over the band's first 44px.
 */
export function ChatVisibilityBand({
  children,
  className,
  gutterClassName = "pr-3 pb-2 pl-5",
  kind,
  lastActivityAt,
  ...copyInput
}: ChatVisibilityBandProps) {
  const copy = useChatVisibilityCopy(copyInput);
  const tone = TONES[copyInput.visibility];
  const lastActivity = formatRelativeDateShort(lastActivityAt ?? null);
  return (
    <header
      // The band is only up while the transcript has scrolled under it, so
      // it always casts the light shadow that says so.
      className={cn(
        "pointer-events-auto w-full shrink-0 border-border-soft border-b shadow-sm",
        tone.band,
        className
      )}
      data-chat-visibility={copyInput.visibility}
      data-collapsed="true"
    >
      {tone.rule ? (
        <div aria-hidden className={cn("h-[3px] w-full", tone.rule)} />
      ) : null}
      <div aria-hidden className={tone.rule ? "h-[41px]" : "h-11"} />
      <div
        className={cn(
          "flex items-center gap-2 text-muted-foreground text-xs",
          gutterClassName
        )}
      >
        <ChatVisibilityChip kind={kind} surface="band" {...copyInput} />
        {copyInput.visibility === "open" ? null : (
          <span
            className="min-w-0 truncate"
            data-testid="chat-visibility-readers"
          >
            {copy.readers}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {children}
          {lastActivity ? (
            <span
              className="text-[11px] leading-none"
              data-testid="chat-visibility-activity"
              title={lastActivityAt ?? undefined}
            >
              {lastActivity}
            </span>
          ) : null}
        </span>
      </div>
    </header>
  );
}
