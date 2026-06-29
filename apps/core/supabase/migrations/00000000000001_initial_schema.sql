-- Consolidated core baseline (pre-launch).

-- >>> from 00000000000001_initial_schema.sql
-- Consolidated initial schema for resettable environments.
-- Includes core, baseline module tables, policies, and storage bootstrap.

create extension if not exists pgcrypto;
-- pg_trgm in public so public.gin_trgm_ops resolves for ai/* trigram indexes.
-- Modules (banking, contacts) also create-if-not-exists; this owns it for the
-- consolidated baseline where core applies before any module.
create extension if not exists pg_trgm with schema public;

-- UUID v7 generator for Postgres 17/Supabase.
-- Adapted from postgres-uuidv7-sql (pure SQL implementation).
create or replace function uuidv7(v_timestamp timestamptz default clock_timestamp())
returns uuid
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send((extract(epoch from v_timestamp) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52,
        1
      ),
      53,
      1
    ),
    'hex'
  )::uuid;
$$ language sql volatile parallel safe;

create schema if not exists core;

create table if not exists core.tenants (
  id uuid primary key default uuidv7(),
  slug text not null unique,
  name text not null,
  tenant_connection_mode text not null default 'shared_instance',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_connection_mode_check
    check (tenant_connection_mode in ('shared_instance', 'dedicated_instance'))
);

create table if not exists core.users (
  id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'member',
  employee_number text,
  position text,
  location text,
  department text,
  phone text,
  initials text,
  private_phone text,
  private_email text,
  private_address text,
  emergency_contact text,
  is_super_admin boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists core.agents (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists core.user_tenant_roles (
  user_id uuid not null references core.users(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

create index if not exists user_tenant_roles_tenant_idx
  on core.user_tenant_roles(tenant_id);
create index if not exists user_tenant_roles_user_idx
  on core.user_tenant_roles(user_id);

create table if not exists core.feature_flags (
  key text not null,
  tenant_id uuid references core.tenants(id) on delete cascade,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (key, tenant_id)
);

create index if not exists feature_flags_tenant_id_idx
  on core.feature_flags(tenant_id);

create table if not exists core.tenant_plugin_overrides (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  plugin_id text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, plugin_id)
);

create index if not exists tenant_plugin_overrides_tenant_idx
  on core.tenant_plugin_overrides(tenant_id);

create table if not exists core.tenant_settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  name text not null,
  type text not null check (type in ('string', 'numeric', 'boolean', 'json')),
  value_string text,
  value_jsonb jsonb,
  value_numeric numeric,
  value_boolean boolean,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope_id, name),
  constraint tenant_settings_value_consistency check (
    (type = 'string' and value_string is not null)
    or (type = 'numeric' and value_numeric is not null)
    or (type = 'boolean' and value_boolean is not null)
    or (type = 'json' and value_jsonb is not null)
  )
);

create index if not exists idx_tenant_settings_tenant_scope
  on core.tenant_settings (tenant_id, scope_id);

create table if not exists core.audit_events (
  id uuid primary key default uuidv7(),
  timestamp timestamptz not null default now(),
  type text not null,
  actor_id text,
  tenant_id text,
  module_id text,
  operation_id text,
  detail jsonb not null default '{}',
  source_kind text not null default 'core',
  source_module_id text,
  source_component text
);

create index if not exists audit_events_timestamp_idx
  on core.audit_events(timestamp desc);
create index if not exists audit_events_type_idx on core.audit_events(type);
create index if not exists audit_events_actor_id_idx on core.audit_events(actor_id);
create index if not exists audit_events_tenant_id_idx on core.audit_events(tenant_id);
create index if not exists audit_events_module_id_idx on core.audit_events(module_id);

grant usage on schema core to service_role;
grant select, insert, update, delete on all tables in schema core to service_role;

grant select, insert, update, delete on table core.feature_flags to service_role;
grant select, insert, update, delete on table core.user_tenant_roles to service_role;
grant select, insert, update, delete on table core.tenant_plugin_overrides to service_role;
grant select, insert, update, delete on core.tenant_settings to service_role;
grant select, insert on table core.audit_events to service_role;

alter table core.tenants enable row level security;
alter table core.users enable row level security;
alter table core.agents enable row level security;
alter table core.tenant_settings enable row level security;

create or replace function core.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid
$$;

create or replace function core.has_scope(p_scope_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(coalesce(auth.jwt() -> 'scopes', '[]'::jsonb)) as s(scope_id)
    where s.scope_id = p_scope_id
  )
$$;

create policy tenants_select_own on core.tenants
for select using (id = core.current_tenant_id());

create policy users_select_own_tenant on core.users
for select using (tenant_id = core.current_tenant_id());

create policy agents_select_own_tenant on core.agents
for select using (tenant_id = core.current_tenant_id());

create policy tenant_settings_read_own_scope on core.tenant_settings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tenant_settings_insert_own_scope on core.tenant_settings
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tenant_settings_update_own_scope on core.tenant_settings
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260309120000_core_user_settings.sql
-- core.user_settings: user-scoped KV store (global, no tenant)
-- Mirrors tenant_settings layout for appearance.language, appearance.theme_mode, etc.

create table if not exists core.user_settings (
  user_id uuid not null references core.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('string', 'numeric', 'boolean', 'json')),
  value_string text,
  value_jsonb jsonb,
  value_numeric numeric,
  value_boolean boolean,
  updated_at timestamptz not null default now(),
  primary key (user_id, name),
  constraint user_settings_value_consistency check (
    (type = 'string' and value_string is not null)
    or (type = 'numeric' and value_numeric is not null)
    or (type = 'boolean' and value_boolean is not null)
    or (type = 'json' and value_jsonb is not null)
  )
);

create index if not exists idx_user_settings_user_id
  on core.user_settings (user_id);

grant select, insert, update, delete on core.user_settings to service_role;

alter table core.user_settings enable row level security;

create policy user_settings_select_own on core.user_settings
  for select using (user_id = (auth.jwt() ->> 'sub')::uuid);

create policy user_settings_insert_own on core.user_settings
  for insert with check (user_id = (auth.jwt() ->> 'sub')::uuid);

create policy user_settings_update_own on core.user_settings
  for update using (user_id = (auth.jwt() ->> 'sub')::uuid);

create policy user_settings_delete_own on core.user_settings
  for delete using (user_id = (auth.jwt() ->> 'sub')::uuid);

-- >>> from 20260321200000_platform_infra.sql
-- Platform infra baseline: file storage bucket/metadata + pgmq queues and RPC wrappers.

-- Create the unified 'files' storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', false)
ON CONFLICT (id) DO NOTHING;

-- File storage metadata table
CREATE TABLE IF NOT EXISTS file_storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  module TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_storage_objects_tenant
  ON file_storage_objects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_file_storage_objects_module
  ON file_storage_objects(tenant_id, module);
CREATE INDEX IF NOT EXISTS idx_file_storage_objects_key
  ON file_storage_objects(storage_key);

-- Enable pgmq extension for Supabase Queues
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create inbox processing queues (idempotent — pgmq.create is safe to call multiple times)
SELECT pgmq.create('inbox_download_attachments');
SELECT pgmq.create('inbox_classify');
SELECT pgmq.create('inbox_dispatch');

-- Grant service_role access if pgmq_public schema exists (Supabase Cloud)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgmq_public') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA pgmq_public TO service_role';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgmq_public TO service_role';
  END IF;
END $$;

-- Public RPC wrapper functions for pgmq access from Supabase JS client.
-- These are needed because the Supabase JS client cannot call functions
-- in the pgmq schema directly (PostgREST only exposes public schema by default).

CREATE OR REPLACE FUNCTION public.pgmq_send(queue text, msg jsonb, delay_sec int DEFAULT 0)
RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pgmq.send(queue, msg, delay_sec);
$$;

CREATE OR REPLACE FUNCTION public.pgmq_pop(queue text)
RETURNS SETOF pgmq.message_record LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM pgmq.pop(queue);
$$;

CREATE OR REPLACE FUNCTION public.pgmq_read(queue text, vt int, n int)
RETURNS SETOF pgmq.message_record LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM pgmq.read(queue, vt, n);
$$;

CREATE OR REPLACE FUNCTION public.pgmq_archive(queue text, msg_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pgmq.archive(queue, msg_id);
$$;

CREATE OR REPLACE FUNCTION public.pgmq_delete(queue text, msg_id bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pgmq.delete(queue, msg_id);
$$;

CREATE OR REPLACE FUNCTION public.pgmq_send_batch(queue text, msgs jsonb[], delay_sec int DEFAULT 0)
RETURNS SETOF bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pgmq.send_batch(queue, msgs, delay_sec);
$$;

-- Add RPC function to list pgmq queues with message counts for the manage dashboard.
-- Queries pgmq.meta for known queues and counts messages in each q_<name> table.

CREATE OR REPLACE FUNCTION public.pgmq_list_queues()
RETURNS TABLE (
  queue_name text,
  created_at timestamptz,
  queue_length bigint,
  newest_msg_age interval
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  q RECORD;
  tbl text;
  cnt bigint;
  age interval;
BEGIN
  FOR q IN SELECT m.queue_name AS qn, m.created_at AS ca FROM pgmq.meta m ORDER BY m.queue_name
  LOOP
    tbl := 'pgmq.q_' || q.qn;
    EXECUTE format('SELECT count(*) FROM %s', tbl) INTO cnt;
    EXECUTE format('SELECT now() - max(enqueued_at) FROM %s', tbl) INTO age;
    queue_name := q.qn;
    created_at := q.ca;
    queue_length := cnt;
    newest_msg_age := age;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Also add a function to peek at queue messages (non-destructive read)
CREATE OR REPLACE FUNCTION public.pgmq_peek(queue text, n int DEFAULT 10)
RETURNS SETOF pgmq.message_record LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM pgmq.read(queue, 0, n);
$$;

SELECT pgmq.create('inbox_core_pass');

-- >>> from 20260516000000_ai_schema_baseline.sql
-- AI schema baseline (pre-launch). Squashed from legacy core orchestrator + ai_app migrations.
-- Generated via: supabase db dump --local --schema ai



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "ai";




CREATE TYPE "ai"."agent_run_status" AS ENUM (
    'running',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
);




CREATE TYPE "ai"."session_message_role" AS ENUM (
    'system',
    'user',
    'assistant',
    'tool'
);




CREATE TYPE "ai"."session_participant_role" AS ENUM (
    'owner',
    'member',
    'viewer'
);




CREATE TYPE "ai"."session_principal_type" AS ENUM (
    'user',
    'group'
);




CREATE OR REPLACE FUNCTION "ai"."bump_agent_session_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  update ai.agent_session
  set updated_at = now()
  where id = new.session_id;
  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "ai"."bump_usage_period_total"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_input_tokens" bigint, "p_output_tokens" bigint, "p_cached_tokens" bigint, "p_reasoning_tokens" bigint, "p_cost_micros" bigint, "p_currency" "text", "p_occurred_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  insert into ai.usage_period_total (
    tenant_id,
    user_id,
    period_start,
    period_end,
    input_tokens,
    output_tokens,
    cached_tokens,
    reasoning_tokens,
    cost_micros,
    currency,
    event_count,
    last_event_at,
    updated_at
  )
  values (
    p_tenant_id,
    p_user_id,
    p_period_start,
    p_period_end,
    p_input_tokens,
    p_output_tokens,
    p_cached_tokens,
    p_reasoning_tokens,
    p_cost_micros,
    p_currency,
    1,
    p_occurred_at,
    now()
  )
  on conflict (tenant_id, user_id, period_start)
  do update set
    period_end = excluded.period_end,
    input_tokens = ai.usage_period_total.input_tokens + excluded.input_tokens,
    output_tokens = ai.usage_period_total.output_tokens + excluded.output_tokens,
    cached_tokens = ai.usage_period_total.cached_tokens + excluded.cached_tokens,
    reasoning_tokens = ai.usage_period_total.reasoning_tokens + excluded.reasoning_tokens,
    cost_micros = ai.usage_period_total.cost_micros + excluded.cost_micros,
    currency = excluded.currency,
    event_count = ai.usage_period_total.event_count + 1,
    last_event_at = greatest(
      coalesce(ai.usage_period_total.last_event_at, '-infinity'::timestamptz),
      excluded.last_event_at
    ),
    updated_at = now();
$$;



SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "ai"."action_request" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid",
    "session_id" "uuid",
    "trigger" "text" NOT NULL,
    "action_id" "text",
    "agent_id" "text",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "reason" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "action_request_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'coalesced'::"text", 'skipped'::"text", 'claimed'::"text", 'converted_to_run'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "action_request_trigger_check" CHECK (("trigger" = ANY (ARRAY['message'::"text", 'command'::"text", 'button'::"text", 'cron'::"text", 'hook'::"text", 'direct'::"text"])))
);




CREATE TABLE IF NOT EXISTS "ai"."agent_chat_search_chunk" (
    "chunk_id" "text" NOT NULL,
    "doc_id" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "chunk_index" integer NOT NULL,
    "text" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "search_vector" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"simple"'::"regconfig", COALESCE("text", ''::"text"))) STORED,
    "indexed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_chat_search_chunk_chunk_index_check" CHECK (("chunk_index" >= 0))
);




CREATE TABLE IF NOT EXISTS "ai"."agent_chat_search_document" (
    "doc_id" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "role" "text",
    "agent_id" "text" NOT NULL,
    "workspace_key" "text",
    "session_status" "text" NOT NULL,
    "route_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "text" "text" NOT NULL,
    "source_created_at" timestamp with time zone,
    "source_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "indexed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_chat_search_document_document_type_check" CHECK (("document_type" = ANY (ARRAY['session'::"text", 'message'::"text"]))),
    CONSTRAINT "agent_chat_search_document_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"]))),
    CONSTRAINT "agent_chat_search_document_session_status_check" CHECK (("session_status" = ANY (ARRAY['idle'::"text", 'running'::"text", 'waiting'::"text", 'failed'::"text", 'completed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "ai"."agent_run_event" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "seq" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "ai"."agent_session" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_type_key" "text" NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "title" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "route_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "summary" "text",
    "workspace_key" "text",
    CONSTRAINT "agent_session_agent_type_key_len" CHECK (("char_length"("agent_type_key") <= 128)),
    CONSTRAINT "agent_session_status_check" CHECK (("status" = ANY (ARRAY['idle'::"text", 'running'::"text", 'waiting'::"text", 'failed'::"text", 'completed'::"text"]))),
    CONSTRAINT "agent_session_summary_len" CHECK ((("summary" IS NULL) OR ("char_length"("summary") <= 2000))),
    CONSTRAINT "agent_session_title_len" CHECK ((("title" IS NULL) OR ("char_length"("title") <= 512))),
    CONSTRAINT "agent_session_workspace_key_len" CHECK ((("workspace_key" IS NULL) OR ("char_length"("workspace_key") <= 256)))
);




CREATE TABLE IF NOT EXISTS "ai"."agent_session_message" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "role" "ai"."session_message_role" NOT NULL,
    "parts" "jsonb" NOT NULL,
    "author_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_session_message_parts_object" CHECK (("jsonb_typeof"("parts") = ANY (ARRAY['object'::"text", 'array'::"text"])))
);




CREATE TABLE IF NOT EXISTS "ai"."agent_session_participant" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "principal_type" "ai"."session_principal_type" NOT NULL,
    "principal_id" "uuid" NOT NULL,
    "role" "ai"."session_participant_role" DEFAULT 'member'::"ai"."session_participant_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "ai"."agent_session_run" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "agent_type_key" "text" NOT NULL,
    "model_id" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "mastra_trace_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "ai"."agent_run_status" DEFAULT 'running'::"ai"."agent_run_status" NOT NULL,
    "error_code" "text",
    "error_message" "text",
    "cancelled_at" timestamp with time zone,
    "created_by_user_id" "uuid"
);




CREATE TABLE IF NOT EXISTS "ai"."engenty_ai_agents" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "model" "text" NOT NULL,
    "instructions" "text" NOT NULL,
    "tool_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "skill_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sub_agents" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "ai"."engenty_ai_skills" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "skill_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "ai"."engenty_ai_tools" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tool_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "schema_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "endpoint_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "ai"."gateway_model" (
    "model_id" "text" NOT NULL,
    "display_name" "text",
    "description" "text",
    "provider" "text" NOT NULL,
    "providers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "type" "text",
    "use_cases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "context_tokens" bigint,
    "max_output_tokens" bigint,
    "input_per_mtok_micros" bigint,
    "output_per_mtok_micros" bigint,
    "cached_input_per_mtok_micros" bigint,
    "web_search_per_query_micros" bigint,
    "capabilities" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "zdr_supported" boolean,
    "no_training_supported" boolean,
    "released_at" timestamp with time zone,
    "source_url" "text" DEFAULT 'https://ai-gateway.vercel.sh/v1/models'::"text" NOT NULL,
    "raw_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_tier" "text",
    "available_for_chat" boolean DEFAULT false NOT NULL,
    "available_for_routing" boolean DEFAULT false NOT NULL,
    "available_for_embedding" boolean DEFAULT false NOT NULL,
    "available_for_image" boolean DEFAULT false NOT NULL,
    "available_for_video" boolean DEFAULT false NOT NULL,
    "available_for_rerank" boolean DEFAULT false NOT NULL,
    CONSTRAINT "gateway_model_price_tier_check" CHECK ((("price_tier" IS NULL) OR ("price_tier" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'expensive'::"text"])))),
    CONSTRAINT "gateway_model_use_cases_check" CHECK (("use_cases" <@ ARRAY['text'::"text", 'code'::"text", 'image'::"text", 'video'::"text", 'embed'::"text", 'rerank'::"text"]))
);




CREATE TABLE IF NOT EXISTS "ai"."gateway_model_sync_run" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "trigger" "text" NOT NULL,
    "status" "text" NOT NULL,
    "model_count" integer DEFAULT 0 NOT NULL,
    "updated_model_count" integer DEFAULT 0 NOT NULL,
    "inserted_pricing_count" integer DEFAULT 0 NOT NULL,
    "error_text" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gateway_model_sync_run_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text"]))),
    CONSTRAINT "gateway_model_sync_run_trigger_check" CHECK (("trigger" = ANY (ARRAY['manual'::"text", 'scheduled'::"text"])))
);




CREATE TABLE IF NOT EXISTS "ai"."gateway_model_sync_settings" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "scheduler_mode" "text" DEFAULT 'app_interval'::"text" NOT NULL,
    "cron_expression" "text" DEFAULT '0 3 * * *'::"text" NOT NULL,
    "interval_ms" integer DEFAULT 86400000 NOT NULL,
    "target_url" "text",
    "last_run_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gateway_model_sync_settings_interval_check" CHECK (("interval_ms" >= 60000)),
    CONSTRAINT "gateway_model_sync_settings_mode_check" CHECK (("scheduler_mode" = ANY (ARRAY['app_interval'::"text", 'supabase_cron'::"text"]))),
    CONSTRAINT "gateway_model_sync_settings_singleton_check" CHECK (("id" = 'default'::"text"))
);




COMMENT ON TABLE "ai"."gateway_model_sync_settings" IS 'Controls apps/ai Gateway model sync scheduling. Supabase cron HTTP jobs are not installed here because committed migrations must not contain bearer tokens or service secrets.';



CREATE TABLE IF NOT EXISTS "ai"."model_pricing" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "model_id" "text" NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "input_per_mtok_micros" bigint DEFAULT 0 NOT NULL,
    "output_per_mtok_micros" bigint DEFAULT 0 NOT NULL,
    "cached_input_per_mtok_micros" bigint DEFAULT 0 NOT NULL,
    "reasoning_per_mtok_micros" bigint DEFAULT 0 NOT NULL,
    "valid_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valid_to" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "ai"."tenant_usage_policy" (
    "tenant_id" "uuid" NOT NULL,
    "tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "period_mode" "text" DEFAULT 'calendar'::"text" NOT NULL,
    "period_unit" "text" DEFAULT 'month'::"text" NOT NULL,
    "period_anchor" timestamp with time zone,
    "included_input_tokens" bigint,
    "included_output_tokens" bigint,
    "included_cost_micros" bigint,
    "hard_limit_cost_micros" bigint,
    "soft_limit_cost_micros" bigint,
    "allowed_models" "text"[],
    "enforcement_mode" "text" DEFAULT 'observe'::"text" NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_usage_policy_enforcement_mode_check" CHECK (("enforcement_mode" = ANY (ARRAY['observe'::"text", 'enforce'::"text"]))),
    CONSTRAINT "tenant_usage_policy_period_mode_check" CHECK (("period_mode" = ANY (ARRAY['calendar'::"text", 'rolling'::"text"]))),
    CONSTRAINT "tenant_usage_policy_period_unit_check" CHECK (("period_unit" = ANY (ARRAY['day'::"text", 'week'::"text", 'month'::"text"])))
);




CREATE TABLE IF NOT EXISTS "ai"."usage_event" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "run_id" "uuid",
    "session_id" "uuid",
    "request_id" "uuid",
    "agent_id" "text",
    "action_id" "text",
    "feature" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    "input_tokens" bigint DEFAULT 0 NOT NULL,
    "output_tokens" bigint DEFAULT 0 NOT NULL,
    "cached_tokens" bigint DEFAULT 0 NOT NULL,
    "reasoning_tokens" bigint DEFAULT 0 NOT NULL,
    "pricing_version_id" "uuid",
    "input_per_mtok_micros" bigint DEFAULT 0 NOT NULL,
    "output_per_mtok_micros" bigint DEFAULT 0 NOT NULL,
    "cached_input_per_mtok_micros" bigint DEFAULT 0 NOT NULL,
    "reasoning_per_mtok_micros" bigint DEFAULT 0 NOT NULL,
    "cost_micros" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "ai"."usage_period_total" (
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "input_tokens" bigint DEFAULT 0 NOT NULL,
    "output_tokens" bigint DEFAULT 0 NOT NULL,
    "cached_tokens" bigint DEFAULT 0 NOT NULL,
    "reasoning_tokens" bigint DEFAULT 0 NOT NULL,
    "cost_micros" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "event_count" bigint DEFAULT 0 NOT NULL,
    "last_event_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "ai"."user_usage_policy" (
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "max_cost_micros" bigint,
    "max_total_tokens" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




ALTER TABLE ONLY "ai"."action_request"
    ADD CONSTRAINT "action_request_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."agent_chat_search_chunk"
    ADD CONSTRAINT "agent_chat_search_chunk_doc_id_chunk_index_key" UNIQUE ("doc_id", "chunk_index");



ALTER TABLE ONLY "ai"."agent_chat_search_chunk"
    ADD CONSTRAINT "agent_chat_search_chunk_pkey" PRIMARY KEY ("chunk_id");



ALTER TABLE ONLY "ai"."agent_chat_search_document"
    ADD CONSTRAINT "agent_chat_search_document_pkey" PRIMARY KEY ("doc_id");



ALTER TABLE ONLY "ai"."agent_run_event"
    ADD CONSTRAINT "agent_run_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."agent_run_event"
    ADD CONSTRAINT "agent_run_event_run_id_seq_key" UNIQUE ("run_id", "seq");



ALTER TABLE ONLY "ai"."agent_session_message"
    ADD CONSTRAINT "agent_session_message_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."agent_session_participant"
    ADD CONSTRAINT "agent_session_participant_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."agent_session_participant"
    ADD CONSTRAINT "agent_session_participant_session_id_principal_type_princip_key" UNIQUE ("session_id", "principal_type", "principal_id");



ALTER TABLE ONLY "ai"."agent_session"
    ADD CONSTRAINT "agent_session_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."agent_session_run"
    ADD CONSTRAINT "agent_session_run_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."engenty_ai_agents"
    ADD CONSTRAINT "engenty_ai_agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."engenty_ai_agents"
    ADD CONSTRAINT "engenty_ai_agents_tenant_id_agent_id_key" UNIQUE ("tenant_id", "agent_id");



ALTER TABLE ONLY "ai"."engenty_ai_skills"
    ADD CONSTRAINT "engenty_ai_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."engenty_ai_skills"
    ADD CONSTRAINT "engenty_ai_skills_tenant_id_skill_id_key" UNIQUE ("tenant_id", "skill_id");



ALTER TABLE ONLY "ai"."engenty_ai_tools"
    ADD CONSTRAINT "engenty_ai_tools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."engenty_ai_tools"
    ADD CONSTRAINT "engenty_ai_tools_tenant_id_tool_id_key" UNIQUE ("tenant_id", "tool_id");



ALTER TABLE ONLY "ai"."gateway_model"
    ADD CONSTRAINT "gateway_model_pkey" PRIMARY KEY ("model_id");



ALTER TABLE ONLY "ai"."gateway_model_sync_run"
    ADD CONSTRAINT "gateway_model_sync_run_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."gateway_model_sync_settings"
    ADD CONSTRAINT "gateway_model_sync_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."model_pricing"
    ADD CONSTRAINT "model_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."tenant_usage_policy"
    ADD CONSTRAINT "tenant_usage_policy_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "ai"."usage_event"
    ADD CONSTRAINT "usage_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ai"."usage_period_total"
    ADD CONSTRAINT "usage_period_total_pkey" PRIMARY KEY ("tenant_id", "user_id", "period_start");



ALTER TABLE ONLY "ai"."user_usage_policy"
    ADD CONSTRAINT "user_usage_policy_pkey" PRIMARY KEY ("tenant_id", "user_id");



CREATE INDEX "action_request_session_created_idx" ON "ai"."action_request" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "action_request_status_created_idx" ON "ai"."action_request" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "action_request_tenant_created_idx" ON "ai"."action_request" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "agent_chat_search_chunk_doc_idx" ON "ai"."agent_chat_search_chunk" USING "btree" ("doc_id", "chunk_index");



CREATE INDEX "agent_chat_search_chunk_fts_idx" ON "ai"."agent_chat_search_chunk" USING "gin" ("search_vector");



CREATE INDEX "agent_chat_search_chunk_tenant_user_idx" ON "ai"."agent_chat_search_chunk" USING "btree" ("tenant_id", "user_id");



CREATE INDEX "agent_chat_search_chunk_trgm_idx" ON "ai"."agent_chat_search_chunk" USING "gin" ("text" "public"."gin_trgm_ops");



CREATE INDEX "agent_chat_search_document_agent_idx" ON "ai"."agent_chat_search_document" USING "btree" ("tenant_id", "agent_id", "source_updated_at" DESC);



CREATE INDEX "agent_chat_search_document_route_context_idx" ON "ai"."agent_chat_search_document" USING "gin" ("route_context");



CREATE INDEX "agent_chat_search_document_session_idx" ON "ai"."agent_chat_search_document" USING "btree" ("session_id", "source_updated_at" DESC);



CREATE INDEX "agent_chat_search_document_tenant_user_idx" ON "ai"."agent_chat_search_document" USING "btree" ("tenant_id", "user_id", "source_updated_at" DESC);



CREATE INDEX "agent_chat_search_document_workspace_idx" ON "ai"."agent_chat_search_document" USING "btree" ("tenant_id", "workspace_key", "source_updated_at" DESC) WHERE ("workspace_key" IS NOT NULL);



CREATE INDEX "agent_run_event_run_seq_idx" ON "ai"."agent_run_event" USING "btree" ("run_id", "seq");



CREATE INDEX "agent_session_message_session_id_idx" ON "ai"."agent_session_message" USING "btree" ("session_id", "id");



CREATE INDEX "agent_session_participant_session_idx" ON "ai"."agent_session_participant" USING "btree" ("session_id");



CREATE INDEX "agent_session_participant_tenant_principal_idx" ON "ai"."agent_session_participant" USING "btree" ("tenant_id", "principal_type", "principal_id");



CREATE INDEX "agent_session_run_session_idx" ON "ai"."agent_session_run" USING "btree" ("session_id", "started_at" DESC);



CREATE INDEX "agent_session_run_session_started_idx" ON "ai"."agent_session_run" USING "btree" ("session_id", "started_at" DESC);



CREATE INDEX "agent_session_run_tenant_agent_started_idx" ON "ai"."agent_session_run" USING "btree" ("tenant_id", "agent_type_key", "started_at" DESC);



CREATE INDEX "agent_session_tenant_agent_type_idx" ON "ai"."agent_session" USING "btree" ("tenant_id", "agent_type_key");



CREATE INDEX "agent_session_tenant_creator_updated_idx" ON "ai"."agent_session" USING "btree" ("tenant_id", "created_by_user_id", "updated_at" DESC);



CREATE INDEX "agent_session_tenant_status_updated_idx" ON "ai"."agent_session" USING "btree" ("tenant_id", "status", "updated_at" DESC);



CREATE INDEX "agent_session_tenant_updated_idx" ON "ai"."agent_session" USING "btree" ("tenant_id", "updated_at" DESC);



CREATE INDEX "agent_session_tenant_workspace_updated_idx" ON "ai"."agent_session" USING "btree" ("tenant_id", "workspace_key", "updated_at" DESC) WHERE ("workspace_key" IS NOT NULL);



CREATE INDEX "gateway_model_available_chat_idx" ON "ai"."gateway_model" USING "btree" ("model_id") WHERE "available_for_chat";



CREATE INDEX "gateway_model_available_embedding_idx" ON "ai"."gateway_model" USING "btree" ("model_id") WHERE "available_for_embedding";



CREATE INDEX "gateway_model_available_image_idx" ON "ai"."gateway_model" USING "btree" ("model_id") WHERE "available_for_image";



CREATE INDEX "gateway_model_available_rerank_idx" ON "ai"."gateway_model" USING "btree" ("model_id") WHERE "available_for_rerank";



CREATE INDEX "gateway_model_available_routing_idx" ON "ai"."gateway_model" USING "btree" ("model_id") WHERE "available_for_routing";



CREATE INDEX "gateway_model_available_video_idx" ON "ai"."gateway_model" USING "btree" ("model_id") WHERE "available_for_video";



CREATE INDEX "gateway_model_output_price_idx" ON "ai"."gateway_model" USING "btree" ("output_per_mtok_micros", "model_id");



CREATE INDEX "gateway_model_price_tier_idx" ON "ai"."gateway_model" USING "btree" ("price_tier", "model_id");



CREATE INDEX "gateway_model_provider_idx" ON "ai"."gateway_model" USING "btree" ("provider", "model_id");



CREATE INDEX "gateway_model_sync_run_started_idx" ON "ai"."gateway_model_sync_run" USING "btree" ("started_at" DESC);



CREATE INDEX "gateway_model_tags_idx" ON "ai"."gateway_model" USING "gin" ("tags");



CREATE INDEX "gateway_model_use_cases_idx" ON "ai"."gateway_model" USING "gin" ("use_cases");



CREATE INDEX "model_pricing_model_valid_idx" ON "ai"."model_pricing" USING "btree" ("model_id", "valid_from" DESC);



CREATE INDEX "usage_event_session_time_idx" ON "ai"."usage_event" USING "btree" ("session_id", "occurred_at" DESC);



CREATE INDEX "usage_event_tenant_time_idx" ON "ai"."usage_event" USING "btree" ("tenant_id", "occurred_at" DESC);



CREATE OR REPLACE TRIGGER "agent_session_message_bump_session" AFTER INSERT ON "ai"."agent_session_message" FOR EACH ROW EXECUTE FUNCTION "ai"."bump_agent_session_updated_at"();



ALTER TABLE ONLY "ai"."action_request"
    ADD CONSTRAINT "action_request_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai"."agent_session_run"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ai"."action_request"
    ADD CONSTRAINT "action_request_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai"."agent_session"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ai"."action_request"
    ADD CONSTRAINT "action_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_chat_search_chunk"
    ADD CONSTRAINT "agent_chat_search_chunk_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "ai"."agent_chat_search_document"("doc_id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_chat_search_chunk"
    ADD CONSTRAINT "agent_chat_search_chunk_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai"."agent_session"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_chat_search_chunk"
    ADD CONSTRAINT "agent_chat_search_chunk_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_chat_search_chunk"
    ADD CONSTRAINT "agent_chat_search_chunk_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_chat_search_document"
    ADD CONSTRAINT "agent_chat_search_document_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai"."agent_session"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_chat_search_document"
    ADD CONSTRAINT "agent_chat_search_document_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_chat_search_document"
    ADD CONSTRAINT "agent_chat_search_document_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_run_event"
    ADD CONSTRAINT "agent_run_event_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai"."agent_session_run"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_run_event"
    ADD CONSTRAINT "agent_run_event_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai"."agent_session"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_run_event"
    ADD CONSTRAINT "agent_run_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_session"
    ADD CONSTRAINT "agent_session_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "ai"."agent_session_message"
    ADD CONSTRAINT "agent_session_message_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ai"."agent_session_message"
    ADD CONSTRAINT "agent_session_message_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai"."agent_session"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_session_message"
    ADD CONSTRAINT "agent_session_message_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_session_participant"
    ADD CONSTRAINT "agent_session_participant_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai"."agent_session"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_session_participant"
    ADD CONSTRAINT "agent_session_participant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_session_run"
    ADD CONSTRAINT "agent_session_run_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ai"."agent_session_run"
    ADD CONSTRAINT "agent_session_run_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai"."agent_session"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_session_run"
    ADD CONSTRAINT "agent_session_run_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."agent_session"
    ADD CONSTRAINT "agent_session_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."engenty_ai_agents"
    ADD CONSTRAINT "engenty_ai_agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."engenty_ai_skills"
    ADD CONSTRAINT "engenty_ai_skills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."engenty_ai_tools"
    ADD CONSTRAINT "engenty_ai_tools_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."tenant_usage_policy"
    ADD CONSTRAINT "tenant_usage_policy_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."usage_event"
    ADD CONSTRAINT "usage_event_pricing_version_id_fkey" FOREIGN KEY ("pricing_version_id") REFERENCES "ai"."model_pricing"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ai"."usage_event"
    ADD CONSTRAINT "usage_event_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai"."agent_session"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ai"."usage_event"
    ADD CONSTRAINT "usage_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ai"."usage_event"
    ADD CONSTRAINT "usage_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ai"."usage_period_total"
    ADD CONSTRAINT "usage_period_total_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."user_usage_policy"
    ADD CONSTRAINT "user_usage_policy_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ai"."user_usage_policy"
    ADD CONSTRAINT "user_usage_policy_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE;



ALTER TABLE "ai"."action_request" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."agent_chat_search_chunk" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."agent_chat_search_document" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."agent_run_event" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_run_event_delete" ON "ai"."agent_run_event" FOR DELETE USING ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_run_event"."session_id") AND ("p"."tenant_id" = "agent_run_event"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_run_event_insert" ON "ai"."agent_run_event" FOR INSERT WITH CHECK ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_run_event"."session_id") AND ("p"."tenant_id" = "agent_run_event"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_run_event_select" ON "ai"."agent_run_event" FOR SELECT USING ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_run_event"."session_id") AND ("p"."tenant_id" = "agent_run_event"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



ALTER TABLE "ai"."agent_session" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_session_insert" ON "ai"."agent_session" FOR INSERT WITH CHECK ((("tenant_id" = "core"."current_tenant_id"()) AND ("created_by_user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid")));



ALTER TABLE "ai"."agent_session_message" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_session_message_insert" ON "ai"."agent_session_message" FOR INSERT WITH CHECK ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_session_message"."session_id") AND ("p"."tenant_id" = "agent_session_message"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_session_message_select" ON "ai"."agent_session_message" FOR SELECT USING ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_session_message"."session_id") AND ("p"."tenant_id" = "agent_session_message"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



ALTER TABLE "ai"."agent_session_participant" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_session_participant_insert" ON "ai"."agent_session_participant" FOR INSERT WITH CHECK ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session" "s"
  WHERE (("s"."id" = "agent_session_participant"."session_id") AND ("s"."tenant_id" = "agent_session_participant"."tenant_id") AND ("s"."created_by_user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_session_participant_select" ON "ai"."agent_session_participant" FOR SELECT USING ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "member_row"
  WHERE (("member_row"."session_id" = "agent_session_participant"."session_id") AND ("member_row"."tenant_id" = "agent_session_participant"."tenant_id") AND ("member_row"."principal_type" = 'user'::"ai"."session_principal_type") AND ("member_row"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



ALTER TABLE "ai"."agent_session_run" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_session_run_delete" ON "ai"."agent_session_run" FOR DELETE USING ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_session_run"."session_id") AND ("p"."tenant_id" = "agent_session_run"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_session_run_insert" ON "ai"."agent_session_run" FOR INSERT WITH CHECK ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_session_run"."session_id") AND ("p"."tenant_id" = "agent_session_run"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_session_run_select" ON "ai"."agent_session_run" FOR SELECT USING ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_session_run"."session_id") AND ("p"."tenant_id" = "agent_session_run"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_session_run_update" ON "ai"."agent_session_run" FOR UPDATE USING ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_session_run"."session_id") AND ("p"."tenant_id" = "agent_session_run"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_session_select" ON "ai"."agent_session" FOR SELECT USING ((("tenant_id" = "core"."current_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "ai"."agent_session_participant" "p"
  WHERE (("p"."session_id" = "agent_session"."id") AND ("p"."tenant_id" = "agent_session"."tenant_id") AND ("p"."principal_type" = 'user'::"ai"."session_principal_type") AND ("p"."principal_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"))))));



CREATE POLICY "agent_session_update" ON "ai"."agent_session" FOR UPDATE USING ((("tenant_id" = "core"."current_tenant_id"()) AND ("created_by_user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid")));



ALTER TABLE "ai"."engenty_ai_agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "engenty_ai_agents_delete" ON "ai"."engenty_ai_agents" FOR DELETE USING (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_agents_insert" ON "ai"."engenty_ai_agents" FOR INSERT WITH CHECK (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_agents_select" ON "ai"."engenty_ai_agents" FOR SELECT USING (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_agents_update" ON "ai"."engenty_ai_agents" FOR UPDATE USING (("tenant_id" = "core"."current_tenant_id"()));



ALTER TABLE "ai"."engenty_ai_skills" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "engenty_ai_skills_delete" ON "ai"."engenty_ai_skills" FOR DELETE USING (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_skills_insert" ON "ai"."engenty_ai_skills" FOR INSERT WITH CHECK (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_skills_select" ON "ai"."engenty_ai_skills" FOR SELECT USING (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_skills_update" ON "ai"."engenty_ai_skills" FOR UPDATE USING (("tenant_id" = "core"."current_tenant_id"()));



ALTER TABLE "ai"."engenty_ai_tools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "engenty_ai_tools_delete" ON "ai"."engenty_ai_tools" FOR DELETE USING (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_tools_insert" ON "ai"."engenty_ai_tools" FOR INSERT WITH CHECK (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_tools_select" ON "ai"."engenty_ai_tools" FOR SELECT USING (("tenant_id" = "core"."current_tenant_id"()));



CREATE POLICY "engenty_ai_tools_update" ON "ai"."engenty_ai_tools" FOR UPDATE USING (("tenant_id" = "core"."current_tenant_id"()));



ALTER TABLE "ai"."gateway_model" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."gateway_model_sync_run" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."gateway_model_sync_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."model_pricing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."tenant_usage_policy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."usage_event" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."usage_period_total" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ai"."user_usage_policy" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "ai" TO "service_role";
GRANT USAGE ON SCHEMA "ai" TO "authenticated";



GRANT ALL ON FUNCTION "ai"."bump_usage_period_total"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_input_tokens" bigint, "p_output_tokens" bigint, "p_cached_tokens" bigint, "p_reasoning_tokens" bigint, "p_cost_micros" bigint, "p_currency" "text", "p_occurred_at" timestamp with time zone) TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."action_request" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_chat_search_chunk" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_chat_search_document" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_run_event" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_run_event" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_session" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_session" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_session_message" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_session_message" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_session_participant" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_session_participant" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_session_run" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."agent_session_run" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."engenty_ai_agents" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."engenty_ai_agents" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."engenty_ai_skills" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."engenty_ai_skills" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."engenty_ai_tools" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."engenty_ai_tools" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."gateway_model" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."gateway_model_sync_run" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."gateway_model_sync_settings" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."model_pricing" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."tenant_usage_policy" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."usage_event" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."usage_period_total" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ai"."user_usage_policy" TO "service_role";

-- >>> from 20260524120000_core_custom_access_token_hook.sql
-- Inject tenant_id and scopes into Supabase JWT for RLS + Realtime.

create or replace function core.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  claims jsonb;
  user_id uuid;
  tenant_id uuid;
  scope_ids jsonb;
begin
  user_id := coalesce(
    nullif(event ->> 'user_id', '')::uuid,
    nullif(event -> 'claims' ->> 'sub', '')::uuid
  );

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if user_id is not null then
    select u.tenant_id
      into tenant_id
      from core.users u
     where u.id = user_id
     limit 1;

    if tenant_id is not null then
      select coalesce(
        (
          select jsonb_agg(to_jsonb(s.scope_id) order by s.scope_id)
            from (
              select distinct ts.scope_id
                from core.tenant_settings ts
               where ts.tenant_id = tenant_id
            ) s
        ),
        '["default"]'::jsonb
      )
        into scope_ids;

      if scope_ids is null or jsonb_array_length(scope_ids) = 0 then
        scope_ids := '["default"]'::jsonb;
      end if;

      claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant_id::text));
      claims := jsonb_set(claims, '{scopes}', scope_ids);
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

revoke all on function core.custom_access_token_hook(jsonb) from public;
grant execute on function core.custom_access_token_hook(jsonb) to supabase_auth_admin;

grant usage on schema core to supabase_auth_admin;
grant select on table core.users to supabase_auth_admin;
grant select on table core.tenant_settings to supabase_auth_admin;

-- >>> from 20260524120100_core_realtime_publication.sql
-- Enable Realtime postgres_changes for ai.agent_session (copilot live cache).

do $$
begin
  alter publication supabase_realtime add table ai.agent_session;
exception
  when duplicate_object then null;
end $$;

-- >>> from 20260524130000_core_custom_access_token_hook_scopes.sql
-- Harden JWT hook: default scope only; omit claims when no core.users row.

create or replace function core.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  claims jsonb;
  user_id uuid;
  tenant_id uuid;
begin
  user_id := coalesce(
    nullif(event ->> 'user_id', '')::uuid,
    nullif(event -> 'claims' ->> 'sub', '')::uuid
  );

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if user_id is not null then
    select u.tenant_id
      into tenant_id
      from core.users u
     where u.id = user_id
     limit 1;

    if tenant_id is not null then
      claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant_id::text));
      claims := jsonb_set(claims, '{scopes}', '["default"]'::jsonb);
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- >>> from 20260527100000_ai_engenty_ai_agents_guardrails.sql
-- Per-agent Mastra guardrails config (input/output processors).
-- Persisted as JSON; assembled by apps/ai into @mastra/core/processors instances.

alter table ai.engenty_ai_agents
  add column if not exists guardrails jsonb not null default '{}'::jsonb;

-- >>> from 20260528120000_ai_thread_id_column_rename.sql
-- Slice 02: align ai schema FK columns with CopilotKit threadId / agentId vocabulary.

-- Registry slug column on thread tables
ALTER TABLE ai.agent_session RENAME COLUMN agent_type_key TO agent_id;
ALTER TABLE ai.agent_session_run RENAME COLUMN agent_type_key TO agent_id;

-- FK columns pointing at ai.agent_session.id
ALTER TABLE ai.agent_session_message RENAME COLUMN session_id TO thread_id;
ALTER TABLE ai.agent_session_participant RENAME COLUMN session_id TO thread_id;
ALTER TABLE ai.agent_session_run RENAME COLUMN session_id TO thread_id;
ALTER TABLE ai.agent_run_event RENAME COLUMN session_id TO thread_id;
ALTER TABLE ai.action_request RENAME COLUMN session_id TO thread_id;
ALTER TABLE ai.agent_chat_search_document RENAME COLUMN session_id TO thread_id;
ALTER TABLE ai.agent_chat_search_chunk RENAME COLUMN session_id TO thread_id;
ALTER TABLE ai.usage_event RENAME COLUMN session_id TO thread_id;

-- Trigger function references NEW.thread_id after column rename
CREATE OR REPLACE FUNCTION ai.bump_agent_session_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update ai.agent_session
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

-- Participant unique constraint column rename (index follows column rename)
ALTER TABLE ai.agent_session_participant
  RENAME CONSTRAINT agent_session_participant_session_id_principal_type_princip_key
  TO agent_session_participant_thread_id_principal_type_princip_key;

-- Check constraint on agent_id length (optional clarity)
ALTER TABLE ai.agent_session
  RENAME CONSTRAINT agent_session_agent_type_key_len TO agent_session_agent_id_len;

-- >>> from 20260528140000_ai_thread_table_rename.sql
-- Slice 04: rename ai agent_session* tables to thread* / agent_run (CopilotKit thread vocabulary).

ALTER TABLE ai.agent_session RENAME TO thread;
ALTER TABLE ai.agent_session_message RENAME TO thread_message;
ALTER TABLE ai.agent_session_participant RENAME TO thread_participant;
ALTER TABLE ai.agent_session_run RENAME TO agent_run;

-- Bump parent thread.updated_at on new messages.
DROP TRIGGER IF EXISTS agent_session_message_bump_session ON ai.thread_message;
DROP FUNCTION IF EXISTS ai.bump_agent_session_updated_at();

CREATE OR REPLACE FUNCTION ai.bump_thread_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
begin
  update ai.thread
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

CREATE TRIGGER thread_message_bump_thread
  AFTER INSERT ON ai.thread_message
  FOR EACH ROW
  EXECUTE FUNCTION ai.bump_thread_updated_at();

-- RLS policies store qualified table names; recreate after table rename.
DROP POLICY IF EXISTS agent_session_insert ON ai.thread;
DROP POLICY IF EXISTS agent_session_select ON ai.thread;
DROP POLICY IF EXISTS agent_session_update ON ai.thread;

DROP POLICY IF EXISTS agent_session_message_insert ON ai.thread_message;
DROP POLICY IF EXISTS agent_session_message_select ON ai.thread_message;

DROP POLICY IF EXISTS agent_session_participant_insert ON ai.thread_participant;
DROP POLICY IF EXISTS agent_session_participant_select ON ai.thread_participant;

DROP POLICY IF EXISTS agent_session_run_delete ON ai.agent_run;
DROP POLICY IF EXISTS agent_session_run_insert ON ai.agent_run;
DROP POLICY IF EXISTS agent_session_run_select ON ai.agent_run;
DROP POLICY IF EXISTS agent_session_run_update ON ai.agent_run;

DROP POLICY IF EXISTS agent_run_event_delete ON ai.agent_run_event;
DROP POLICY IF EXISTS agent_run_event_insert ON ai.agent_run_event;
DROP POLICY IF EXISTS agent_run_event_select ON ai.agent_run_event;

CREATE POLICY thread_insert ON ai.thread FOR INSERT
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND created_by_user_id = (auth.jwt() ->> 'sub')::uuid
  );

CREATE POLICY thread_select ON ai.thread FOR SELECT
  USING (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = thread.id
        AND p.tenant_id = thread.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY thread_update ON ai.thread FOR UPDATE
  USING (
    tenant_id = core.current_tenant_id()
    AND created_by_user_id = (auth.jwt() ->> 'sub')::uuid
  );

CREATE POLICY thread_message_insert ON ai.thread_message FOR INSERT
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = thread_message.thread_id
        AND p.tenant_id = thread_message.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY thread_message_select ON ai.thread_message FOR SELECT
  USING (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = thread_message.thread_id
        AND p.tenant_id = thread_message.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY thread_participant_insert ON ai.thread_participant FOR INSERT
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread s
      WHERE s.id = thread_participant.thread_id
        AND s.tenant_id = thread_participant.tenant_id
        AND s.created_by_user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY thread_participant_select ON ai.thread_participant FOR SELECT
  USING (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant member_row
      WHERE member_row.thread_id = thread_participant.thread_id
        AND member_row.tenant_id = thread_participant.tenant_id
        AND member_row.principal_type = 'user'::ai.session_principal_type
        AND member_row.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY agent_run_delete ON ai.agent_run FOR DELETE
  USING (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = agent_run.thread_id
        AND p.tenant_id = agent_run.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY agent_run_insert ON ai.agent_run FOR INSERT
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = agent_run.thread_id
        AND p.tenant_id = agent_run.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY agent_run_select ON ai.agent_run FOR SELECT
  USING (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = agent_run.thread_id
        AND p.tenant_id = agent_run.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY agent_run_update ON ai.agent_run FOR UPDATE
  USING (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = agent_run.thread_id
        AND p.tenant_id = agent_run.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY agent_run_event_delete ON ai.agent_run_event FOR DELETE
  USING (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = agent_run_event.thread_id
        AND p.tenant_id = agent_run_event.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY agent_run_event_insert ON ai.agent_run_event FOR INSERT
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = agent_run_event.thread_id
        AND p.tenant_id = agent_run_event.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

CREATE POLICY agent_run_event_select ON ai.agent_run_event FOR SELECT
  USING (
    tenant_id = core.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM ai.thread_participant p
      WHERE p.thread_id = agent_run_event.thread_id
        AND p.tenant_id = agent_run_event.tenant_id
        AND p.principal_type = 'user'::ai.session_principal_type
        AND p.principal_id = (auth.jwt() ->> 'sub')::uuid
    )
  );

-- Realtime publication (copilot live cache); table rename keeps OID — ensure name on fresh setups.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE ai.thread;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- >>> from 20260530090000_drop_ai_engenty_ai_skills.sql
-- Skills moved to file storage (tenants/<tid>/ai/skills/<tier>/<name>/SKILL.md),
-- discovered by the Mastra Workspace skill tools. The DB no longer stores skill
-- bodies or metadata, so the table (and its RLS policies / constraints / grants)
-- is dropped. No production data exists yet.
DROP TABLE IF EXISTS "ai"."engenty_ai_skills" CASCADE;

-- >>> from 20260530150000_ai_mcp_remove_hardcoded_demo_tool.sql
-- Remove stale V1 MCP demo registry rows from the pre-discovery implementation.
-- Current chatbot MCP sync discovers tool names with tools/list instead of hard-coding hello_world_events.

with stale_tools as (
  select tenant_id, tool_id
  from ai.engenty_ai_tools
  where schema_json #>> '{engenty_mcp_app,tool_name}' = 'hello_world_events'
)
update ai.engenty_ai_agents agent
set
  tool_ids = coalesce(
    (
      select jsonb_agg(current_tool.tool_id order by current_tool.ordinality)
      from jsonb_array_elements_text(agent.tool_ids) with ordinality as current_tool(tool_id, ordinality)
      where not exists (
        select 1
        from stale_tools stale
        where stale.tenant_id = agent.tenant_id
          and stale.tool_id = current_tool.tool_id
      )
    ),
    '[]'::jsonb
  ),
  updated_at = now()
where exists (
  select 1
  from stale_tools stale
  where stale.tenant_id = agent.tenant_id
    and agent.tool_ids ? stale.tool_id
);

delete from ai.engenty_ai_tools
where schema_json #>> '{engenty_mcp_app,tool_name}' = 'hello_world_events';

-- >>> from 20260611150000_ai_agent_task_dispatch_queue.sql
-- Create the agent_task_dispatch pgmq queue used by the task dispatcher (Phase 2).
-- pgmq.create is idempotent — safe to run multiple times.
SELECT pgmq.create('agent_task_dispatch');

-- >>> from 20260611160000_ai_action_request_dispatched_status.sql
-- Extend ai.action_request status constraint to cover Phase 3 action-run lifecycle.
-- dispatched = run started; completed = run finished successfully; failed = run errored.
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
      'failed'::"text"
    ])
  );

-- >>> from 20260611170000_ai_routine_state_and_tick.sql
-- Phase 4 — Routines: per-tenant routine state + generic scheduler tick.
-- Routine *definitions* live in code (ROUTINE.md / builtin); this table only
-- persists per-tenant enable/override state and last-run bookkeeping.

CREATE TABLE IF NOT EXISTS "ai"."routine_state" (
    "tenant_id" "uuid" NOT NULL REFERENCES "core"."tenants"("id") ON DELETE CASCADE,
    "routine_id" "text" NOT NULL,
    "enabled" boolean NOT NULL DEFAULT true,
    "schedule_override" "text",
    "last_run_at" timestamp with time zone,
    "last_result" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "routine_state_pkey" PRIMARY KEY ("tenant_id", "routine_id")
);

ALTER TABLE "ai"."routine_state" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ai"."routine_state" TO "service_role";

COMMENT ON TABLE "ai"."routine_state" IS
  'Per-tenant routine enable/override state. Definitions are code (ROUTINE.md); apps/ai tick reads+writes this.';

-- Generic routines tick: one pg_cron job POSTs /ai/v1/routines/tick with the
-- service JWT from Vault (same secret the coordinator heartbeat used —
-- one service identity, one name: conductor_service_jwt).
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.trigger_engenty_routines_tick(
  p_ai_base_url text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_jwt text;
begin
  select secret into v_jwt from vault.decrypted_secrets where name = 'conductor_service_jwt' limit 1;

  if v_jwt is null then
    raise exception 'conductor_service_jwt not found in vault';
  end if;

  perform
    extensions.http_post(
      url := p_ai_base_url || '/ai/v1/routines/tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_jwt,
        'Content-Type', 'application/json'
      ),
      body := '{}'::text
    );
end;
$$;

COMMENT ON FUNCTION private.trigger_engenty_routines_tick(text) IS
  'Fires the generic routines tick POST to the AI service. Schedule with pg_cron every 5 minutes.';

-- The cron job is NOT auto-registered here because the JWT and base URL must
-- be configured first (Vault secret + reachable AI service URL). Register it
-- during provisioning once those are set:
--
--   select cron.schedule(
--     'engenty-routines-tick',
--     '*/5 * * * *',
--     $$ select private.trigger_engenty_routines_tick('http://127.0.0.1:8790'); $$
--   );

