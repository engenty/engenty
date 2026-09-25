import { HOTKEY_GROUP } from "@engenty/ui-core";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  useCopilotActionsOrNull,
  useCopilotChromeHidden,
  useCopilotHostOrNull,
  useCopilotLayoutOrNull,
} from "../context/copilot-shell-context";
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
  const copilotActions = useCopilotActionsOrNull();
  const copilotLayout = useCopilotLayoutOrNull();
  const copilotHost = useCopilotHostOrNull();
  const chromeHidden = useCopilotChromeHidden();

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

  useHotkey(
    APP_SHELL_HOTKEYS.copilot,
    (event) => {
      event.preventDefault();
      if (!(copilotActions && !chromeHidden)) {
        return;
      }
      if (appMenuOpen) {
        onAppMenuOpenChange(false);
      }
      if (shortcutsOpen) {
        setShortcutsOpen(false);
      }
      if (copilotLayout?.open) {
        return;
      }
      copilotHost?.copilotLayout.mergeLayout({
        collapseToCircle: false,
        open: true,
      });
      copilotActions.setOpen(true);
    },
    {
      conflictBehavior: "allow",
      enabled: Boolean(copilotActions) && !chromeHidden,
      meta: {
        description: "Open the copilot companion",
        group: HOTKEY_GROUP.copilot,
        name: "Open copilot",
      },
    }
  );

  return (
    <ShortcutsDialog onOpenChange={setShortcutsOpen} open={shortcutsOpen} />
  );
}
