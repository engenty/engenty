import { HOTKEY_GROUP } from "@engenty/ui-core";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useShortcutsDialog } from "../context/shortcuts-dialog-context";
import { APP_SHELL_HOTKEYS } from "../lib/app-shell-hotkeys";
import { ShortcutsDialog } from "./shortcuts-dialog";

export function AppShellHotkeys({
  appMenuOpen,
  onAppMenuOpenChange,
}: {
  appMenuOpen: boolean;
  onAppMenuOpenChange: (open: boolean) => void;
}) {
  const { open: shortcutsOpen, setOpen: setShortcutsOpen } =
    useShortcutsDialog();

  useHotkey(
    APP_SHELL_HOTKEYS.appMenu,
    (event) => {
      event.preventDefault();
      if (shortcutsOpen) {
        setShortcutsOpen(false);
      }
      onAppMenuOpenChange(!appMenuOpen);
    },
    {
      conflictBehavior: "allow",
      meta: {
        description: "Open the app command menu",
        group: HOTKEY_GROUP.general,
        name: "Open app menu",
      },
    }
  );

  useHotkey(
    APP_SHELL_HOTKEYS.shortcuts,
    (event) => {
      event.preventDefault();
      if (appMenuOpen) {
        onAppMenuOpenChange(false);
      }
      setShortcutsOpen(!shortcutsOpen);
    },
    {
      conflictBehavior: "allow",
      meta: {
        description: "Open the keyboard shortcuts list",
        group: HOTKEY_GROUP.general,
        name: "Open shortcuts",
      },
    }
  );

  return (
    <ShortcutsDialog onOpenChange={setShortcutsOpen} open={shortcutsOpen} />
  );
}
