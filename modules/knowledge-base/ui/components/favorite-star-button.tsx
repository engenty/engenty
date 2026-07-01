import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  cn,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { isFavoriteNavTo } from "@engenty/user-settings";
import { Star } from "lucide-react";
import {
  favoritesNavQueryOptions,
  useKbToggleFavoriteNavMutation,
} from "../favorites-nav-queries.js";

export interface FavoriteStarButtonProps {
  buttonVariant?: "ghost" | "outline";
  className?: string;
  subtitle?: string | null;
  title: string;
  to: string;
}

export function FavoriteStarButton({
  buttonVariant = "outline",
  className,
  subtitle,
  title,
  to,
}: FavoriteStarButtonProps) {
  const { t } = useTranslation("kb");
  const { data: doc } = useQuery(favoritesNavQueryOptions());
  const toggle = useKbToggleFavoriteNavMutation();
  const on = doc ? isFavoriteNavTo(doc, to) : false;

  return (
    <Button
      aria-label={on ? undefined : t("favorites.add_hint")}
      aria-pressed={on}
      className={cn(topbarIconButtonClassName, className)}
      disabled={toggle.isPending}
      onClick={() =>
        void toggle.mutateAsync({
          to,
          title,
          subtitle: subtitle ?? null,
        })
      }
      size="sm"
      title={on ? t("favorites.remove_hint") : t("favorites.add_hint")}
      variant={buttonVariant}
    >
      <Star
        className={
          on
            ? buttonVariant === "ghost"
              ? "size-3.5 fill-amber-400 text-amber-500"
              : "h-4 w-4 fill-amber-400 text-amber-500"
            : buttonVariant === "ghost"
              ? "size-3.5 text-muted-foreground"
              : "h-4 w-4 text-muted-foreground"
        }
      />
      {on ? (
        <TopbarActionLabel>{t("favorites.saved_label")}</TopbarActionLabel>
      ) : null}
    </Button>
  );
}