-- >>> from 20260611190000_core_auth_stores.sql
-- Persistent auth stores: device authorizations (RFC 8628 flow) and sessions.
-- Previously in-memory maps in auth-routes.ts — lost on restart, broken >1 instance.

create table if not exists core.device_authorizations (
  device_code_hash text primary key,          -- sha256 of the device code; raw code never stored
  user_code        text not null,
  status           text not null default 'pending'
                   check (status in ('pending','approved','denied','consumed','expired')),
  requested        jsonb not null default '{}'::jsonb,  -- {capabilities, moduleIds, scopes}
  granted          jsonb,                                -- clamped scopes fixed at approval
  client_name      text,
  approved_by      uuid,                                 -- auth user id of approver
  approved_tenant  uuid,
  approved_at      timestamptz,
  last_polled_at   timestamptz,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);

-- One active (pending, unexpired) authorization per user code.
create unique index if not exists device_authorizations_active_user_code
  on core.device_authorizations (user_code)
  where status = 'pending';

create index if not exists device_authorizations_expires_at
  on core.device_authorizations (expires_at);

create table if not exists core.sessions (
  id                 uuid primary key,
  principal_id       text not null,
  tenant_id          uuid,
  refresh_token_id   uuid not null,
  refresh_token_hash text not null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  revoked_at         timestamptz
);

