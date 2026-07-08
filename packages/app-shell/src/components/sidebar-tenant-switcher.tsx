import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { DockEngentyIcon } from "@engenty/ui-icons";
import { Check, ChevronsUpDown, Info, Settings } from "lucide-react";
import type { ShellTenant } from "../types/shell";

interface SidebarTenantSwitcherProps {
  aboutLabel?: string;
  appVersion?: string;
  availableTenants: ShellTenant[];
  brandLabel: string;
  canSwitchTenant: boolean;
  compact: boolean;
  currentTenant: ShellTenant | null;
  logoUrl?: string;
  noTenantLabel: string;
  onAboutClick?: () => void;
  onOpenSettings?: () => void;
  onSwitchTenant: (tenantId: string) => Promise<void>;
  planLabel: string;
  settingsLabel?: string;
  sidebarWidth?: number;
  surface?: "rail" | "panel";
  switchingTenant: boolean;
  switchTenantAriaLabel?: string;
}

function BrandMark({
  logoUrl,
  brandLabel,
  className,
}: {
  logoUrl?: string;
  brandLabel: string;
  className: string;
}) {
  if (logoUrl) {
    return (
      <img
        alt={brandLabel}
        className={cn("rounded-lg object-contain", className)}
        height={40}
        src={logoUrl}
        width={40}
      />
    );
  }
  return <DockEngentyIcon aria-hidden className={className} />;
}

export function SidebarTenantSwitcher({
  compact,
  currentTenant,
  availableTenants,
  canSwitchTenant,
  switchingTenant,
  onSwitchTenant,
  brandLabel,
  planLabel,
  switchTenantAriaLabel,
  appVersion,
  logoUrl,
  settingsLabel,
  onOpenSettings,
  aboutLabel,
  onAboutClick,
  surface = "rail",
  sidebarWidth,
}: SidebarTenantSwitcherProps) {
  // `brandLabel` is the tenant's own brand (company-profile) or the product
  // fallback — it, not the internal tenant name, is what the header should show.
  const primaryText = brandLabel;
  const secondaryText = appVersion
    ? `${planLabel} · v${appVersion}`
    : planLabel;
  const isPanel = surface === "panel";
  const iconScale = sidebarWidth && sidebarWidth < 64 ? sidebarWidth / 64 : 1;

  // A single tenant is the 99% case — the redundant "current tenant ✓" list is
  // only worth showing once there is more than one to switch between, and only
  // to users who may actually switch (superadmins; `canSwitchTenant`).
  const showTenantList = canSwitchTenant && availableTenants.length > 1;
  const showActions = Boolean(onOpenSettings || onAboutClick);

  return (
    // Modal: base-ui only renders its inline focus-guard + `aria-owns` owner
    // spans when NON-modal (`shouldRenderGuards = !modal && open`). Those spans
    // mount as siblings of the trigger inside the sidebar's `space-y-2` column
    // and visibly grow/shift the brand icon. base-ui menus don't scroll-lock or
    // render a backdrop, so modal adds no layout of its own — it just drops the
    // guards.
    <DropdownMenu modal={true}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={switchTenantAriaLabel ?? "App menu"}
          className={cn(
            "flex w-full items-center gap-2 rounded-md text-sm outline-none transition-colors disabled:opacity-60",
            isPanel
              ? "text-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
            compact ? "justify-center p-0" : "justify-start p-2"
          )}
          disabled={switchingTenant}
          type="button"
        >
          <div
            className="flex size-7.5 shrink-0 items-center justify-center rounded-xl border border-sidebar-primary/30 bg-sidebar-primary/15 p-1.5"
            style={{
              transform: iconScale < 1 ? `scale(${iconScale})` : undefined,
            }}
          >
            <BrandMark
              brandLabel={brandLabel}
              className="size-full"
              logoUrl={logoUrl}
            />
          </div>
          {!compact && (
            <>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{primaryText}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {secondaryText}
                </span>
              </div>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={compact ? "end" : "start"}
        className="w-56"
        side={compact ? "right" : "bottom"}
        sideOffset={6}
      >
        <DropdownMenuLabel className="p-2 pt-1 font-normal">
          <div className="flex items-center gap-3">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-lg border-[2.5px] border-slate-900/85 bg-emerald-100 p-1 dark:border-slate-200/85 dark:bg-emerald-950/45">
              <BrandMark
                brandLabel={brandLabel}
                className="size-full"
                logoUrl={logoUrl}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{primaryText}</p>
              <p className="truncate text-muted-foreground text-xs">
                {secondaryText}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>

        {showTenantList && (
          <>
            <DropdownMenuSeparator className="my-0 bg-sidebar-border" />
            <div className="max-h-64 overflow-y-auto py-1">
              {availableTenants.map((tenant) => (
                <DropdownMenuItem
                  disabled={
                    !canSwitchTenant ||
                    switchingTenant ||
                    tenant.id === currentTenant?.id
                  }
                  key={tenant.id}
                  onClick={async () => {
                    if (
                      tenant.id === currentTenant?.id ||
                      !canSwitchTenant ||
                      switchingTenant
                    ) {
                      return;
                    }
                    await onSwitchTenant(tenant.id);
                  }}
                >
                  <span className="flex-1 truncate">{tenant.name}</span>
                  {tenant.id === currentTenant?.id && (
                    <Check className="ml-auto size-3.5" />
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          </>
        )}

        {showActions && (
          <>
            <DropdownMenuSeparator className="my-0 bg-sidebar-border" />
            <div className="py-1">
              {onOpenSettings && (
                <DropdownMenuItem onClick={onOpenSettings}>
                  <Settings className="mr-2 size-4" />
                  <span className="flex-1 truncate">
                    {settingsLabel ?? "Settings"}
                  </span>
                </DropdownMenuItem>
              )}
              {onAboutClick && (
                <DropdownMenuItem onClick={onAboutClick}>
                  <Info className="mr-2 size-4" />
                  <span className="flex-1 truncate">
                    {aboutLabel ?? "About"}
                  </span>
                </DropdownMenuItem>
              )}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
