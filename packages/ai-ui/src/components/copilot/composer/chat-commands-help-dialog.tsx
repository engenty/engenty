"use client";

import { useTranslation } from "@engenty/i18n/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@engenty/ui-core";
import { useMemo } from "react";
import type { ChatSlashCommand } from "./copilot-slash-command.js";

function Keycap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}

/**
 * `/help`: every command this chat offers, grouped the way the `/` menu
 * groups them, with what each one does — the same frame as the shortcuts
 * dialog.
 */
export function ChatCommandsHelpDialog({
  commands,
  onOpenChange,
  open,
}: {
  commands: readonly ChatSlashCommand[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const groups = useMemo(() => {
    const byGroup = new Map<string, ChatSlashCommand[]>();
    for (const command of commands) {
      const group = command.group ?? "Core";
      byGroup.set(group, [...(byGroup.get(group) ?? []), command]);
    }
    return [...byGroup.entries()];
  }, [commands]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-md"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {t("chatCommandsHelp.title")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("chatCommandsHelp.description")}
        </DialogDescription>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-2">
          <CommandInput placeholder={t("chatCommandsHelp.search")} />
          <CommandList className="max-h-[min(60vh,420px)]">
            <CommandEmpty>{t("chatCommandsHelp.empty")}</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup heading={group} key={group}>
                {items.map((item) => (
                  <CommandItem
                    className="flex-col items-start gap-0.5"
                    key={item.command}
                    onSelect={() => onOpenChange(false)}
                    value={`${item.command} ${(item.aliases ?? []).join(" ")} ${item.description ?? ""} ${group}`}
                  >
                    <span className="font-mono text-[13px]">
                      /{item.command}
                      {item.argsHint ? (
                        <span className="ml-1.5 text-muted-foreground">
                          {item.argsHint}
                        </span>
                      ) : null}
                      {item.aliases?.length ? (
                        <span className="ml-1.5 text-muted-foreground">
                          · {item.aliases.map((alias) => `/${alias}`).join(" ")}
                        </span>
                      ) : null}
                    </span>
                    {item.description ? (
                      <span className="text-muted-foreground text-xs">
                        {item.description}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <Keycap>/</Keycap>
              {t("chatCommandsHelp.hintSlash")}
            </span>
            <span className="flex items-center gap-1.5">
              <Keycap>@</Keycap>
              {t("chatCommandsHelp.hintMention")}
            </span>
            <span className="flex items-center gap-1.5">
              <Keycap>Esc</Keycap>
              {t("chatCommandsHelp.close")}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
