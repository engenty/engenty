# AG-UI live probes

Manual probes that drive a stock `HttpAgent` from `@ag-ui/client` against a running
engenty AI app — no CopilotKit, no `@ag-ui/mastra`, no engenty imports. That
constraint is the point: if a probe needs something of ours to work, our wire is not
canonical.

## These are NOT tests

They need a running dev server and make real LLM calls, so they are slow,
nondeterministic and cost money. **Nothing in CI runs them.**

The deterministic guard is
`apps/ai/src/ai/conversation/__tests__/agui-wire-conformance.test.ts`, which pipes our
event stream through the same `verifyEvents` state machine a real AG-UI client uses.
That covers stream *validity*. These cover what only a live round-trip can: does an
agent actually suspend, resume, and use the answer.

## When to run them

After upgrading `@mastra/core`, `@mastra/memory` or `@ag-ui/*` — the failures they
catch are invisible to a mock model and to typecheck.

```bash
pnpm dev:portless --domain=<your-domain>     # in this worktree
node packages/ag-ui-bridge/live-probes/stock-client.mjs
node packages/ag-ui-bridge/live-probes/interactive-run.mjs
```

`probe-env.mjs` derives everything machine-specific: the repo root by walking up, the
dev domain, and an agent sign-in.

| script | asks |
| --- | --- |
| `stock-client.mjs` | can a stock AG-UI client drive a run at all — text, tool calls, the `START/CONTENT/END` triple, and a mid-run disconnect |
| `interactive-run.mjs` | does a real turn frame once, park on a gated write, and resume from the snapshot with the tool actually executing |
