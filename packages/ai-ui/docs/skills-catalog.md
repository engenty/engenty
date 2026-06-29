---
title: Skills Catalog
description: Admin UI and hooks for the file-storage skill catalog — listing, editing, uploading, and registry installation.
---

# Skills Catalog

The skill catalog UI lives at **`/admin/engenty/skills`** and is registered by `@engenty/ai-ui/plugin`. It provides operators full control over the two-tier skill catalog backed by tenant file storage.

## Tiers at a glance

| Tier | Badge | Editable | Source |
|------|-------|----------|--------|
| `managed` | Managed | No | Builtin + module `ai/skills/` (synced from code) |
| `custom` | Custom | Yes | Uploaded or registry-installed by operators |

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/engenty/skills` | `SkillsCatalogPage` | List all skills (both tiers), search, install |
| `/admin/engenty/skills/:name` | `SkillDetailPage` | View/edit skill body and metadata |

## API client (`skills-api.ts`)

Located at `packages/ai-ui/src/lib/runtime/skills-api.ts`. Low-level fetch wrappers against `apps/ai` `/ai/skills` endpoints:

```ts
import {
  getFileStorageSkills,        // GET /ai/skills
  getFileStorageSkill,         // GET /ai/skills/:name
  upsertFileStorageSkill,      // PUT /ai/skills/:name  (custom only)
  deleteFileStorageSkill,      // DELETE /ai/skills/:name
  listSkillRegistryProviders,  // GET /ai/skills/registry/providers
  searchSkillRegistry,         // GET /ai/skills/registry/search
  installSkillFromRegistry,    // POST /ai/skills/registry/install
} from "@engenty/ai-ui";
```

## TanStack Query hooks (`skills-queries.ts`)

Located at `packages/ai-ui/src/lib/runtime/skills-queries.ts`. All mutations invalidate the list and relevant detail cache on success.

```ts
import {
  useSkillCatalogQuery,          // list both tiers; disabled when ai service unconfigured
  useSkillCatalogDetailQuery,    // single skill detail
  useSkillRegistryProvidersQuery,// available registry providers
  useSkillRegistrySearchQuery,   // search a registry (debounced)
  useUpsertSkillMutation,        // create or update custom skill
  useDeleteSkillMutation,        // delete custom skill
  useInstallSkillMutation,       // install from registry into custom tier
} from "@engenty/ai-ui";
```

### Example: list and display skills

```tsx
import { useSkillCatalogQuery } from "@engenty/ai-ui";

function SkillList() {
  const { data, isLoading } = useSkillCatalogQuery();
  if (isLoading) return <Spinner />;
  return (
    <ul>
      {data?.skills.map((skill) => (
        <li key={skill.name}>
          <span>{skill.title ?? skill.name}</span>
          <Badge>{skill.tier}</Badge>
          {skill.editable && <EditButton />}
        </li>
      ))}
    </ul>
  );
}
```

### Example: install from registry

```tsx
import {
  useSkillRegistryProvidersQuery,
  useSkillRegistrySearchQuery,
  useInstallSkillMutation,
} from "@engenty/ai-ui";

function InstallPanel() {
  const { data: providers } = useSkillRegistryProvidersQuery();
  const [provider, setProvider] = useState("skills_sh");
  const [query, setQuery] = useState("");
  const { data: results } = useSkillRegistrySearchQuery(provider, query, query.length > 1);
  const install = useInstallSkillMutation();

  return (
    <>
      {results?.results.map((r) => (
        <button
          key={r.id}
          onClick={() => install.mutate({ provider, ref: { id: r.id } })}
        >
          Install {r.name}
        </button>
      ))}
    </>
  );
}
```

## Data types

```ts
interface FileStorageSkillSummary {
  name: string;
  title?: string;
  description: string;
  tier: "managed" | "custom";
  editable: boolean;
  source: string;      // "builtin" | "module" | "upload" | registry provider id
  tags: string[];
  version?: string;
}

interface FileStorageSkillDetail extends FileStorageSkillSummary {
  body: string;                     // SKILL.md body (below frontmatter)
  frontmatter: SkillFrontmatter;    // parsed YAML block
  files: { path: string }[];        // other files in the skill folder
}
```

## Legacy catalog adapter

`packages/ai-ui/src/lib/admin/catalog-api.ts` adapts the file-storage API responses to the legacy `AiSkillRecord` / `AiSkillCatalogEntry` shapes still used by some shared admin shell components. The adapter is transparent to callers — functions like `getAiSkills` and `getAiSkillDetail` now delegate to the file-storage client internally.

## Related

- [Skills](../../docs/content/dev/ai-agents/skills.md) — skill concept, tiers, SKILL.md format
- [Agent Workspaces](../../docs/content/dev/ai-agents/workspaces.md) — how skills load at run time
- [`@engenty/ai-ui` architecture](./architecture.md)
