import { openAgUiAgentInspector } from "@engenty/ai-ui";
import {
  RAIL_TILE_GLYPH_HOVER_CLASSNAME,
  useAppBarChromeContext,
} from "@engenty/app-shell";
import {
  getImpersonationState,
  signOutClearingImpersonation,
  stopImpersonation,
} from "@engenty/auth-ui";
import {
  getDeveloperModePreference,
  isEngentyDevelopmentEnvironment,
  setDeveloperModePreference,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useTranslation } from "@engenty/i18n/ui";
import type { QueryClient } from "@engenty/query-client";
import { useQueryClient } from "@engenty/query-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Switch,
} from "@engenty/ui-core";
import { useCurrentUserProfile } from "@engenty/user-management-ui";
import {
  Check,
  ChevronsUpDown,
  Code2,
  Laptop,
  LogOut,
  Moon,
  Settings,
  Sun,
  Undo2,
  Wrench,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setUserSetting } from "@/lib/api/client";
import { APPEARANCE_KEYS } from "@/lib/appearance-constants";
import { cn } from "@/lib/utils";
import {
  useWorkspaceContextQuery,
  workspaceContextOptions,
} from "@/lib/workspace-context-query";

interface SidebarUserMenuProps {
  compact: boolean;
}

type ThemeMode = "light" | "dark" | "system";

function invalidateWorkspaceAppearance(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: workspaceContextOptions.queryKey,
  });
}

function UserAvatar({
  initials,
  impersonating,
  size,
}: {
  initials: string;
  impersonating: boolean;
  size: "sm" | "md";
}) {
  const { t } = useTranslation("common");
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "flex items-center justify-center rounded-full border-[2.5px] font-semibold",
          size === "md" ? "size-8 text-sm" : "size-6 text-xs",
          impersonating
            ? "border-amber-700/90 bg-amber-100 text-amber-950 dark:border-amber-300/85 dark:bg-amber-950/55 dark:text-amber-50"
            : "border-slate-900/85 bg-emerald-100 text-slate-900 dark:border-slate-200/85 dark:bg-emerald-950/45 dark:text-slate-50"
        )}
      >
        {initials}
      </div>
      {impersonating ? (
        <span
          className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-amber-500"
          title={t("userMenu.impersonationBadge")}
        />
      ) : null}
    </div>
  );
}

