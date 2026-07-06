-- Connector mounts: a file_folders row may project a connected external folder
-- (Google Drive, OneDrive, S3, browser-local) into a file space. Extend the
-- source kinds and tie mounts to their connections-module connection.
-- No FK into module_connections on purpose (loose cross-module coupling): a
-- deleted connection leaves the mount pointing at nothing and browsing it
-- surfaces a "source disconnected" error until the user removes the mount.

alter table module_files.file_folders
  drop constraint if exists file_folders_source_check;
alter table module_files.file_folders
  add constraint file_folders_source_check
  check (source in ('native', 'gdrive', 'dropbox', 'onedrive', 's3', 'local'));

alter table module_files.file_folders
  add column if not exists connection_id uuid;

create index if not exists idx_module_files_folders_connection
  on module_files.file_folders (connection_id)
  where connection_id is not null;

alter table module_files.file_entries
  drop constraint if exists file_entries_source_check;
alter table module_files.file_entries
  add constraint file_entries_source_check
  check (source in ('native', 'gdrive', 'dropbox', 'onedrive', 's3', 'local'));
