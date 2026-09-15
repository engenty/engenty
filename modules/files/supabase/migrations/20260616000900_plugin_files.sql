-- files: consolidated baseline.
-- Replaces 3 migration(s) (20260616000900..20260706140000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_files; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_files;

--
-- Name: file_entries; Type: TABLE; Schema: module_files; Owner: -
--

CREATE TABLE module_files.file_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    owner_type text NOT NULL,
    owner_id text NOT NULL,
    folder_id uuid,
    source text DEFAULT 'native'::text NOT NULL,
    storage_key text DEFAULT ''::text NOT NULL,
    source_file_id text,
    filename text NOT NULL,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT file_entries_source_check CHECK ((source = ANY (ARRAY['native'::text, 'gdrive'::text, 'dropbox'::text, 'onedrive'::text, 's3'::text, 'local'::text]))),
    CONSTRAINT file_entries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text])))
);

ALTER TABLE ONLY module_files.file_entries REPLICA IDENTITY FULL;

--
-- Name: file_folders; Type: TABLE; Schema: module_files; Owner: -
--

CREATE TABLE module_files.file_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    owner_type text NOT NULL,
    owner_id text NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    source text DEFAULT 'native'::text NOT NULL,
    source_folder_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    connection_id uuid,
    CONSTRAINT file_folders_source_check CHECK ((source = ANY (ARRAY['native'::text, 'gdrive'::text, 'dropbox'::text, 'onedrive'::text, 's3'::text, 'local'::text])))
);

ALTER TABLE ONLY module_files.file_folders REPLICA IDENTITY FULL;

--
-- Name: file_entries file_entries_pkey; Type: CONSTRAINT; Schema: module_files; Owner: -
--

ALTER TABLE ONLY module_files.file_entries
    ADD CONSTRAINT file_entries_pkey PRIMARY KEY (id);

--
-- Name: file_folders file_folders_pkey; Type: CONSTRAINT; Schema: module_files; Owner: -
--

ALTER TABLE ONLY module_files.file_folders
    ADD CONSTRAINT file_folders_pkey PRIMARY KEY (id);

--
-- Name: idx_module_files_entries_space; Type: INDEX; Schema: module_files; Owner: -
--

CREATE INDEX idx_module_files_entries_space ON module_files.file_entries USING btree (tenant_id, owner_type, owner_id, folder_id);

--
-- Name: idx_module_files_entries_status; Type: INDEX; Schema: module_files; Owner: -
--

CREATE INDEX idx_module_files_entries_status ON module_files.file_entries USING btree (tenant_id, owner_type, owner_id, status);

--
-- Name: idx_module_files_entries_storage_key; Type: INDEX; Schema: module_files; Owner: -
--

CREATE INDEX idx_module_files_entries_storage_key ON module_files.file_entries USING btree (storage_key);

--
-- Name: idx_module_files_folders_connection; Type: INDEX; Schema: module_files; Owner: -
--

CREATE INDEX idx_module_files_folders_connection ON module_files.file_folders USING btree (connection_id) WHERE (connection_id IS NOT NULL);

--
-- Name: idx_module_files_folders_space; Type: INDEX; Schema: module_files; Owner: -
--

CREATE INDEX idx_module_files_folders_space ON module_files.file_folders USING btree (tenant_id, owner_type, owner_id, parent_id);

--
-- Name: uq_module_files_folders_child_name; Type: INDEX; Schema: module_files; Owner: -
--

CREATE UNIQUE INDEX uq_module_files_folders_child_name ON module_files.file_folders USING btree (tenant_id, owner_type, owner_id, parent_id, lower(name)) WHERE (parent_id IS NOT NULL);

--
-- Name: uq_module_files_folders_root_name; Type: INDEX; Schema: module_files; Owner: -
--

CREATE UNIQUE INDEX uq_module_files_folders_root_name ON module_files.file_folders USING btree (tenant_id, owner_type, owner_id, lower(name)) WHERE (parent_id IS NULL);

--
-- Name: file_entries file_entries_folder_id_fkey; Type: FK CONSTRAINT; Schema: module_files; Owner: -
--

ALTER TABLE ONLY module_files.file_entries
    ADD CONSTRAINT file_entries_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES module_files.file_folders(id) ON DELETE CASCADE;

--
-- Name: file_entries file_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_files; Owner: -
--

ALTER TABLE ONLY module_files.file_entries
    ADD CONSTRAINT file_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: file_folders file_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: module_files; Owner: -
--

ALTER TABLE ONLY module_files.file_folders
    ADD CONSTRAINT file_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES module_files.file_folders(id) ON DELETE CASCADE;

--
-- Name: file_folders file_folders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_files; Owner: -
--

ALTER TABLE ONLY module_files.file_folders
    ADD CONSTRAINT file_folders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: file_entries; Type: ROW SECURITY; Schema: module_files; Owner: -
--

ALTER TABLE module_files.file_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: file_entries file_entries_read_tenant; Type: POLICY; Schema: module_files; Owner: -
--

CREATE POLICY file_entries_read_tenant ON module_files.file_entries FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: file_folders; Type: ROW SECURITY; Schema: module_files; Owner: -
--

ALTER TABLE module_files.file_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: file_folders file_folders_read_tenant; Type: POLICY; Schema: module_files; Owner: -
--

CREATE POLICY file_folders_read_tenant ON module_files.file_folders FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: file_entries srv_tenant_isolation; Type: POLICY; Schema: module_files; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_files.file_entries TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: file_folders srv_tenant_isolation; Type: POLICY; Schema: module_files; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_files.file_folders TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_files; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_files TO service_role;
GRANT USAGE ON SCHEMA module_files TO authenticated;
GRANT USAGE ON SCHEMA module_files TO engenty_server;

--
-- Name: TABLE file_entries; Type: ACL; Schema: module_files; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_files.file_entries TO service_role;
GRANT SELECT ON TABLE module_files.file_entries TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_files.file_entries TO engenty_server;

--
-- Name: TABLE file_folders; Type: ACL; Schema: module_files; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_files.file_folders TO service_role;
GRANT SELECT ON TABLE module_files.file_folders TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_files.file_folders TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: file_folders; Type: TABLE DATA; Schema: module_files; Owner: postgres
--


--
-- Data for Name: file_entries; Type: TABLE DATA; Schema: module_files; Owner: postgres
--


--
--

RESET check_function_bodies;
