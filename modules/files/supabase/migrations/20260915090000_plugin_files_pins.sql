-- files: personal pins on a file space's entries.
--
-- A pin is navigation, not ownership: the file stays where it is in Data, the
-- pin puts it on THIS person's Work sidebar (Space → Files) for the file
-- space it belongs to. Scoped the same way every files row is —
-- (tenant_id, owner_type, owner_id) — plus the principal who pinned.
SET check_function_bodies = false;

CREATE TABLE module_files.file_pins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    owner_type text NOT NULL,
    owner_id text NOT NULL,
    file_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY module_files.file_pins
    ADD CONSTRAINT file_pins_pkey PRIMARY KEY (id);

ALTER TABLE ONLY module_files.file_pins
    ADD CONSTRAINT file_pins_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

-- Deleting the file drops its pins with it.
ALTER TABLE ONLY module_files.file_pins
    ADD CONSTRAINT file_pins_file_id_fkey FOREIGN KEY (file_id) REFERENCES module_files.file_entries(id) ON DELETE CASCADE;

-- One pin per person per file.
CREATE UNIQUE INDEX uq_module_files_pins_principal_file ON module_files.file_pins USING btree (tenant_id, owner_type, owner_id, principal_id, file_id);

CREATE INDEX idx_module_files_pins_space_principal ON module_files.file_pins USING btree (tenant_id, owner_type, owner_id, principal_id, created_at);

-- Recent files: the newest touched entries of a file space, whatever folder.
CREATE INDEX idx_module_files_entries_recent ON module_files.file_entries USING btree (tenant_id, owner_type, owner_id, status, updated_at DESC);

ALTER TABLE module_files.file_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY file_pins_read_tenant ON module_files.file_pins FOR SELECT USING ((tenant_id = core.current_tenant_id()));

CREATE POLICY srv_tenant_isolation ON module_files.file_pins TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_files.file_pins TO service_role;
GRANT SELECT ON TABLE module_files.file_pins TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_files.file_pins TO engenty_server;

RESET check_function_bodies;