export function SidebarUserMenu({ compact }: SidebarUserMenuProps) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [optimisticTheme, setOptimisticTheme] = useState<ThemeMode | null>(
    null
  );
  const displayTheme: ThemeMode = (optimisticTheme ??
    theme ??
    "system") as ThemeMode;

  useEffect(() => {
    if (optimisticTheme != null && theme === optimisticTheme) {
      setOptimisticTheme(null);
    }
  }, [optimisticTheme, theme]);
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const language = (i18n.language?.startsWith("de") ? "de" : "en") as
    | "de"
    | "en";
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const {
    displayName: userDisplayName,
    initials: userInitial,
    email: userEmail,
  } = useCurrentUserProfile();
  const [, setImpersonationEpoch] = useState(0);
  // Read stash every render so Login-as (query invalidate + navigate) and
  // Switch-back (epoch bump below) both update the badge without a remount.
  const impersonation = getImpersonationState();
  const isSimulating = impersonation !== null;

  // Developer mode is a superadmin tool — the toggle only appears for them.
  const workspace = useWorkspaceContextQuery(true);
  const showDeveloperMenu =
    isEngentyDevelopmentEnvironment() && workspace.data?.isSuperAdmin === true;
  const [developerMode, setDeveloperMode] = useState(
    getDeveloperModePreference
  );

  useEffect(() => {
    if (!showDeveloperMenu) {
      return;
    }
    return subscribeDeveloperModePreference(() => {
      setDeveloperMode(getDeveloperModePreference());
    });
  }, [showDeveloperMenu]);

  // Open the menu away from the app bar, whichever edge it is docked on.
  const { tooltipSide: awayFromBar } = useAppBarChromeContext();

  const actorLabel =
    impersonation?.actor.display_name?.trim() ||
    impersonation?.actor.email ||
    "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={
            isSimulating ? t("userMenu.impersonationBadge") : undefined
          }
          className={cn(
            "flex items-center gap-2 text-sm outline-none",
            compact
              ? cn(
                  // Round tile with the same hover / active chrome as the
                  // rail's line-glyph apps; open state wears the active ring.
                  "mx-auto size-9 justify-center rounded-full p-0 transition-shadow",
                  RAIL_TILE_GLYPH_HOVER_CLASSNAME,
                  "aria-expanded:shadow-[0_2px_8px_rgb(0_0_0/0.35)] aria-expanded:ring-2 aria-expanded:ring-sidebar-foreground/90"
                )
              : "w-full justify-start rounded-md p-2 transition-colors hover:bg-background/80 aria-expanded:bg-background/80"
          )}
          data-agent-user-menu-trigger
          ref={triggerRef}
          type="button"
        >
          <UserAvatar
            impersonating={isSimulating}
            initials={userInitial}
            size="md"
          />
          {!compact && (
            <>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userDisplayName}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {isSimulating
                    ? t("userMenu.actingAs", {
                        name:
                          impersonation.target.display_name?.trim() ||
                          impersonation.target.email,
                      })
                    : userEmail}
                </span>
              </div>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={compact ? "end" : "start"}
        className="w-56"
        data-agent-user-menu-content
        side={compact ? awayFromBar : "top"}
        // Compact: the avatar sits centred in the 56px rail, so clear the
        // rail's edge (14px of bar beyond the tile) plus the usual 6px gap.
        sideOffset={compact ? 20 : 6}
      >
        <DropdownMenuLabel className="p-2 pt-1 font-normal">
          <div className="flex items-center gap-3">
            <UserAvatar
              impersonating={isSimulating}
              initials={userInitial}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{userDisplayName}</p>
              <p className="truncate text-muted-foreground text-xs">
                {userEmail}
              </p>
              {isSimulating ? (
                <p className="mt-0.5 truncate text-[11px] text-amber-700 dark:text-amber-400">
                  {t("userMenu.actingAs", {
                    name:
                      impersonation.target.display_name?.trim() ||
                      impersonation.target.email,
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0 bg-sidebar-border" />

        <DropdownMenuGroup className="py-1">
          <DropdownMenuItem
            data-agent-user-menu-item-profile
            onClick={() => navigate("/settings/profile")}
          >
            <Settings className="mr-2 size-4" />
            <span>{t("userMenu.profile", { context: "settings" })}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-0 bg-sidebar-border" />

        <DropdownMenuGroup className="py-1">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-agent-user-menu-item-design>
              {displayTheme === "dark" ? (
                <Moon className="mr-2 size-4" />
              ) : displayTheme === "light" ? (
                <Sun className="mr-2 size-4" />
              ) : (
                <Laptop className="mr-2 size-4" />
              )}
              <span>{t("userMenu.design", { context: "theme" })}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onSelect={() => {
                  setOptimisticTheme("light");
                  setTheme("light");
                  void setUserSetting(APPEARANCE_KEYS.themeMode, {
                    type: "string",
                    value_string: "light",
                  }).then(() => invalidateWorkspaceAppearance(queryClient));
                }}
              >
                <Sun className="mr-2 size-4" />
                <span>{t("userMenu.light", { context: "theme" })}</span>
                {displayTheme === "light" && (
                  <Check className="ml-auto size-3.5" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setOptimisticTheme("dark");
                  setTheme("dark");
                  void setUserSetting(APPEARANCE_KEYS.themeMode, {
                    type: "string",
                    value_string: "dark",
                  }).then(() => invalidateWorkspaceAppearance(queryClient));
                }}
              >
                <Moon className="mr-2 size-4" />
                <span>{t("userMenu.dark", { context: "theme" })}</span>
                {displayTheme === "dark" && (
                  <Check className="ml-auto size-3.5" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setOptimisticTheme("system");
                  setTheme("system");
                  void setUserSetting(APPEARANCE_KEYS.themeMode, {
                    type: "string",
                    value_string: "system",
                  }).then(() => invalidateWorkspaceAppearance(queryClient));
                }}
              >
                <Laptop className="mr-2 size-4" />
                <span>{t("userMenu.system", { context: "theme" })}</span>
                {displayTheme === "system" && (
                  <Check className="ml-auto size-3.5" />
                )}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-agent-user-menu-item-language>
              <span aria-hidden className="mr-2 text-base leading-none">
                {language === "de" ? "🇩🇪" : "🇬🇧"}
              </span>
              <span>{t("userMenu.language")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44 rounded-lg p-1">
              <DropdownMenuItem
                onSelect={() => {
                  void i18n.changeLanguage("de");
                  void setUserSetting(APPEARANCE_KEYS.language, {
                    type: "string",
                    value_string: "de",
                  }).then(() => invalidateWorkspaceAppearance(queryClient));
                }}
              >
                <span aria-hidden className="mr-2 text-lg leading-none">
                  🇩🇪
                </span>
                <span>{t("userMenu.german")}</span>
                {language === "de" && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void i18n.changeLanguage("en");
                  void setUserSetting(APPEARANCE_KEYS.language, {
                    type: "string",
                    value_string: "en",
                  }).then(() => invalidateWorkspaceAppearance(queryClient));
                }}
              >
                <span aria-hidden className="mr-2 text-lg leading-none">
                  🇬🇧
                </span>
                <span>{t("userMenu.english")}</span>
                {language === "en" && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {showDeveloperMenu ? (
          <>
            <DropdownMenuSeparator className="my-0 bg-sidebar-border" />
            <DropdownMenuGroup className="py-1">
              <DropdownMenuItem
                className="flex cursor-default items-center justify-between gap-3 pr-2"
                data-agent-user-menu-item-developer-mode
                onPointerDown={(e) => {
                  if (
                    (e.target as HTMLElement).closest('[data-slot="switch"]')
                  ) {
                    e.stopPropagation();
                  }
                }}
                onSelect={(e) => {
                  e.preventDefault();
                }}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Code2 className="size-4 shrink-0" />
                  <span className="truncate">
                    {t("userMenu.developerMode")}
                  </span>
                </span>
                <Switch
                  checked={developerMode}
                  onCheckedChange={(checked) => {
                    setDeveloperModePreference(checked);
                    setDeveloperMode(checked);
                  }}
                />
              </DropdownMenuItem>
              {developerMode ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    data-agent-user-menu-item-developer-tools
                  >
                    <Wrench className="mr-2 size-4" />
                    <span>{t("userMenu.developerTools")}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48 rounded-lg p-1">
                    <DropdownMenuItem
                      onSelect={() => {
                        openAgUiAgentInspector();
                      }}
                    >
                      <Code2 className="mr-2 size-4" />
                      <span>{t("userMenu.agUiInspector")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
            </DropdownMenuGroup>
          </>
        ) : null}

        <DropdownMenuSeparator className="my-0 mb-1 bg-sidebar-border" />
        {isSimulating ? (
          <DropdownMenuItem
            data-agent-user-menu-item-switch-back
            onClick={async () => {
              await stopImpersonation();
              setImpersonationEpoch((n) => n + 1);
              await queryClient.invalidateQueries();
              navigate("/");
            }}
          >
            <Undo2 className="mr-2 size-4" />
            <span className="truncate">
              {actorLabel
                ? `${t("userMenu.switchBack")} (${actorLabel})`
                : t("userMenu.switchBack")}
            </span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          data-agent-user-menu-item-logout
          onClick={async () => {
            // Scope "local" ends only this browser's session; the default
            // "global" would log the user out everywhere. Clear any stashed
            // admin session so Logout while impersonating does not restore.
            await signOutClearingImpersonation();
            setImpersonationEpoch((n) => n + 1);
            navigate("/auth/login");
          }}
        >
          <LogOut className="mr-2 size-4" />
          <span>{t("userMenu.logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
