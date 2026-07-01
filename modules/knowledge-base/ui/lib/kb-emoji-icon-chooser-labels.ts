import type { EmojiIconChooserLabels } from "@engenty/ui-core";

export function kbEmojiIconChooserLabels(
  t: (key: string) => string
): EmojiIconChooserLabels {
  return {
    addIcon: t("hub.add_icon_hint"),
    apply: t("hub.icon_picker_apply"),
    browseAll: t("hub.icon_picker_browse"),
    gridAriaLabel: t("hub.icon_picker_label"),
    inputPlaceholder: t("hub.icon_picker_placeholder"),
    noEmojiFound: t("hub.icon_picker_empty"),
    quickPicks: t("hub.icon_picker_quick"),
    remove: t("hub.remove_icon"),
    selectEmoji: t("hub.icon_picker_select"),
  };
}

export function kbEmojiPickerLocale(language: string): "de" | "en" {
  return language.startsWith("de") ? "de" : "en";
}
