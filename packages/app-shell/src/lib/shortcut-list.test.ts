import { HOTKEY_GROUP } from "@engenty/ui-core";
import { describe, expect, it } from "vitest";
import {
  groupShortcutItems,
  type ShortcutListItem,
  shortcutItemsFromRegistrations,
} from "./shortcut-list";

describe("shortcutItemsFromRegistrations", () => {
  it("falls back to General and the raw hotkey when meta is missing", () => {
    expect(
      shortcutItemsFromRegistrations([{ hotkey: "Mod+K", id: "1" }])
    ).toEqual([
      {
        description: undefined,
        group: HOTKEY_GROUP.general,
        hotkey: "Mod+K",
        id: "1",
        name: "Mod+K",
      },
    ]);
  });
});

describe("groupShortcutItems", () => {
  it("orders General, Lists, Copilot, then extras, and drops duplicate chords", () => {
    const items: ShortcutListItem[] = [
      {
        group: HOTKEY_GROUP.copilot,
        hotkey: "Mod+.",
        id: "c1",
        name: "Toggle voice dictation",
      },
      {
        group: "Help",
        hotkey: "Mod+?",
        id: "h1",
        name: "Help",
      },
      {
        group: HOTKEY_GROUP.lists,
        hotkey: "Mod+F",
        id: "l1",
        name: "Focus list search",
      },
      {
        group: HOTKEY_GROUP.general,
        hotkey: "Mod+K",
        id: "g1",
        name: "Open app menu",
      },
      {
        group: HOTKEY_GROUP.general,
        hotkey: "Mod+K",
        id: "g2",
        name: "Open app menu",
      },
    ];

    expect(groupShortcutItems(items).map((row) => row.group)).toEqual([
      HOTKEY_GROUP.general,
      HOTKEY_GROUP.lists,
      HOTKEY_GROUP.copilot,
      "Help",
    ]);
    expect(
      groupShortcutItems(items).find(
        (row) => row.group === HOTKEY_GROUP.general
      )?.items
    ).toHaveLength(1);
  });
});
