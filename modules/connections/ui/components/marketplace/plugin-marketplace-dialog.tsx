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

/** The marketplace for one Space; no `spaceId` = the personal Space. */
export function PluginMarketplaceDialog({
  onOpenChange,
  open,
  spaceId = null,
  spaceName,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId?: string | null;
  spaceName?: string | null;
}) {
  const { t } = useTranslation("connections");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("marketplace.title")}</DialogTitle>
          <DialogDescription>
            {spaceName
              ? t("marketplace.hintNamedSpace", { name: spaceName })
              : t("marketplace.hintSpace")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {open ? <PluginMarketplace spaceId={spaceId} /> : null}
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
