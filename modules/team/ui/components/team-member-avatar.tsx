import { useQuery } from "@engenty/query-client";
import { Avatar, AvatarFallback, AvatarImage, cn } from "@engenty/ui-core";
import { getTeamFileStorageSignedUrl } from "../lib/team-file-storage-url.js";

export type TeamMemberAvatarVariant = "table" | "card" | "profile";

function avatarSizeClass(
  variant: TeamMemberAvatarVariant,
  compact: boolean
): string {
  if (variant === "profile") {
    return "h-16 w-16";
  }
  if (variant === "table") {
    return compact ? "h-6 w-6" : "h-7 w-7";
  }
  return compact ? "h-8 w-8" : "h-10 w-10";
}

function fallbackTextClass(
  variant: TeamMemberAvatarVariant,
  compact: boolean
): string {
  if (variant === "profile") {
    return "text-xl";
  }
  if (variant === "table") {
    return compact ? "text-[10px]" : "text-micro";
  }
  return compact ? "text-xs" : "text-sm";
}

export function teamMemberAvatarInitials(
  fullName: string,
  initials: string | null | undefined
): string {
  return initials?.trim() || fullName.slice(0, 2).toUpperCase();
}

export function TeamMemberAvatar(props: {
  compact?: boolean;
  fullName: string;
  initials: string | null | undefined;
  /** Makes the avatar a button (e.g. open avatar editor). */
  onClick?: () => void;
  storageKey: string | null | undefined;
  variant?: TeamMemberAvatarVariant;
}) {
  const variant = props.variant ?? "table";
  const compact = props.compact ?? false;
  const storageKey = props.storageKey ?? null;

  const imageUrlQuery = useQuery({
    queryKey: ["team", "profile-image-url", storageKey],
    queryFn: () => getTeamFileStorageSignedUrl(storageKey!),
    enabled: Boolean(storageKey),
    staleTime: 45 * 60 * 1000,
  });

  const fallback = teamMemberAvatarInitials(props.fullName, props.initials);

  const avatar = (
    <Avatar
      className={cn("shrink-0", avatarSizeClass(variant, compact))}
      data-slot="team-member-avatar"
    >
      {storageKey && imageUrlQuery.data ? (
        <AvatarImage alt={props.fullName} src={imageUrlQuery.data} />
      ) : null}
      <AvatarFallback
        className={cn(
          "rounded-full border border-foreground/10 bg-muted text-muted-foreground",
          fallbackTextClass(variant, compact)
        )}
      >
        {fallback}
      </AvatarFallback>
    </Avatar>
  );

  if (!props.onClick) {
    return avatar;
  }

  return (
    <button
      aria-label={`Edit profile picture for ${props.fullName}`}
      className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={props.onClick}
      type="button"
    >
      {avatar}
      <span className="pointer-events-none absolute inset-0 rounded-full bg-black/0 transition-colors group-hover:bg-black/25" />
    </button>
  );
}
