import {
  Button,
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
import {
  getHotkeyManager,
  toHotkeyRegistrationView,
} from "@tanstack/react-hotkeys";
import { useState } from "react";
import { hotkeyDisplayTokens } from "../lib/hotkey-display";
import {
  groupShortcutItems,
  shortcutItemsFromRegistrations,
} from "../lib/shortcut-list";

function HotkeyKeycaps({ hotkey }: { hotkey: string }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5">
      {hotkeyDisplayTokens(hotkey).map((token) => (
        <kbd
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 font-sans text-[11px] text-muted-foreground"
          key={token}
        >
          {token}
        </kbd>
      ))}
    </span>
  );
}

function FooterHint({ label, tokens }: { label: string; tokens: string[] }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-0.5">
        {tokens.map((token) => (
          <kbd
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 font-sans text-[11px]"
            key={token}
          >
            {token}
          </kbd>
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function ShortcutsDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-md"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Keyboard shortcuts</DialogTitle>
        <DialogDescription className="sr-only">
          Search and browse registered keyboard shortcuts.
        </DialogDescription>
        <ShortcutsCommand onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The list, mounted only while the dialog is open, from the registrations as
 * they are when it opens — read once, not subscribed. `useHotkey`
 * (@tanstack/react-hotkeys 0.10) writes to the registration store during
 * render, so a subscriber re-renders in the middle of every component that
 * registers a hotkey ("Cannot update a component while rendering a different
 * component"). Nothing registers a shortcut while this dialog has the focus.
 */
function ShortcutsCommand({ onClose }: { onClose: () => void }) {
  const [groups] = useState(() =>
    groupShortcutItems(
      shortcutItemsFromRegistrations(
        Array.from(getHotkeyManager().registrations.state.values()).map(
          toHotkeyRegistrationView
        )
      )
    )
  );

  return (
    <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-2">
      <CommandInput placeholder="Search shortcuts…" />
      <CommandList className="max-h-[min(60vh,420px)]">
        <CommandEmpty>No shortcuts found.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup heading={group.group} key={group.group}>
            {group.items.map((item) => (
              <CommandItem
                className="justify-between"
                key={item.id}
                onSelect={onClose}
                value={`${item.name} ${item.group} ${item.hotkey}`}
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <HotkeyKeycaps hotkey={item.hotkey} />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center gap-4 border-t px-3 py-2 text-muted-foreground text-xs">
        <FooterHint label="Select" tokens={["↑", "↓"]} />

        <Button
          className="h-auto gap-1.5 px-0 text-muted-foreground text-xs hover:bg-transparent hover:text-foreground"
          onClick={onClose}
          variant="ghost"
        >
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 font-sans text-[11px]">
            Esc
          </kbd>
          Back
        </Button>
      </div>
    </Command>
  );
}