create index if not exists sessions_principal
  on core.sessions (tenant_id, principal_id);

alter table core.device_authorizations enable row level security;
alter table core.sessions enable row level security;
-- Service-role only (no policies): accessed exclusively through the core API.

-- >>> from 20260611200000_core_api_tokens.sql
-- Persistent API tokens (agent/service keys) — previously an in-memory map,
-- so listing and revocation did not survive restarts.

create table if not exists core.api_tokens (
  id             uuid primary key,
  name           text not null,
  principal_id   text not null,            -- creator (token acts for this principal)
  tenant_id      uuid,
  principal_type text not null default 'agent'
                 check (principal_type in ('agent','service')),
  token_hash     text not null,            -- sha256 of the issued JWT
  last4          text,
  capabilities   jsonb not null default '[]'::jsonb,
  module_ids     jsonb not null default '[]'::jsonb,
  scopes         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz
);

create index if not exists api_tokens_principal
  on core.api_tokens (tenant_id, principal_id);

alter table core.api_tokens enable row level security;
-- Service-role only (no policies): accessed exclusively through the core API.

-- >>> from 20260611210000_ai_agent_id_rename.sql
-- Phase 5.3: agent id rename to <module>.<role> dot notation.
-- leads_manager -> leads.manager, company_profile_manager -> company-profile.manager.
-- The agent_type_key columns were renamed to agent_id in
-- 20260528120000_ai_thread_id_column_rename.sql (tables renamed to
-- thread / agent_run in 20260528140000_ai_thread_table_rename.sql).

