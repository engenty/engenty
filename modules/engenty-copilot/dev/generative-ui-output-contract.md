---
title: Generative UI output contract
description: Expected output shape for tools that emit a generative-ui widget, and how phase drives UI collapse after submit.
---

# Generative UI output contract

Tools that render an interactive widget in the transcript (e.g. a team-member picker,
a date selector, a form) return a `generative-ui` output envelope. The client reads
`output.phase` to decide whether the widget collapses after the user acts.

---

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

---

## Phase lifecycle

`resolveGenerativeUiToolPhase` (in `tool-call-generative-ui-card.tsx`) maps lane
state + output to a UI phase:

| Lane `state` | `output.phase` | UI phase | What renders |
|-------------|---------------|----------|--------------|
| `running` or `pending` | any | `interactive` | Full `Renderer` (live widget) |
| `completed` | absent or other | `interactive` | Full `Renderer` (expired/stale) |
| `completed` | `"submitted"` | `submitted` | Collapsed `ToolCallCardBase` + summary |
| `completed` | `"readonly"` | `readonly` | Collapsed `ToolCallCardBase` + summary |

The distinction between `submitted` and `readonly` is presentational only — both
collapse the widget. Use `submitted` for a user-initiated action, `readonly` for
a widget that was never interactive (e.g. a display-only card).

---

## Agent implementation pattern

When the user acts on the widget (e.g. clicks a button that triggers `sendMessage`),
the agent receives the follow-up message, completes its work, then updates the tool
result to include `phase` and optionally `summary`:

```typescript
// In your agent tool execute() or output builder:
return {
  __type: "generative-ui",
  spec: originalSpec,           // keep the spec for expand/history
  phase: "submitted",
  summary: "Team member assigned: Maria Musterfrau",
};
```

The client re-renders the card as collapsed once the run completes and `lane.state`
becomes `completed`.

---

## Summary display

`readGenerativeUiSummary` in `tool-call-generative-ui-card.tsx` reads `output.summary`
(string, trimmed). If absent or empty the card shows the fallback text `"Submitted"`.
Keep summaries ≤ 80 characters — they render as a single `<p>` inside the collapsed card.

---

## Key files

| File | Role |
|------|------|
| `modules/engenty-copilot/ui/components/chat/tool-call-generative-ui-card.tsx` | Card component + `resolveGenerativeUiToolPhase` |
| `modules/engenty-copilot/ui/components/chat/tool-call-generative-ui-phase.test.ts` | Phase resolution tests |
| `modules/engenty-copilot/ui/register-tool-call-ui.tsx` | Registers `matchesGenerativeUiOutput` matcher |
| `packages/@engenty/generative-ui` | Element registry + `Renderer` |
