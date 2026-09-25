/** @vitest-environment happy-dom */
import { HotkeyManager } from "@tanstack/react-hotkeys";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShellHotkeys } from "../components/app-shell-hotkeys";
import { CopilotPathProvider } from "../context/copilot-path-context";
import { ShortcutsDialogProvider } from "../context/shortcuts-dialog-context";
import { APP_SHELL_HOTKEYS } from "./app-shell-hotkeys";

describe("AppShellHotkeys", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
  });

  afterEach(() => {
    cleanup();
    HotkeyManager.resetInstance();
  });

  it("registers app menu, shortcuts, and copilot chords", () => {
    render(
      <CopilotPathProvider chromeHidden={false} pathname="/">
        <ShortcutsDialogProvider>
          <AppShellHotkeys appMenuOpen={false} onAppMenuOpenChange={vi.fn()} />
        </ShortcutsDialogProvider>
      </CopilotPathProvider>
    );

    const byHotkey = new Map(
      [...HotkeyManager.getInstance().registrations.state.values()].map(
        (entry) => [entry.hotkey, entry]
      )
    );

    expect(byHotkey.get(APP_SHELL_HOTKEYS.appMenu)?.options.meta).toMatchObject(
      {
        group: "General",
        name: "Open app menu",
      }
    );
    expect(
      byHotkey.get(APP_SHELL_HOTKEYS.shortcuts)?.options.meta
    ).toMatchObject({
      group: "General",
      name: "Open shortcuts",
    });
    expect(byHotkey.get(APP_SHELL_HOTKEYS.copilot)?.options.meta).toMatchObject(
      {
        group: "Copilot",
        name: "Open copilot",
      }
    );
  });
});
