# Generative UI output contract

Tools that render an interactive widget in the transcript (picker, form, etc.)
return a `generative-ui` output envelope. The client reads `output.phase` to
decide whether the widget collapses after the user acts.

Related copilot tools `show_widget` / `show_ui` are separate catalog tools; this
doc is only the **`__type: "generative-ui"`** envelope consumed by
`ToolCallGenerativeUiCard`.

## Output envelope

```jsonc
{
  "__type": "generative-ui",
  "spec": {
    "root": "<element-id>",
    "elements": { /* generative-ui element tree */ }
  },
  // Written by the agent after the user acts:
  "phase": "submitted" | "readonly",
  "summary": "Optional one-line confirmation shown in the collapsed card."
}
```

| Field | Type | Required | When set |
|-------|------|----------|----------|
| `__type` | `"generative-ui"` | Yes | Always — identifies the envelope |
| `spec` | `{ root, elements }` | Yes | Always — defines the widget tree |
| `phase` | `"submitted"` \| `"readonly"` | No | Written by agent after user action |
| `summary` | `string` | No | Human-readable confirmation for the collapsed card |

**Legacy:** `submitted: true` (boolean) is also accepted as a `phase: "submitted"` alias.
Prefer `phase` for new tools.

## Phase lifecycle

`resolveGenerativeUiToolPhase` (in `tool-call-generative-ui-card.tsx`) maps lane
state + output to a UI phase:

| Lane `state` | `output.phase` | UI phase | What renders |
|-------------|---------------|----------|--------------|
| `running` or `pending` | any | `interactive` | Full `Renderer` (live widget) |
| `completed` | absent or other | `interactive` | Full `Renderer` (expired/stale) |
| `completed` | `"submitted"` | `submitted` | Collapsed `ToolCallCardBase` + summary |
| `completed` | `"readonly"` | `readonly` | Collapsed `ToolCallCardBase` + summary |

`submitted` vs `readonly` is presentational only — both collapse. Use `submitted`
for a user-initiated action, `readonly` for a display-only card.

## Agent implementation pattern

When the user acts on the widget (e.g. `sendMessage` from the renderer), the
agent receives the follow-up, finishes work, then updates the tool result with
`phase` and optional `summary`:

```typescript
return {
  __type: "generative-ui",
  spec: originalSpec, // keep for expand/history
  phase: "submitted",
  summary: "Team member assigned: Maria Musterfrau",
};
```

The card collapses once the lane tool part is `completed` and `phase` is set.

## Summary display

`readGenerativeUiSummary` reads `output.summary` (trimmed string). Empty →
fallback `"Submitted"`. Keep summaries ≤ 80 characters.

## Key files

| File | Role |
|------|------|
| `modules/engenty-copilot/ui/components/chat/tool-call-generative-ui-card.tsx` | Card + `resolveGenerativeUiToolPhase` |
| `modules/engenty-copilot/ui/components/chat/tool-call-generative-ui-phase.test.ts` | Phase resolution tests |
| `modules/engenty-copilot/ui/register-tool-call-ui.tsx` | Registers `matchesGenerativeUiOutput` matcher |
| `packages/generative-ui` (`@engenty/generative-ui`) | Element registry + `Renderer` |
