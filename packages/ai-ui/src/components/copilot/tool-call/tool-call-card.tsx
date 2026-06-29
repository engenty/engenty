// AG-UI tool-call transcript row shell + module `registerToolCallUi` registry.
"use client";

import type { ToolCallCardProps } from "./tool-call-card.types";
import { resolveRoutedToolCallCard } from "./tool-call-ui-defaults";

export type {
  ToolCallCardDensity,
  ToolCallCardProps,
} from "./tool-call-card.types";

export function ToolCallCard(props: ToolCallCardProps) {
  const Resolved = resolveRoutedToolCallCard(props);
  return <Resolved {...props} />;
}

export { registerDefaultToolCallUiCards } from "./tool-call-ui-defaults";
export {
  buildToolCallUiMatchContext,
  clearToolCallUiRegistrationsForTests,
  listToolCallUiRegistrations,
  registerToolCallUi,
  resolveToolCallUiCard,
  subscribeToolCallUiRegistry,
  type ToolCallUiMatchContext,
  type ToolCallUiRegistration,
} from "./tool-call-ui-registry";
