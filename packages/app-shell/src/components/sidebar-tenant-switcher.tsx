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
import { Check, ChevronsUpDown } from "lucide-react";
import type { ShellTenant } from "../types/shell";

interface SidebarTenantSwitcherProps {
  availableTenants: ShellTenant[];
  brandLabel: string;
  canSwitchTenant: boolean;
  compact: boolean;
  currentTenant: ShellTenant | null;
  noTenantLabel: string;
  onSwitchTenant: (tenantId: string) => Promise<void>;
  planLabel: string;
  sidebarWidth?: number;
  surface?: "rail" | "panel";
  switchingTenant: boolean;
  switchTenantAriaLabel?: string;
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
  noTenantLabel,
  switchTenantAriaLabel,
  surface = "rail",
  sidebarWidth,
}: SidebarTenantSwitcherProps) {
  const primaryText = currentTenant?.name ?? brandLabel;
  const secondaryText = planLabel;
  const isPanel = surface === "panel";
  const iconScale = sidebarWidth && sidebarWidth < 64 ? sidebarWidth / 64 : 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={switchTenantAriaLabel ?? "Switch tenant"}
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
            className="flex size-7.5 shrink-0 items-center justify-center rounded-xl border border-sidebar-primary/30 bg-sidebar-primary/15 p-1"
            style={{
              transform: iconScale < 1 ? `scale(${iconScale})` : undefined,
            }}
          >
            <DockEngentyIcon aria-hidden className="size-full" />
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
            <div className="flex size-6 shrink-0 items-center justify-center rounded-lg border-[2.5px] border-slate-900/85 bg-emerald-100 p-0.5 dark:border-slate-200/85 dark:bg-emerald-950/45">
              <DockEngentyIcon aria-hidden className="size-full" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{primaryText}</p>
              <p className="truncate text-muted-foreground text-xs">
                {secondaryText}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0 bg-sidebar-border" />

        <div className="max-h-64 overflow-y-auto py-1">
          {availableTenants.length === 0 ? (
            <DropdownMenuItem className="text-muted-foreground" disabled>
              {currentTenant?.name ?? noTenantLabel}
            </DropdownMenuItem>
          ) : (
            availableTenants.map((tenant) => (
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
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
