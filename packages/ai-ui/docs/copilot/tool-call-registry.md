---
title: Tool-call registry
description: registerToolCallUi for module-specific copilot transcript tool rows.
---

# Tool-call registry

Copilot transcripts render tool invocations as compact log-line rows. Default styling comes from `ToolCallCard` in `@engenty/ai-ui`; modules can register custom cards for specific tools or operation ids.

## API

```tsx
import { registerToolCallUi, type ToolCallUiRegistration } from "@engenty/ai-ui";
// Module embeds: prefer "@engenty/ai-ui/embed"

const dispose = registerToolCallUi({
  id: "contacts_enhance",
  priority: 10,
  match: ({ resolvedToolName, toolName }) =>
    (resolvedToolName ?? toolName) === "contacts_enhance",
  Card: ContactsEnhanceToolCallCard,
});
```

| Field | Role |
|-------|------|
| `id` | Stable registration key |
| `match` | Predicate on `toolName`, `resolvedToolName`, `displayLabel`, `input`, `output`, `state` |
| `priority` | Higher wins when multiple registrations match |
| `Card` | React component receiving `ToolCallCardProps` |

`registerToolCallUi` returns a dispose function — call it on plugin teardown if the UI hot-reloads.

## Resolution

`resolveToolCallUiCard` walks registrations sorted by priority. `CopilotTranscript` uses the resolved card when rendering dynamic tool parts.

Display labels for common operation ids are normalized in `@engenty/ai-ui` (`resolve-transcript-tool-display.ts`). Custom cards still receive `displayLabel` when the adapter supplies it.

## Registration site

Register from the module UI plugin entry (same pattern as contacts and engenty-copilot):

```tsx
// modules/my-module/ui/plugin.ts
import { registerMyModuleToolCallUi } from "./register-tool-call-ui";

export default function registerMyModuleUi(engenty: EngentyPluginContext) {
  const disposeToolCallUi = registerMyModuleToolCallUi();
  engenty.lifecycle.onDispose(disposeToolCallUi);
  // …routes, i18n, menu
}
```

Match on `resolvedToolName` for catalog and frontend tools; fall back to wire `toolName` for native Mastra tool ids.

## Built-in cards

`registerDefaultToolCallUiCards` registers stock cards for decision artifacts and common shapes. Product code typically adds module-specific registrations on top — it does not replace the default registry.

## Source

- Registry: `packages/ai-ui/src/components/copilot/tool-call/tool-call-ui-registry.ts`
- Card shell: `packages/ai-ui/src/components/copilot/tool-call/tool-call-card.tsx`
- Example module wiring: `modules/contacts/ui/register-tool-call-ui.tsx`
