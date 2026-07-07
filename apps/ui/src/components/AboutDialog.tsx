import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { DockEngentyIcon } from "@engenty/ui-icons";

interface AboutDialogProps {
  brandLabel: string;
  logoUrl?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  version: string;
}

export function AboutDialog({
  open,
  onOpenChange,
  brandLabel,
  version,
  logoUrl,
}: AboutDialogProps) {
  const { t } = useTranslation("common");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border-[2.5px] border-slate-900/85 bg-emerald-100 p-2 dark:border-slate-200/85 dark:bg-emerald-950/45">
            {logoUrl ? (
              <img
                alt={brandLabel}
                className="size-full rounded-lg object-contain"
                height={48}
                src={logoUrl}
                width={48}
              />
            ) : (
              <DockEngentyIcon aria-hidden className="size-full" />
            )}
          </div>
          <DialogTitle className="mt-2">{brandLabel}</DialogTitle>
          <DialogDescription>
            {t("about.version", { version })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-center text-muted-foreground text-sm">
          {t("about.tagline")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
