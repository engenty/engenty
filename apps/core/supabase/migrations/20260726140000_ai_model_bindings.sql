-- Role bindings: which model currently does which job.
--
-- Replaces the tail of the resolution chain. Before this, a model id for a
-- purpose could come from an env var or a constant compiled into the package,
-- which meant "which model answers chat?" was answered by reading deploy config
-- and source in two different repos' worth of places. One row per role, one
-- place to look.
--
-- `scope` is 'platform' today. It exists so tenant-scoped bindings can be added
-- without a second table if self-hosted installs are allowed to rebind — the
-- decision is deliberately deferred, but the column costs nothing now and a
-- migration later would cost plenty.
CREATE TABLE IF NOT EXISTS "ai"."model_binding" (
    "scope" "text" DEFAULT 'platform'::"text" NOT NULL,
    "role" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    -- Which gateway serves it. A column, never a prefix on `model_id`: encoding
    -- the route inside the id is what produced ids like
    -- `openrouter/openai/gpt-oss-safeguard-20b`, which matched nothing.
    "gateway" "text" DEFAULT 'vercel'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "model_binding_pkey" PRIMARY KEY ("scope", "role"),
    CONSTRAINT "model_binding_scope_check" CHECK (("scope" = ANY (ARRAY['platform'::"text", 'tenant'::"text"]))),
    CONSTRAINT "model_binding_role_check" CHECK (("role" <> ''::"text")),
    CONSTRAINT "model_binding_model_check" CHECK (("model_id" <> ''::"text"))
);

COMMENT ON TABLE "ai"."model_binding" IS
    'Role -> model bindings. Seeded at boot from authored defaults (and, once, from the legacy AI_*_MODEL env vars) so an upgrade preserves behaviour. Superadmin-editable thereafter.';

ALTER TABLE "ai"."model_binding" ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."model_binding" TO "service_role";
