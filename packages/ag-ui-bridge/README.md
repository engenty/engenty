# @engenty/ag-ui-bridge

Official AG-UI wire contracts and Engenty extension helpers — React-free.

**Documentation:** [packages/ag-ui-bridge/docs/README.md](./docs/README.md) (published under `/docs/dev/packages/ag-ui-bridge/` on the docs site).

Quick start:

```ts
import {
  RunAgentInputSchema,
  createFrontendToolDefinition,
  encodeAgUiSseEvent,
  isAgentUiStateSnapshotV1,
} from "@engenty/ag-ui-bridge";
```

```bash
pnpm --filter @engenty/ag-ui-bridge test
pnpm --filter @engenty/ag-ui-bridge build
```
