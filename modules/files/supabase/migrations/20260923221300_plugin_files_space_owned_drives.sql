-- Connected drives belong to a Space (PLAN-space-owned-connections.md).
--
-- A drive mounts only into the Files of the Space that owns its connection.
-- Fresh start, like the connections it derives from: mount folders point at
-- connections that no longer exist and are dropped. Native folders and files
-- are untouched (a mount's contents are virtual, never stored rows).

DELETE FROM module_files.file_folders WHERE connection_id IS NOT NULL;