UPDATE ai.thread SET agent_id = 'leads.manager' WHERE agent_id = 'leads_manager';
UPDATE ai.thread SET agent_id = 'company-profile.manager' WHERE agent_id = 'company_profile_manager';

UPDATE ai.agent_run SET agent_id = 'leads.manager' WHERE agent_id = 'leads_manager';
UPDATE ai.agent_run SET agent_id = 'company-profile.manager' WHERE agent_id = 'company_profile_manager';

-- >>> from 20260611221000_ai_custom_routine.sql
-- Phase 4 - Custom Routines: custom routines database definition.
CREATE TABLE IF NOT EXISTS "ai"."custom_routine" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL PRIMARY KEY,
    "tenant_id" "uuid" NOT NULL REFERENCES "core"."tenants"("id") ON DELETE CASCADE,
    "name" "text" NOT NULL,
    "description" "text",
    "agent_id" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "schedules" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "quiet_hours" "text",
    "created_by_user_id" "uuid" REFERENCES "core"."users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "ai"."custom_routine" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_routine_select" ON "ai"."custom_routine" FOR SELECT USING (("tenant_id" = "core"."current_tenant_id"()));
CREATE POLICY "custom_routine_insert" ON "ai"."custom_routine" FOR INSERT WITH CHECK (("tenant_id" = "core"."current_tenant_id"()));
CREATE POLICY "custom_routine_update" ON "ai"."custom_routine" FOR UPDATE USING (("tenant_id" = "core"."current_tenant_id"()));
CREATE POLICY "custom_routine_delete" ON "ai"."custom_routine" FOR DELETE USING (("tenant_id" = "core"."current_tenant_id"()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ai"."custom_routine" TO "service_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ai"."custom_routine" TO "authenticated";

COMMENT ON TABLE "ai"."custom_routine" IS 'Custom user-defined routines for a tenant.';

-- >>> from 20260614120000_ai_action_request_context.sql
-- Actions context binding (D1): tag each action_request with the subject it is
-- about, so contextual UI consumers can run actions in parallel per entity
-- ("enhance Contact A" ∥ "Contact B"), observe a place's runs, and reattach.
-- Subject is a polymorphic (context_type, context_id) pair — same shape as
-- module_tasks.task_contexts. See docs/content/wip/agent-platform/actions-tasks-routines-concept.md.

alter table "ai"."action_request"
  add column if not exists "context_type" text,
  add column if not exists "context_id" text;

create index if not exists "action_request_tenant_action_context_idx"
  on "ai"."action_request" ("tenant_id", "action_id", "context_type", "context_id", "created_at" desc);

-- >>> from 20260611140000_ai_agent_run_realtime.sql
-- Phase 1 (D5): run status transitions become a realtime signal so clients know
-- when to attach to a run stream. The event firehose stays on the SSE attach
-- endpoint (/ai/v1/runs/:id/stream); only status-change rows are published here.
alter publication supabase_realtime add table ai.agent_run;

-- >>> from 20260613210000_pgmq_metrics_wrapper.sql
-- pgmq_metrics: SECURITY DEFINER wrapper for pgmq.metrics().
-- Returns queue_length + oldest message age for a single queue.
-- Mirrors the grant pattern from 20260321200000_platform_infra.sql.

CREATE OR REPLACE FUNCTION public.pgmq_metrics(queue_name text)
RETURNS TABLE (
  queue_length bigint,
  oldest_msg_age_sec int
)
LANGUAGE sql SECURITY DEFINER SET search_path = pgmq, public AS $$
  SELECT
    m.queue_length,
    m.oldest_msg_age_sec
  FROM pgmq.metrics(queue_name) AS m;
$$;
