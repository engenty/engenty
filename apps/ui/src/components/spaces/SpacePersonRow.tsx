import { useTranslation } from "@engenty/i18n/ui";
import { Avatar, AvatarFallback, Badge, Button } from "@engenty/ui-core";
import { CheckCircle2, Plus, Settings2 } from "lucide-react";
import { initials } from "./space-roster";

export interface SpacePersonItem {
  email: string | null;
  id: string;
  inSpace: boolean;
  name: string;
  role: "member" | "owner" | null;
}

const AVATAR_TONES = [
  "bg-[var(--ember-tint)] text-primary",
  "bg-[var(--moss-tint)] text-foreground",
  "bg-[var(--cobalt-tint)] text-foreground",
  "bg-[var(--amber-tint)] text-foreground",
  "bg-[var(--rose-tint)] text-foreground",
] as const;

export function personAvatarTone(id: string): string {
  const index =
    [...id].reduce((total, character) => total + character.charCodeAt(0), 0) %
    AVATAR_TONES.length;
  return AVATAR_TONES[index] ?? AVATAR_TONES[0];
}

export function SpacePersonRow({
  item,
  onOpen,
  saving,
}: {
  item: SpacePersonItem;
  onOpen: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-3 px-2 py-3">
      <Avatar className="size-8">
        <AvatarFallback
          className={`font-bold text-[10px] ${personAvatarTone(item.id)}`}
        >
          {initials(item.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{item.name}</p>
        {item.email ? (
          <p className="truncate text-muted-foreground text-xs">{item.email}</p>
        ) : null}
      </div>
      {item.inSpace ? (
        <div className="flex shrink-0 items-center gap-2">
          <Badge className="gap-1" variant="secondary">
            <CheckCircle2 className="size-3" />
            {item.role === "owner"
              ? t("spaces.members.alwaysInSpace")
              : t("spaces.members.inSpace")}
          </Badge>
          <Button
            aria-label={t("spaces.members.detailsLabel", { name: item.name })}
            disabled={saving}
            onClick={onOpen}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Settings2 className="size-3.5" />
            <span className="hidden sm:inline">
              {t("spaces.members.details")}
            </span>
          </Button>
        </div>
      ) : (
        <Button
          disabled={saving}
          onClick={onOpen}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-3.5" />
          {t("spaces.members.add")}
        </Button>
      )}
    </div>
  );
}
