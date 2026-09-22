import type { FormatDisplayOptions } from "@tanstack/react-hotkeys";
import { formatForDisplay } from "@tanstack/react-hotkeys";

/** Splits a formatted chord into one token per keycap. */
export function hotkeyDisplayTokens(
  hotkey: string,
  options?: FormatDisplayOptions
): string[] {
  const formatted = formatForDisplay(hotkey, { useSymbols: true, ...options });
  if (formatted.includes(" ")) {
    return formatted.split(/\s+/).filter(Boolean);
  }
  return formatted
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}
