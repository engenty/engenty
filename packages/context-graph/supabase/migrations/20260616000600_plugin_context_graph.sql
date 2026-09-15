-- context_graph: consolidated baseline.
-- Replaces 1 migration(s) (20260616000600..20260616000600),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: context_graph; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA context_graph;

--
-- Name: edges; Type: TABLE; Schema: context_graph; Owner: -
--

CREATE TABLE context_graph.edges (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    subject_id uuid NOT NULL,
    object_id uuid NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT edges_check CHECK ((subject_id <> object_id))
);

--
-- Name: entities; Type: TABLE; Schema: context_graph; Owner: -
--

CREATE TABLE context_graph.entities (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    external_ref jsonb,
    name text,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: edges edges_pkey; Type: CONSTRAINT; Schema: context_graph; Owner: -
--

ALTER TABLE ONLY context_graph.edges
    ADD CONSTRAINT edges_pkey PRIMARY KEY (id);

--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: context_graph; Owner: -
--

ALTER TABLE ONLY context_graph.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);

--
-- Name: edges_object_idx; Type: INDEX; Schema: context_graph; Owner: -
--

CREATE INDEX edges_object_idx ON context_graph.edges USING btree (tenant_id, object_id, type);

--
-- Name: edges_subject_idx; Type: INDEX; Schema: context_graph; Owner: -
--

CREATE INDEX edges_subject_idx ON context_graph.edges USING btree (tenant_id, subject_id, type);

--
-- Name: edges_triple_uq; Type: INDEX; Schema: context_graph; Owner: -
--

CREATE UNIQUE INDEX edges_triple_uq ON context_graph.edges USING btree (tenant_id, type, subject_id, object_id);

--
-- Name: entities_external_ref_uq; Type: INDEX; Schema: context_graph; Owner: -
--

CREATE UNIQUE INDEX entities_external_ref_uq ON context_graph.entities USING btree (tenant_id, ((external_ref ->> 'module'::text)), ((external_ref ->> 'entity'::text)), ((external_ref ->> 'id'::text))) WHERE (external_ref IS NOT NULL);

--
-- Name: entities_tenant_type_idx; Type: INDEX; Schema: context_graph; Owner: -
--

CREATE INDEX entities_tenant_type_idx ON context_graph.entities USING btree (tenant_id, type);

--
-- Name: edges edges_object_id_fkey; Type: FK CONSTRAINT; Schema: context_graph; Owner: -
--

ALTER TABLE ONLY context_graph.edges
    ADD CONSTRAINT edges_object_id_fkey FOREIGN KEY (object_id) REFERENCES context_graph.entities(id) ON DELETE CASCADE;

--
-- Name: edges edges_subject_id_fkey; Type: FK CONSTRAINT; Schema: context_graph; Owner: -
--

ALTER TABLE ONLY context_graph.edges
    ADD CONSTRAINT edges_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES context_graph.entities(id) ON DELETE CASCADE;

--
-- Name: edges edges_tenant_id_fkey; Type: FK CONSTRAINT; Schema: context_graph; Owner: -
--

ALTER TABLE ONLY context_graph.edges
    ADD CONSTRAINT edges_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: entities entities_tenant_id_fkey; Type: FK CONSTRAINT; Schema: context_graph; Owner: -
--

ALTER TABLE ONLY context_graph.entities
    ADD CONSTRAINT entities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: edges; Type: ROW SECURITY; Schema: context_graph; Owner: -
--

ALTER TABLE context_graph.edges ENABLE ROW LEVEL SECURITY;

--
-- Name: edges edges_tenant; Type: POLICY; Schema: context_graph; Owner: -
--

CREATE POLICY edges_tenant ON context_graph.edges USING ((tenant_id = core.current_tenant_id())) WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: entities; Type: ROW SECURITY; Schema: context_graph; Owner: -
--

ALTER TABLE context_graph.entities ENABLE ROW LEVEL SECURITY;

--
-- Name: entities entities_tenant; Type: POLICY; Schema: context_graph; Owner: -
--

CREATE POLICY entities_tenant ON context_graph.entities USING ((tenant_id = core.current_tenant_id())) WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: edges srv_tenant_isolation; Type: POLICY; Schema: context_graph; Owner: -
--

CREATE POLICY srv_tenant_isolation ON context_graph.edges TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: entities srv_tenant_isolation; Type: POLICY; Schema: context_graph; Owner: -
--

CREATE POLICY srv_tenant_isolation ON context_graph.entities TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA context_graph; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA context_graph TO anon;
GRANT USAGE ON SCHEMA context_graph TO authenticated;
GRANT USAGE ON SCHEMA context_graph TO service_role;
GRANT USAGE ON SCHEMA context_graph TO engenty_server;

--
-- Name: TABLE edges; Type: ACL; Schema: context_graph; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE context_graph.edges TO service_role;
GRANT SELECT ON TABLE context_graph.edges TO anon;
GRANT SELECT ON TABLE context_graph.edges TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE context_graph.edges TO engenty_server;

--
-- Name: TABLE entities; Type: ACL; Schema: context_graph; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE context_graph.entities TO service_role;
GRANT SELECT ON TABLE context_graph.entities TO anon;
GRANT SELECT ON TABLE context_graph.entities TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE context_graph.entities TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: entities; Type: TABLE DATA; Schema: context_graph; Owner: postgres
--


--
-- Data for Name: edges; Type: TABLE DATA; Schema: context_graph; Owner: postgres
--


--
--

RESET check_function_bodies;
