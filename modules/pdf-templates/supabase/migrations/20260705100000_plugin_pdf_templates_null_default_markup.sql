-- NULL markup = "follow the module provider's built-in default template".
-- Previously the settings page snapshotted the provider defaults verbatim on
-- first save, so provider template improvements never reached tenants again.
-- Writes now store NULL when the markup matches the provider default, and
-- render paths resolve NULL against the provider defaults at render time.
alter table module_pdf_templates.template_documents
  alter column document_template drop not null,
  alter column stylesheet_template drop not null;

-- One-time repair: document rows never re-saved since creation are verbatim
-- seed-time snapshots of the provider defaults; reset them so they follow the
-- provider again. Rows saved again later are left untouched — they may carry
-- real customizations we cannot distinguish from stale snapshots in SQL.
update module_pdf_templates.template_documents
set document_template = null,
    stylesheet_template = null
where created_at = updated_at;
