# @engenty/import

Core package for CSV import functionality. Provides types, parsing, column mapping, and reusable UI components.

## Exports

### Types
- `ParsedCSV` — Parsed CSV structure (headers, rows, totalRows)
- `ColumnMapping` — Column-to-field mapping
- `ImportFieldDefinition` — Field config for mapping UI

### Functions
- `parseCSV(content: string)` — Parse CSV with auto delimiter detection (, ; \t)
- `detectDelimiter(content: string)` — Detect delimiter from content
- `cleanupCSV(content, options?)` — Deterministic cleanup (line endings, multiline repair, missing headers, rewrite)
- `applyCsvHeaders(result, headers)` — Replace synthesized headers and re-serialize
- `applyDeterministicMapping(headers, fieldDefinitions)` — Auto-map headers to fields (EN/DE variants)
- `normalizeImportPresets`, `serializeImportPresets`, `upsertImportPreset` — Tenant preset storage helpers
- `createTenantImportPresetClient({ apiRequest, presetsKey })` — Preset load/save + AI map + cleanup client

### Server (`@engenty/import/server`)
- `registerImportAiMapRoute(api, { path, requiredCapabilities, tags, extraPromptRules? })` — Shared AI column-mapping HTTP route for modules
- `registerImportCleanupRoute(api, { path, requiredCapabilities, tags, domainHint? })` — Cleanup route (code-first + optional AI headers)
- `runImportCleanup({ csvText, useAiHeaders?, … })` — Shared cleanup runner used by HTTP + agent tool
- `buildCleanupCsvTool(createTool)` — Mastra tool factory (`cleanup_csv`) for agents

### Components
- `CSVImportWizard` — Full import flow: upload → column mapping → preview → import
- `ImportPageShell` — Scrollable page root for import routes inside `CopilotShellMain` (`overflow-hidden` parent). Always wrap the wizard with this shell.

### Page layout

Import routes live under `CopilotShellMain`, which uses `overflow-hidden`. The page root must scroll:

```tsx
import {
  CSVImportWizard,
  ImportPageShell,
  importPageContentClassName,
} from "@engenty/import";

export function MyImportPage() {
  return (
    <ImportPageShell>
      <CSVImportWizard className={importPageContentClassName} {...props} />
    </ImportPageShell>
  );
}
```

Constants: `importPageScrollShellClassName`, `importPageContentClassName`.

## Usage

```tsx
import {
  CSVImportWizard,
  type ImportFieldDefinition,
  type PreviewColumn,
} from "@engenty/import";

const fieldDefinitions: ImportFieldDefinition[] = [
  { key: "name", label: "Name", type: "text", required: true, description: "" },
  { key: "email", label: "Email", type: "email", required: true, description: "" },
];

const previewColumns: PreviewColumn[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
];

<CSVImportWizard
  fieldDefinitions={fieldDefinitions}
  previewColumns={previewColumns}
  labels={labels}
  onBack={() => navigate("/back")}
  onImport={async (rows) => {
    for (const row of rows) {
      await createItem(row);
    }
  }}
  onImportComplete={() => navigate("/list")}
/>
```

## Module-specific config

Each module (contacts, projects, etc.) defines its own:
- `fieldDefinitions` — Import fields and which are required
- `previewColumns` — Columns shown in the preview table
- `labels` — i18n strings
- `onImport` — Row-by-row or batch import handler
