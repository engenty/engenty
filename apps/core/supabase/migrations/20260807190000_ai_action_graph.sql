-- Graph Actions (PLAN-workflow-designer.md Phase 1b): an Action can be a
-- multi-step declarative graph instead of a single agent + prompt.
--
-- Two tables, one rule: **definitions are versioned and versions are
-- immutable**. Every edit mints v+1; a run pins the version it started on by
-- copying nothing — it stores the version id and reads that row, which never
-- changes underneath it. This is what makes long-lived runs (sleepUntil "chase
-- in 3 days") safe: the graph a suspended run wakes into is byte-identical to
-- the graph a human approved when it started.
--
-- The graph JSON itself is Mastra's `StoredWorkflowGraph` (core >=1.56):
-- { id, description?, metadata?, inputSchema, outputSchema, graph }. We store
-- it rather than Mastra's own `workflowDefinitions` storage domain because
-- tenancy, versioning and governance are ours — see the plan's §2.6.

-- The definition: stable identity, catalog metadata, pointer to the live version.
CREATE TABLE IF NOT EXISTS "ai"."action_graph" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL PRIMARY KEY,
    "tenant_id" "uuid" NOT NULL REFERENCES "core"."tenants"("id") ON DELETE CASCADE,
    -- Owning module when the action belongs to one (catalog grouping + the
    -- module's icon on the canvas). NULL = tenant-authored, module-agnostic.
    "module_id" "text",
    "name" "text" NOT NULL,
    "description" "text",
    -- Subject binding, same polymorphic shape as ai.action_request: an action
    -- with a context_type shows up as an ActionButton on that entity.
    "context_type" "text",
    -- The version dispatch runs. NULL until a version is approved — a graph
    -- with no current version exists but cannot be triggered.
    "current_version" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by_user_id" "uuid" REFERENCES "core"."users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "action_graph_status_check" CHECK (
      "status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'disabled'::"text"])
    ),
    -- An active graph must point at a version; a draft need not.
    CONSTRAINT "action_graph_active_needs_version" CHECK (
      "status" <> 'active'::"text" OR "current_version" IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "action_graph_tenant_name_idx"
  ON "ai"."action_graph" ("tenant_id", "name");

-- The immutable version. INSERT-only by policy (no UPDATE grant below) — the
-- one mutable thing about a version is its approval stamp, which is applied by
-- the service role on the approve path.
CREATE TABLE IF NOT EXISTS "ai"."action_graph_version" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL PRIMARY KEY,
    "action_graph_id" "uuid" NOT NULL REFERENCES "ai"."action_graph"("id") ON DELETE CASCADE,
    "tenant_id" "uuid" NOT NULL REFERENCES "core"."tenants"("id") ON DELETE CASCADE,
    "version" integer NOT NULL,
    -- Mastra StoredWorkflowGraph. Validated at save (structure + references +
    -- schema flow + capability gate) before it ever lands here.
    "graph" "jsonb" NOT NULL,
    -- Denormalized from graph.inputSchema / graph.outputSchema so the catalog
    -- and the ActionButton can render an input form without parsing the graph.
    "input_schema" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_schema" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    -- Action-level tool allow list; every run_specialist node intersects with it.
    "allowed_tools" "text"[],
    -- Who wrote this graph: a human in the designer, or the copilot proposing.
    "authored_by" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_by_user_id" "uuid" REFERENCES "core"."users"("id") ON DELETE SET NULL,
    -- Approval stamp. A version is dispatchable only once approved.
    "approved_by_user_id" "uuid" REFERENCES "core"."users"("id") ON DELETE SET NULL,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "action_graph_version_authored_by_check" CHECK (
      "authored_by" = ANY (ARRAY['user'::"text", 'copilot'::"text", 'system'::"text"])
    ),
    CONSTRAINT "action_graph_version_unique" UNIQUE ("action_graph_id", "version")
);

CREATE INDEX IF NOT EXISTS "action_graph_version_tenant_graph_idx"
  ON "ai"."action_graph_version" ("tenant_id", "action_graph_id", "version" DESC);

-- Runs pin the version they started on. Nullable: single-agent actions and
-- every other run kind leave it NULL.
ALTER TABLE "ai"."action_request"
  ADD COLUMN IF NOT EXISTS "action_graph_version_id" "uuid"
    REFERENCES "ai"."action_graph_version"("id") ON DELETE RESTRICT;

-- ON DELETE RESTRICT above is the referential guard the plan calls for: a
-- version with runs (including suspended/sleeping ones) cannot be deleted out
-- from under them. Deleting a graph cascades to versions, so the guard makes
-- that fail loudly while runs exist rather than orphaning them.

CREATE INDEX IF NOT EXISTS "action_request_graph_version_idx"
  ON "ai"."action_request" ("action_graph_version_id")
  WHERE "action_graph_version_id" IS NOT NULL;

-- `sleeping`: a durable wait (sleep / sleepUntil) is neither running nor
-- awaiting a human. Without it a run parked until Thursday shows up in the
-- inbox looking stuck — the distinction the monitor canvas renders as a moon.
ALTER TYPE "ai"."agent_run_status" ADD VALUE IF NOT EXISTS 'sleeping';

-- When a sleeping run is due. Set by the wait node, cleared on wake; drives the
-- "wakes Thu 09:00" label and lets a boot sweep find runs whose timer elapsed
-- while the process was down.
ALTER TABLE "ai"."action_request"
  ADD COLUMN IF NOT EXISTS "wake_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "action_request_wake_at_idx"
  ON "ai"."action_request" ("wake_at")
  WHERE "wake_at" IS NOT NULL;

-- Mirror the run lifecycle on the audit row (matches the enum addition above).
ALTER TABLE "ai"."action_request"
  DROP CONSTRAINT "action_request_status_check";

ALTER TABLE "ai"."action_request"
  ADD CONSTRAINT "action_request_status_check" CHECK (
    "status" = ANY (ARRAY[
      'requested'::"text",
      'coalesced'::"text",
      'skipped'::"text",
      'claimed'::"text",
      'converted_to_run'::"text",
      'cancelled'::"text",
      'dispatched'::"text",
      'completed'::"text",
      'failed'::"text",
      'requires_action'::"text",
      'paused'::"text",
      'sleeping'::"text"
    ])
  );

ALTER TABLE "ai"."action_graph" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."action_graph_version" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_graph_select" ON "ai"."action_graph" FOR SELECT USING (("tenant_id" = "core"."current_tenant_id"()));
CREATE POLICY "action_graph_insert" ON "ai"."action_graph" FOR INSERT WITH CHECK (("tenant_id" = "core"."current_tenant_id"()));
CREATE POLICY "action_graph_update" ON "ai"."action_graph" FOR UPDATE USING (("tenant_id" = "core"."current_tenant_id"()));
CREATE POLICY "action_graph_delete" ON "ai"."action_graph" FOR DELETE USING (("tenant_id" = "core"."current_tenant_id"()));

-- Versions are readable and creatable by the tenant, but never updated or
-- deleted through the tenant role: immutability is enforced by the absence of
-- the grant, not by convention. The approve path runs as service_role.
CREATE POLICY "action_graph_version_select" ON "ai"."action_graph_version" FOR SELECT USING (("tenant_id" = "core"."current_tenant_id"()));
CREATE POLICY "action_graph_version_insert" ON "ai"."action_graph_version" FOR INSERT WITH CHECK (("tenant_id" = "core"."current_tenant_id"()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ai"."action_graph" TO "service_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ai"."action_graph" TO "authenticated";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ai"."action_graph_version" TO "service_role";
GRANT SELECT, INSERT ON TABLE "ai"."action_graph_version" TO "authenticated";

COMMENT ON TABLE "ai"."action_graph" IS 'Graph Actions: multi-step declarative action definitions (stable identity + pointer to the live version).';
COMMENT ON TABLE "ai"."action_graph_version" IS 'Immutable versions of a graph action. Runs pin a version so a long-lived run never sees an edited graph.';
COMMENT ON COLUMN "ai"."action_graph_version"."graph" IS 'Mastra StoredWorkflowGraph JSON (core >=1.56): { id, inputSchema, outputSchema, graph }.';
COMMENT ON COLUMN "ai"."action_request"."action_graph_version_id" IS 'Pinned graph version for this run. NULL for single-agent actions.';
COMMENT ON COLUMN "ai"."action_request"."wake_at" IS 'When a sleeping run is due to resume (sleep / sleepUntil nodes).';
