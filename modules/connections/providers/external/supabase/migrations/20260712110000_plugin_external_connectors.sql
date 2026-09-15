-- external_connectors: consolidated baseline.
-- Replaces 2 migration(s) (20260712110000..20260905120000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_external_connectors; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_external_connectors;

--
-- Name: imported_connectors; Type: TABLE; Schema: module_external_connectors; Owner: -
--

CREATE TABLE module_external_connectors.imported_connectors (
    id text NOT NULL,
    domain text NOT NULL,
    name text NOT NULL,
    source_kind text NOT NULL,
    source_url text NOT NULL,
    base_url text,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    auth_config jsonb DEFAULT '{"kind": "none"}'::jsonb NOT NULL,
    registry_snapshot jsonb,
    spec_hash text NOT NULL,
    client_id_enc text,
    client_secret_enc text,
    tool_prefix text NOT NULL,
    status text DEFAULT 'enabled'::text NOT NULL,
    imported_by uuid NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    refreshed_at timestamp with time zone,
    registry_surface_slug text,
    required_headers jsonb DEFAULT '[]'::jsonb NOT NULL,
    mcp_transport text,
    CONSTRAINT imported_connectors_mcp_transport_check CHECK (((mcp_transport IS NULL) OR (mcp_transport = ANY (ARRAY['streamable-http'::text, 'sse'::text])))),
    CONSTRAINT imported_connectors_source_kind_check CHECK ((source_kind = ANY (ARRAY['openapi'::text, 'mcp'::text]))),
    CONSTRAINT imported_connectors_status_check CHECK ((status = ANY (ARRAY['enabled'::text, 'disabled'::text])))
);

--
-- Name: imported_connectors imported_connectors_pkey; Type: CONSTRAINT; Schema: module_external_connectors; Owner: -
--

ALTER TABLE ONLY module_external_connectors.imported_connectors
    ADD CONSTRAINT imported_connectors_pkey PRIMARY KEY (id);

--
-- Name: imported_connectors_domain_surface_key; Type: INDEX; Schema: module_external_connectors; Owner: -
--

CREATE UNIQUE INDEX imported_connectors_domain_surface_key ON module_external_connectors.imported_connectors USING btree (domain, registry_surface_slug) WHERE (registry_surface_slug IS NOT NULL);

--
-- Name: imported_connectors_tool_prefix_key; Type: INDEX; Schema: module_external_connectors; Owner: -
--

CREATE UNIQUE INDEX imported_connectors_tool_prefix_key ON module_external_connectors.imported_connectors USING btree (tool_prefix);

--
-- Name: imported_connectors; Type: ROW SECURITY; Schema: module_external_connectors; Owner: -
--

ALTER TABLE module_external_connectors.imported_connectors ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA module_external_connectors; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_external_connectors TO service_role;
GRANT USAGE ON SCHEMA module_external_connectors TO engenty_server;

--
-- Name: TABLE imported_connectors; Type: ACL; Schema: module_external_connectors; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_external_connectors.imported_connectors TO service_role;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: imported_connectors; Type: TABLE DATA; Schema: module_external_connectors; Owner: postgres
--


--
--

RESET check_function_bodies;
