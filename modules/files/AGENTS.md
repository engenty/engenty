# Files module — agent notes

## Copy (German)

- In German UI copy for Files, use **Speicher** (not **Tresor**).

## Storage paths

- Internal file storage object keys for new uploads use `tenants/<tenant-id>/<module-folder>/...`. Build paths with `fileStorageTenantObjectKey` from `@engenty/file-storage`.

## Office previews (Gotenberg)

- **Gotenberg** converts DOCX/XLSX/PPT to PDF via `GOTENBERG_URL`; native PDFs are rasterized in-process; sidecar previews are stored as `<object-key>.preview.pdf`.
