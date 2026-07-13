import { getSupabaseAuthClient } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { Check, ChevronsUpDown, Laptop, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SidebarUserMenuProps {
  compact: boolean;
  displayName: string;
  email: string;
  initials: string;
}

type ThemeMode = "light" | "dark" | "system";

export function SidebarUserMenu({
  compact,
  displayName,
  email,
  initials,
}: SidebarUserMenuProps) {
  const { t, i18n } = useTranslation("common");
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const displayTheme = (theme ?? "system") as ThemeMode;
  const language = i18n.language?.startsWith("de") ? "de" : "en";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-md text-sm outline-none transition-colors",
            "hover:bg-background/80 data-[state=open]:bg-background/80",
            compact ? "justify-center p-0" : "justify-start p-2"
          )}
          type="button"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border-[2.5px] border-slate-900/85 bg-emerald-100 font-semibold text-slate-900 text-sm dark:border-slate-200/85 dark:bg-emerald-950/45 dark:text-slate-50">
            {initials}
          </div>
          {!compact && (
            <>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {email}
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
        side={compact ? "right" : "top"}
        sideOffset={6}
      >
        <DropdownMenuLabel className="p-2 pt-1 font-normal">
          <p className="truncate font-medium text-sm">{displayName}</p>
          <p className="truncate text-muted-foreground text-xs">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0 bg-sidebar-border" />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {displayTheme === "dark" ? (
              <Moon className="mr-2 size-4" />
            ) : displayTheme === "light" ? (
              <Sun className="mr-2 size-4" />
            ) : (
              <Laptop className="mr-2 size-4" />
            )}
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => setTheme("light")}>
              <Sun className="mr-2 size-4" />
              <span>Light</span>
              {displayTheme === "light" && (
                <Check className="ml-auto size-3.5" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("dark")}>
              <Moon className="mr-2 size-4" />
              <span>Dark</span>
              {displayTheme === "dark" && (
                <Check className="ml-auto size-3.5" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("system")}>
              <Laptop className="mr-2 size-4" />
              <span>System</span>
              {displayTheme === "system" && (
                <Check className="ml-auto size-3.5" />
              )}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span aria-hidden className="mr-2 text-base leading-none">
              {language === "de" ? "🇩🇪" : "🇬🇧"}
            </span>
            <span>Language</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44 rounded-lg p-1">
            <DropdownMenuItem onSelect={() => void i18n.changeLanguage("de")}>
              <span aria-hidden className="mr-2 text-lg leading-none">
                🇩🇪
              </span>
              <span>Deutsch</span>
              {language === "de" && <Check className="ml-auto size-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void i18n.changeLanguage("en")}>
              <span aria-hidden className="mr-2 text-lg leading-none">
                🇬🇧
              </span>
              <span>English</span>
              {language === "en" && <Check className="ml-auto size-3.5" />}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator className="my-0 mb-1 bg-sidebar-border" />
        <DropdownMenuItem
          onClick={async () => {
            await getSupabaseAuthClient().auth.signOut({ scope: "local" });
            navigate("/auth/login");
          }}
        >
          <LogOut className="mr-2 size-4" />
          <span>{t("shell.signOut")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
