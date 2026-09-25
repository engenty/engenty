import { CommandGroup, CommandItem, CommandSeparator } from "@engenty/ui-core";
import {
  Code2,
  EyeOff,
  Globe,
  Info,
  LogOut,
  Moon,
  Pin,
  Settings,
  Sun,
} from "lucide-react";
import { useMemo } from "react";
import type { AppMenuLabels } from "../lib/app-menu-tabs";
import type { NavigationSection } from "../types/shell";
import type { AppMenuActions } from "./app-topbar";

export function AppMenuAll({
  actions,
  isSidebarHidden,
  labels,
  onAbout,
  onClose,
  onNavigate,
  onToggleSidebarHidden,
  sections,
}: {
  actions?: AppMenuActions;
  isSidebarHidden?: boolean;
  labels: AppMenuLabels;
  onAbout?: () => void;
  onClose: () => void;
  onNavigate: (to: string, external?: boolean) => void;
  onToggleSidebarHidden?: () => void;
  sections: NavigationSection[];
}) {
  const { adminSection, mainSections, settingsChildren } = useMemo(() => {
    const adminIdx = sections.findIndex((section) =>
      section.items.some((item) => item.to === "/settings")
    );
    const admin = adminIdx >= 0 ? sections[adminIdx] : null;
    let children: Array<{ external?: boolean; label: string; to: string }> = [];
    let strippedAdmin = admin;
    if (admin) {
      children = (
        admin.items.find((item) => item.to === "/settings")?.children ?? []
      ).flatMap((child) => {
        if (child.type === "separator" || child.type === "heading") {
          return [];
        }
        const label = child.label?.trim() ?? "";
        if (!(label && child.to)) {
          return [];
        }
        return [
          {
            external: child.external,
            label,
            to: child.to,
          },
        ];
      });
      strippedAdmin = {
        ...admin,
        items: admin.items.map((item) =>
          item.to === "/settings" ? { ...item, children: undefined } : item
        ),
      };
    }
    return {
      adminSection: strippedAdmin,
      mainSections:
        adminIdx >= 0
          ? sections.slice(0, adminIdx).concat(sections.slice(adminIdx + 1))
          : sections,
      settingsChildren: children,
    };
  }, [sections]);

  return (
    <>
      {mainSections.map((section, index) => (
        <CommandGroup
          heading={section.label ?? undefined}
          key={section.label ?? `section-${index}`}
        >
          {section.items.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.to}
                onSelect={() => onNavigate(item.to, item.external)}
              >
                <Icon className="mr-2 size-4 shrink-0" />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      ))}
      {adminSection ? (
        <>
          <CommandSeparator />
          <CommandGroup heading={adminSection.label ?? "Admin"}>
            {adminSection.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.to}
                  onSelect={() => onNavigate(item.to, item.external)}
                >
                  <Icon className="mr-2 size-4 shrink-0" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </>
      ) : null}
      {settingsChildren.length > 0 ? (
        <>
          <CommandSeparator />
          <CommandGroup heading={labels.settings}>
            {settingsChildren.map((child) => (
              <CommandItem
                key={child.to}
                onSelect={() => onNavigate(child.to, child.external)}
              >
                <Settings className="mr-2 size-4 shrink-0 opacity-40" />
                <span>{child.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}
      {onToggleSidebarHidden ? (
        <>
          <CommandSeparator />
          <CommandGroup heading="Dock">
            <CommandItem
              onSelect={() => {
                onToggleSidebarHidden();
                onClose();
              }}
            >
              {isSidebarHidden ? (
                <>
                  <Pin className="mr-2 size-4 shrink-0" />
                  <span>Open Dock</span>
                </>
              ) : (
                <>
                  <EyeOff className="mr-2 size-4 shrink-0" />
                  <span>Autohide Dock</span>
                </>
              )}
            </CommandItem>
          </CommandGroup>
        </>
      ) : null}
      {actions || onAbout ? (
        <>
          <CommandSeparator />
          <CommandGroup heading={labels.actions}>
            {onAbout ? (
              <CommandItem
                onSelect={() => {
                  onClose();
                  onAbout();
                }}
              >
                <Info className="mr-2 size-4 shrink-0" />
                <span>{labels.about}</span>
              </CommandItem>
            ) : null}
            {actions ? (
              <>
                <CommandItem onSelect={() => onNavigate("/settings/profile")}>
                  <Settings className="mr-2 size-4 shrink-0" />
                  <span>Profile settings</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    actions.onToggleTheme();
                    onClose();
                  }}
                >
                  {actions.currentTheme === "dark" ? (
                    <>
                      <Sun className="mr-2 size-4 shrink-0" />
                      <span>Switch to Light theme</span>
                    </>
                  ) : (
                    <>
                      <Moon className="mr-2 size-4 shrink-0" />
                      <span>Switch to Dark theme</span>
                    </>
                  )}
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    actions.onToggleLanguage();
                    onClose();
                  }}
                >
                  <Globe className="mr-2 size-4 shrink-0" />
                  <span>
                    {actions.currentLang === "de"
                      ? "Switch to English"
                      : "Switch to Deutsch"}
                  </span>
                </CommandItem>
                {actions.developerModeAvailable ? (
                  <CommandItem
                    onSelect={() => {
                      actions.onToggleDeveloperMode();
                      onClose();
                    }}
                  >
                    <Code2 className="mr-2 size-4 shrink-0" />
                    <span>
                      {actions.developerModeOn
                        ? "Disable Developer mode"
                        : "Enable Developer mode"}
                    </span>
                  </CommandItem>
                ) : null}
                <CommandItem
                  onSelect={() => {
                    actions.onSignOut();
                    onClose();
                  }}
                >
                  <LogOut className="mr-2 size-4 shrink-0" />
                  <span>Sign out</span>
                </CommandItem>
              </>
            ) : null}
          </CommandGroup>
        </>
      ) : null}
    </>
  );
}
