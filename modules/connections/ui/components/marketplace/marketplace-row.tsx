import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ConnectorLogoImg, connectorLogoSvg } from "@engenty/ui-icons";
import { Cable, Check } from "lucide-react";
import { useState } from "react";
import type { MarketplacePlugin } from "./marketplace-model.js";

export function MarketplacePluginRow({
  installed,
  needsAuth,
  onAdd,
  onOpen,
  plugin,
  saving,
}: {
  installed: boolean;
  needsAuth: boolean;
  onAdd: () => void;
  onOpen: () => void;
  plugin: MarketplacePlugin;
  saving: boolean;
}) {
  const { t } = useTranslation("connections");
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-3">
      <PluginMark icon={plugin.icon} />
      <button
        className="min-w-0 flex-1 text-left"
        onClick={onOpen}
        type="button"
      >
        <p className="truncate font-medium text-sm">{plugin.name}</p>
        <p className="line-clamp-2 text-muted-foreground text-xs">
          {needsAuth
            ? t("marketplace.needsAuth")
            : plugin.description || plugin.id}
        </p>
      </button>
      {installed ? (
        <button
          aria-label={t("marketplace.details")}
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          onClick={onOpen}
          type="button"
        >
          <Check className="size-4" />
        </button>
      ) : (
        <Button
          className="shrink-0"
          disabled={saving}
          onClick={onAdd}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("marketplace.add")}
        </Button>
      )}
    </div>
  );
}

export function PluginMark({
  icon,
  className,
}: {
  className?: string;
  icon: string | null;
}) {
  if (connectorLogoSvg(icon)) {
    return (
      <ConnectorLogoImg
        className={cn("size-8 shrink-0 object-contain", className)}
        icon={icon}
        size={32}
      />
    );
  }
  return (
    <Cable className={cn("size-8 shrink-0 text-muted-foreground", className)} />
  );
}

export function RegistryLogo({
  className,
  domain,
}: {
  className?: string;
  domain: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <Cable
        className={cn("size-8 shrink-0 text-muted-foreground", className)}
      />
    );
  }
  return (
    <img
      alt=""
      className={cn("size-8 shrink-0 rounded-md object-contain", className)}
      onError={() => setFailed(true)}
      src={`https://integrations.sh/logo/${encodeURIComponent(domain)}`}
    />
  );
}
