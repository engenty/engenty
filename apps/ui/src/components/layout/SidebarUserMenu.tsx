import { openAgUiAgentInspector } from "@engenty/ai-ui";
import { getSupabaseAuthClient } from "@engenty/auth-ui";
import {
  getDeveloperModePreference,
  isEngentyDevelopmentEnvironment,
  setDeveloperModePreference,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useTranslation } from "@engenty/i18n/ui";
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
import type { QueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronsUpDown,
  Code2,
  Laptop,
  LogOut,
  Moon,
  Settings,
  Sun,
  Wrench,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setUserSetting } from "@/lib/api/client";
import { APPEARANCE_KEYS } from "@/lib/appearance-constants";
import { cn } from "@/lib/utils";
import { workspaceContextOptions } from "@/lib/workspace-context-query";

interface SidebarUserMenuProps {
  compact: boolean;
}

type ThemeMode = "light" | "dark" | "system";

function invalidateWorkspaceAppearance(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: workspaceContextOptions.queryKey,
  });
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

  const showDeveloperMenu = isEngentyDevelopmentEnvironment();
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-md text-sm outline-none transition-colors",
            "hover:bg-background/80 data-[state=open]:bg-background/80",
            compact ? "justify-center p-0" : "justify-start p-2"
          )}
          data-agent-user-menu-trigger
          ref={triggerRef}
          type="button"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border-[2.5px] border-slate-900/85 bg-emerald-100 font-semibold text-slate-900 text-sm dark:border-slate-200/85 dark:bg-emerald-950/45 dark:text-slate-50">
            {userInitial}
          </div>
          {!compact && (
            <>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userDisplayName}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {userEmail}
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
        side={compact ? "right" : "top"}
        sideOffset={6}
      >
        <DropdownMenuLabel className="p-2 pt-1 font-normal">
          <div className="flex items-center gap-3">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full border-[2.5px] border-slate-900/85 bg-emerald-100 font-semibold text-slate-900 text-xs dark:border-slate-200/85 dark:bg-emerald-950/45 dark:text-slate-50">
              {userInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{userDisplayName}</p>
              <p className="truncate text-muted-foreground text-xs">
                {userEmail}
              </p>
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
        <DropdownMenuItem
          data-agent-user-menu-item-logout
          onClick={async () => {
            // Scope "local" ends only this browser's session; the default
            // "global" would log the user out everywhere.
            await getSupabaseAuthClient().auth.signOut({ scope: "local" });
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
