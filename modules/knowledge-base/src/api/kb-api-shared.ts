import { createApiError } from "@engenty/api-contracts";
import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KbRepoFactory } from "../dal/contracts.js";

export type KbServerApi = Pick<
  PluginServerApi,
  | "callGatewayMethod"
  | "getStorageService"
  | "hasOperation"
  | "registerHttpRoute"
  | "registerOperation"
>;

export type GetKbRepo = (auth?: PluginAuthContext) => KbRepoFactory;

/** Tenant-locked DB handle factory (engenty_server lane, RLS-enforced). */
export type GetKbDb = (auth: { tenantId: string }) => SupabaseClient;

/** DB handles threaded from the plugin factory into route registration. */
export interface KbDbHandles {
  /** Tenant-locked handle factory — every request-shaped read/write. */
  getDb: GetKbDb;
  /** Service-role client, reserved for the ONE context-less read that
   * resolves tenancy itself: the source-webhook token → source-row lookup
   * in kb-sources.ts. Everything else must go through `getDb`. */
  serviceDb: SupabaseClient;
}

export function parseBody(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return {};
}

export async function readRouteJsonBody(
  ctx: PluginHttpRouteContext
): Promise<unknown> {
  if (ctx.body !== undefined) {
    return ctx.body;
  }
  return ctx.request.json().catch(() => ({}));
}

export function notFound(msg = "Not found") {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

export function badRequest(msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export function conflict(msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 409,
    headers: { "content-type": "application/json" },
  });
}

export function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify(createApiError({ code, message })), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function created(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

/** Parse query params from standard Request. */
export function qp(ctx: PluginHttpRouteContext): URLSearchParams {
  return new URL(ctx.request.url).searchParams;
}
