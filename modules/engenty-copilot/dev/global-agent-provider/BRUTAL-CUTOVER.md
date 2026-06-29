# Brutal cutover doctrine

This track is allowed to break old paths temporarily while rebuilding the clean provider concept. Do not preserve legacy behavior to keep the app limping through the migration.

## Non-negotiables

- Move outdated code to repo `.trash/` first, then rebuild.
- No legacy compatibility layers.
- No fallback transports.
- No dual transcript writers.
- No data migrations for old local/browser chat state.
- No patches that make old concepts appear to work.
- No large adapter stack whose only purpose is hiding the old architecture.
- If a behavior is still valuable, recreate it in the new provider model with current names and current ownership.

## Target code quality

The final provider code should be small enough to explain on a QuickStart page.

| Area | Target |
|------|--------|
| Provider root + context | ~100-200 clear lines |
| Lane binding component | ~100-200 clear lines |
| Copilot surface glue | Thin, page-specific wiring only |
| Legacy wrapper code | Deleted or archived |

If an implementation wants to add a 1000-line controller, stop and split the concept. The goal is a clean product API, not a compatibility museum.

## Archive-first order

Use this order for each surface:

1. Move the old implementation to `.trash/<area>-<date>/`.
2. Leave the smallest possible production stub if imports must stay temporarily.
3. Make the stub fail loudly or log a structured “not rebuilt yet” blocker.
4. Rebuild the surface on `EngentyAI` / `EngentyAgent`.
5. Delete the stub once the new surface compiles and tests pass.

Do not keep the archived implementation imported from production code.

## Stub policy

Stubs are allowed only as temporary compile breakers/blockers during the same cutover phase. They should make missing work obvious.

Example:

```ts
throw new Error(
  "Copilot drawer apps/ai legacy host was archived for the EngentyAI cutover. Rebuild with AppActiveCopilotProvider / useAgentHost(\"engenty:copilot\") and binding engenty:copilot."
);
```

If the file is application code where throwing would crash unrelated routes, use a visible disabled state plus structured logging with `createLogger` from `@engenty/telemetry`.

```ts
logger.error("copilot.drawer.not_rebuilt", {
  missing: "ActiveCopilotProvider / engenty:copilot",
});
```

Do not add fallback behavior inside the stub.

## Archive targets

Archive or delete these before rebuilding their replacement:

| Target | Replacement |
|--------|-------------|
| `useCopilotDrawerAppsAiHost` | Drawer reads provider lane |
| `useEngentyAppsAiDrawerSession` | Provider lane controller |
| `useEngentyAppsAiPanelSession` | Provider lane controller |
| Product calls to `useEngentyAgUiAppsAiSession` | `EngentyAgent` binding |
| Pending-send transcript append hot paths | `pendingUserText` outside `messages[]` |
| Legacy custom frontend-tool events | Official AG-UI tool events |
| Artifact-feedback submit paths | `resumeInterrupt` |

## Rebuild standard

Every rebuilt surface should answer these questions in code without comments explaining old history:

- What lane am I binding?
- What canonical `threadId` am I using?
- What `routeContext` and state snapshot am I sending?
- Is this normal copilot chat or an independent action lane?
- Where does the user see pending text before the server snapshot arrives?

If code cannot answer those directly, the concept is not clean enough yet.

## Success gate

The cutover is successful when old concepts are gone from production code, not when they are wrapped.

```bash
rg -n "useCopilotSession|useCopilotDrawerAppsAiHost|useEngentyAppsAiPanelSession|useEngentyAppsAiDrawerSession|hydrationPaused|mergeHydrated|dedupeConsecutive|artifact-feedback|engenty\\.frontend_tool\\.(call|result)" apps modules packages --glob '!**/.trash/**' --glob '!**/*.test.*' --glob '!**/dev/**'
```

Expected result: zero production hits.
