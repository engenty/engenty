import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Lock, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { CatalogConnection } from "../api.js";
import { useConnectionSpacesQuery } from "../hooks/use-connection-space.js";

/**
 * Whose account this is: "Only me" (the person's own, their Copilot uses it
 * in any Space) or the Space that owns it.
 */
export function OwnerChip({
  className,
  connection,
}: {
  className?: string;
  connection: Pick<CatalogConnection, "space_id">;
}) {
  const { t } = useTranslation("connections");
  const spacesQuery = useConnectionSpacesQuery();
  const spaceName = connection.space_id
    ? (spacesQuery.data?.find((space) => space.id === connection.space_id)
        ?.name ?? t("sheet.ownerSpaceUnknown"))
    : null;
  const Icon = spaceName ? Users : Lock;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground",
        className
      )}
    >
      <Icon aria-hidden className="size-3" />
      {spaceName
        ? t("sheet.ownerSpace", { name: spaceName })
        : t("sheet.ownerMine")}
    </span>
  );
}

/**
 * One connected account: its label, the owner, its status, and whatever the
 * surface puts at the end (Manage, a chevron). The same row on the Space
 * home, Space settings, the connector detail and the person's page.
 */
export function AccountRow({
  connection,
  fallbackLabel,
  onClick,
  showOwner = true,
  subtitle,
  trailing,
}: {
  connection: Pick<
    CatalogConnection,
    "display_name" | "external_account" | "space_id" | "status"
  >;
  /** Shown when the account has no display name or address (the service). */
  fallbackLabel: string;
  onClick?: () => void;
  showOwner?: boolean;
  /** A second line, e.g. the service name when the label is an address. */
  subtitle?: string | null;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation("connections");
  const label =
    connection.display_name?.trim() ||
    connection.external_account?.trim() ||
    fallbackLabel;
  const failing =
    connection.status === "error" || connection.status === "revoked";
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">{label}</span>
        {subtitle && subtitle !== label ? (
          <span className="block truncate text-muted-foreground text-xs">
            {subtitle}
          </span>
        ) : null}
      </span>
      {showOwner ? <OwnerChip connection={connection} /> : null}
      <span
        className={cn(
          "shrink-0 text-xs",
          failing ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {t(`status.${connection.status}`)}
      </span>
    </>
  );
  const rowClass =
    "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left";
  return (
    <div className="flex min-w-0 items-center gap-2">
      {onClick ? (
        <button
          className={cn(rowClass, "rounded-lg hover:bg-muted/40")}
          onClick={onClick}
          type="button"
        >
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
      {trailing ? <span className="shrink-0 pr-2">{trailing}</span> : null}
    </div>
  );
}
