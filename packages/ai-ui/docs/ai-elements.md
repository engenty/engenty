---
title: AI Elements
description: Message, prompt input, and shimmer components adapted from AI SDK Elements.
---

# AI Elements

`ai-elements/` adapts [AI SDK Elements](https://elements.ai-sdk.dev/docs) for Engenty: composable chat message layout, prompt input shell, and shimmer loading text.

**Owned by `@engenty/ai-ui`** — import from this package, not `@engenty/ui-core`.

## Components

| Component | Role |
|-----------|------|
| `Message`, `MessageContent`, `MessageResponse`, `MessageBranch`, … | Assistant/user message layout and streaming markdown |
| `PromptInput`, `PromptInputTextarea`, `PromptInputSubmit`, `PromptInputProvider`, … | Controlled prompt composer primitives |
| `ChainOfThought`, `ChainOfThoughtHeader`, `ChainOfThoughtContent`, `ChainOfThoughtStep`, `ChainOfThoughtSearchResults`/`…Result`, `ChainOfThoughtImage` | Collapsible step-by-step process panel — header label + auto-open/close, per-step status icon, search-result chips, and an image+caption block. Backs the copilot tool-call timeline (see [Copilot UI → Tool-call timeline](./copilot/#tool-call-timeline-chainofthought)) |
| `Shimmer` | Text shimmer while content loads |

```tsx
import {
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputTextarea,
  Shimmer,
} from "@engenty/ai-ui";
```

## Adding or updating components

1. Run the Elements or shadcn CLI when adding registry components — adapt imports to **relative** paths into `@engenty/ui-core` primitives (`Button`, `Card`, …) from inside `packages/ai-ui/src/components/ai-elements/`.

   ```bash
   cd packages/ui-core
   pnpm dlx shadcn@latest add @ai-elements/message
   ```

2. Move or adapt the generated file into `packages/ai-ui/src/components/ai-elements/`. Map `@/components/ui/*` imports to `@engenty/ui-core` or relative `../../` paths as used elsewhere in ai-ui.

3. Export new symbols from `packages/ai-ui/src/components/presentation.ts` and `packages/ai-ui/src/index.ts`.

4. Run `pnpm --filter @engenty/ai-ui build`.

Manual installs: fetch the [registry JSON](https://ai-sdk.dev/elements/api/registry/message.json) and map registry imports to ui-core primitives.

## Copilot vs AI Elements

- **Copilot product surfaces** (drawer, full-page chat, tool rows) compose `copilot/` components and may use AI Elements inside transcript message rendering.
- **Module embeds and playgrounds** can use AI Elements directly when a full copilot shell is not required.

Copilot runtime and AG-UI message authority are documented under [AI Agents](../../ai-agents/README).

## Cursor rule

Detailed install steps and usage notes: `.cursor/rules/ai-elements.mdc`

## Source

`packages/ai-ui/src/components/ai-elements/`
