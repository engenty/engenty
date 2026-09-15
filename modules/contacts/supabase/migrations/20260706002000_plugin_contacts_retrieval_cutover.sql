-- Retrieval registration lives in search.source_visibility, which this module
-- does not own; the service also upserts it at boot.
insert into search.source_visibility (source_type, module, visibility)
values ('contacts.contact', 'contacts', 'tenant')
on conflict (source_type) do update set
  module = excluded.module,
  visibility = excluded.visibility,
  updated_at = now();
