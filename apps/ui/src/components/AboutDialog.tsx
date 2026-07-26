import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { DockEngentyIcon } from "@engenty/ui-icons";
import { useWorkspaceContextQuery } from "@/lib/workspace-context-query";

/** Fallback when the tenant has no commercial package (single-tenant local install). */
const LOCAL_PLAN_LABEL = "local";

interface AboutDialogProps {
  brandLabel: string;
  logoUrl?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Optional override; defaults to workspace context plan (or "local"). */
  planLabel?: string;
  /** Optional override; defaults to current tenant name. */
  tenantName?: string | null;
  version: string;
}

export function AboutDialog({
  open,
  onOpenChange,
  brandLabel,
  version,
  logoUrl,
  tenantName: tenantNameProp,
  planLabel: planLabelProp,
}: AboutDialogProps) {
  const { t } = useTranslation("common");
  // Read from the shared workspace-context query so tenant/plan stay correct even
  // when callers omit props or HMR leaves a stale App shell in place.
  const workspace = useWorkspaceContextQuery(open);
  const tenantName =
    tenantNameProp?.trim() ||
    workspace.data?.currentTenant?.name?.trim() ||
    null;
  const planLabel =
    planLabelProp?.trim() ||
    workspace.data?.planLabel?.trim() ||
    t("sidebar.plan") ||
    LOCAL_PLAN_LABEL;

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
        <dl className="mx-auto grid max-w-[16rem] grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {tenantName ? (
            <>
              <dt className="text-muted-foreground">{t("about.tenant")}</dt>
              <dd className="truncate text-left font-medium text-foreground">
                {tenantName}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t("about.plan")}</dt>
          <dd className="truncate text-left font-medium text-foreground">
            {planLabel}
          </dd>
        </dl>
        <p className="pt-2 text-center text-muted-foreground text-sm">
          {t("about.tagline")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
