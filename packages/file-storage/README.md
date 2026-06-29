# `@engenty/file-storage`

Provider-agnostic file/object storage helpers: files-sdk-backed Supabase `FileStorageProvider`, `createFileStorageService`, signed upload URLs, MIME guessing, and **tenant-scoped storage key utilities**.

## Documentation

- **[File storage paths](../../docs/dev/file-storage-paths.md)** — canonical key shape `tenants/<tenant-id>/<module-folder>/...`, module folder names, and code entry points.

## Implementation

- Key builders and parsers: `src/internal-storage-path.ts`
- Public exports: `src/index.ts`
