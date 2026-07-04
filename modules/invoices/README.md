# Invoices Module

Invoice CRUD with SQLite index (sql.js) and file storage by business year. UUID7 for IDs, human-readable filenames (`{number}.json`, `{number}.pdf`).

PDF export is template-driven: the default invoice XML template and styling live in `src/pdf/`, and the module passes template + data + styling to `@engenty/pdf-service`.

## Public API (for reuse)

Consumers can import:

- **`@engenty/invoices`** – Plugin entry, API registration, CLI
- **`@engenty/invoices/ui`** – Pages, components, registrar for engenty UI
- **`@engenty/invoices/schema`** – Types (`Invoice`, `InvoiceInput`, `InvoiceRecipientSnapshot`) and Zod schemas (`invoiceSchema`, `invoiceInputSchema`)

The schema export provides shared types and validation without depending on the full module runtime.
