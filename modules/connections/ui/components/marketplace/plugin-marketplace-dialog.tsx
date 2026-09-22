import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import {
  PluginMarketplace,
  type PluginMarketplaceProps,
} from "./plugin-marketplace.js";

export function PluginMarketplacePanel(props: PluginMarketplaceProps) {
  return <PluginMarketplace {...props} />;
}

export function PluginMarketplaceDialog({
  agentId = null,
  agentName,
  onOpenChange,
  open,
  spaceId = null,
  spaceName,
}: {
  agentId?: string | null;
  agentName?: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId?: string | null;
  spaceName?: string | null;
}) {
  const { t } = useTranslation("connections");
  const title = agentId
    ? t("marketplace.titleAgent", { name: agentName ?? agentId })
    : t("marketplace.title");
  const hint = agentId
    ? t("marketplace.hintAgent")
    : t("marketplace.hintSpace");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {spaceName && !agentId
              ? t("marketplace.hintNamedSpace", { name: spaceName })
              : hint}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {open ? (
            <PluginMarketplace agentId={agentId} spaceId={spaceId} />
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button">
            {t("marketplace.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
