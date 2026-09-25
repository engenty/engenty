import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import {
  destroyEngentySandboxesForScope,
  listEngentySandboxesForScope,
  stopEngentySpaceComputersForScope,
} from "../ai/sandbox/engenty-sandbox-catalog.js";
import { readSandboxAdmissionState } from "../ai/sandbox/sandbox-admission.js";
import {
  readUserBrowserStatus,
  signOutUserBrowser,
  startUserBrowser,
  stopUserBrowser,
  UserBrowserLimitError,
} from "../ai/sandbox/space-browser.js";
import { getSpaceComputerQueueDepths } from "../ai/sandbox/space-computer.js";
import { resolvePersonalSpaceId } from "../ai/sessions/run-space.js";
import { type AiSessionScope, scopeAccessToken } from "../ai/sessions/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore } from "../dal/threads/agent-run-store.js";
import type { ThreadStore } from "../dal/threads/index.js";
import { mintBrowserTicket } from "./browser/browser-tickets.js";
import { BROWSER_STREAM_WS_PATH } from "./browser-stream-ws.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const killSandboxesBodySchema = z.object({
  sandbox_ids: z.array(z.string().min(1).max(256)).optional(),
});

const stopComputersBodySchema = z.object({
  sandbox_ids: z.array(z.string().min(1).max(256)).min(1),
});

const browserGrantBodySchema = z
  .object({
    autostart: z.boolean().optional(),
    unattended: z.boolean().optional(),
  })
  .refine(
    (body) => body.autostart !== undefined || body.unattended !== undefined
  );

export function registerSandboxRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    /** Absent when this server has no WS upgrade: no live view, no tickets. */
    browserTicketSecret?: string | null;
    getRunStore?: () => AgentRunStore | null;
    getSessionStore: () => ThreadStore | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/sandboxes`;

  app.get(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const store = opts.getSessionStore();
    if (!store) {
      return c.json({ error: "agent_sandboxes.unconfiguredDatabase" }, 503);
    }
    try {
      const sandboxes = await listEngentySandboxesForScope({
        getRunStore: opts.getRunStore,
        scope: scope.scope,
        store,
      });
      // Host-wide, not scoped: a user whose own run is queued needs to see
      // that the HOST is full, which is a fact about the host. It carries no
      // other tenant's identity — just how many slots are taken.
      const admission = readSandboxAdmissionState();
      return c.json({
        compute: {
          held: admission.held,
          limit: admission.limit,
          // Serialized commands waiting/running per space computer, keyed by
          // sandbox id — empty when no machine is busy.
          machine_queues: getSpaceComputerQueueDepths(),
          queued: admission.queued,
        },
        sandboxes,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "listSandboxes failed",
        "agent_sandboxes.listFailed",
        err
      );
    }
  });

  // A Space's browser (PLAN-space-owned-connections.md): every route below
  // names the Space in `?space_id=` — absent means the caller's personal
  // Space, the copilot's — and core's surface endpoint, gated by Space
  // access, is the membership check, so a caller only ever reads, starts,
  // stops or views the browser of a Space they can enter. The tenant comes
  // from the scope, so the id cannot cross tenants.
  const readSpaceId = async (
    c: Context<{ Bindings: HonoBindings; Variables: HonoVariables }>,
    scope: AiSessionScope
  ): Promise<string | null> => {
    const named = c.req.query("space_id")?.trim();
    if (named) {
      return UUID_PATTERN.test(named) ? named : null;
    }
    return await resolvePersonalSpaceId(scope);
  };

  const readBrowserIdentity = async (
    c: Context<{ Bindings: HonoBindings; Variables: HonoVariables }>
  ) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return { ok: false as const, response: scope.response };
    }
    const spaceId = await readSpaceId(c, scope.scope);
    if (!spaceId) {
      return {
        ok: false as const,
        response: c.json({ error: "agent_sandboxes.spaceRequired" }, 400),
      };
    }
    const accessToken = scopeAccessToken(scope.scope)?.trim();
    const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
    if (!(accessToken && coreBaseUrl)) {
      return {
        ok: false as const,
        response: c.json({ error: "agent_sandboxes.coreUnavailable" }, 503),
      };
    }
    try {
      await new EngentyCoreClient({ accessToken, coreBaseUrl }).getSpaceSurface(
        spaceId
      );
    } catch {
      return {
        ok: false as const,
        response: c.json({ error: "agent_sandboxes.spaceForbidden" }, 403),
      };
    }
    return {
      identity: { spaceId, tenantId: scope.scope.tenantId },
      ok: true as const,
    };
  };

  app.get(`${base}/browser`, async (c) => {
    const identity = await readBrowserIdentity(c);
    if (!identity.ok) {
      return identity.response;
    }
    try {
      return c.json(await readUserBrowserStatus(identity.identity));
    } catch (err) {
      return handleRouteError(
        c,
        "readUserBrowserStatus failed",
        "agent_sandboxes.browserStatusFailed",
        err
      );
    }
  });

  // Start (or wake). Declared, never implicit — this route IS the
  // declaration; a chat turn cannot conjure a browser.
  app.post(`${base}/browser`, async (c) => {
    const identity = await readBrowserIdentity(c);
    if (!identity.ok) {
      return identity.response;
    }
    try {
      return c.json(await startUserBrowser(identity.identity));
    } catch (err) {
      if (err instanceof UserBrowserLimitError) {
        return c.json(
          {
            dimension: err.dimension,
            error: "agent_sandboxes.browserLimit",
            limit: err.limit,
          },
          429
        );
      }
      return handleRouteError(
        c,
        "startUserBrowser failed",
        "agent_sandboxes.browserStartFailed",
        err
      );
    }
  });

  app.post(`${base}/browser/stop`, async (c) => {
    const identity = await readBrowserIdentity(c);
    if (!identity.ok) {
      return identity.response;
    }
    try {
      return c.json(await stopUserBrowser(identity.identity));
    } catch (err) {
      return handleRouteError(
        c,
        "stopUserBrowser failed",
        "agent_sandboxes.browserStopFailed",
        err
      );
    }
  });

  // A 60 s ticket for ONE live-view connection to one agent's window in a
  // Space's browser (§2.5): `?space_id=…&agent_id=…`, Space members only.
  app.post(`${base}/browser/ticket`, async (c) => {
    const identity = await readBrowserIdentity(c);
    if (!identity.ok) {
      return identity.response;
    }
    const agentId = c.req.query("agent_id")?.trim();
    if (!agentId) {
      return c.json({ error: "agent_sandboxes.agentRequired" }, 400);
    }
    if (!opts.browserTicketSecret) {
      return c.json({ error: "agent_sandboxes.browserViewUnavailable" }, 501);
    }
    try {
      const status = await readUserBrowserStatus(identity.identity);
      if (status.state === "absent") {
        return c.json({ error: "agent_sandboxes.browserAbsent" }, 404);
      }
      const ticket = mintBrowserTicket(
        {
          agent_id: agentId,
          sandbox_id: status.sandboxId,
          space_id: identity.identity.spaceId,
          tenant_id: identity.identity.tenantId,
        },
        opts.browserTicketSecret
      );
      return c.json({
        sandbox_id: status.sandboxId,
        state: status.state,
        ws_url: `${BROWSER_STREAM_WS_PATH}?ticket=${encodeURIComponent(ticket)}`,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "mintBrowserTicket failed",
        "agent_sandboxes.browserTicketFailed",
        err
      );
    }
  });

  // The Space's standing consents for its browser — core's row, reached
  // through the one service the browser UI already talks to. Core decides
  // who may read (members) and set (owners); apps/ai forwards the caller's
  // own token.
  const coreClientFor = async (
    c: Context<{ Bindings: HonoBindings; Variables: HonoVariables }>
  ) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return { ok: false as const, response: scope.response };
    }
    const spaceId = await readSpaceId(c, scope.scope);
    if (!spaceId) {
      return {
        ok: false as const,
        response: c.json({ error: "agent_sandboxes.spaceRequired" }, 400),
      };
    }
    const accessToken = scopeAccessToken(scope.scope)?.trim();
    const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
    if (!(accessToken && coreBaseUrl)) {
      return {
        ok: false as const,
        response: c.json({ error: "agent_sandboxes.coreUnavailable" }, 503),
      };
    }
    return {
      client: new EngentyCoreClient({ accessToken, coreBaseUrl }),
      ok: true as const,
      spaceId,
    };
  };

  app.get(`${base}/browser/grant`, async (c) => {
    const core = await coreClientFor(c);
    if (!core.ok) {
      return core.response;
    }
    try {
      return c.json(await core.client.getSpaceBrowserGrant(core.spaceId));
    } catch (err) {
      return handleRouteError(
        c,
        "getSpaceBrowserGrant failed",
        "agent_sandboxes.browserGrantFailed",
        err
      );
    }
  });

  app.put(`${base}/browser/grant`, async (c) => {
    const core = await coreClientFor(c);
    if (!core.ok) {
      return core.response;
    }
    const body = browserGrantBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "agent_sandboxes.invalidBody" }, 400);
    }
    try {
      return c.json(
        await core.client.putSpaceBrowserGrant(core.spaceId, body.data)
      );
    } catch (err) {
      return handleRouteError(
        c,
        "putSpaceBrowserGrant failed",
        "agent_sandboxes.browserGrantFailed",
        err
      );
    }
  });

  // Sign out = stop + empty the profile. The only action that forgets logins.
  app.post(`${base}/browser/sign-out`, async (c) => {
    const identity = await readBrowserIdentity(c);
    if (!identity.ok) {
      return identity.response;
    }
    try {
      return c.json(await signOutUserBrowser(identity.identity));
    } catch (err) {
      return handleRouteError(
        c,
        "signOutUserBrowser failed",
        "agent_sandboxes.browserSignOutFailed",
        err
      );
    }
  });

  // Stop (not destroy) space computers: the machine sleeps, its container
  // filesystem stays, the next command wakes it. DELETE on a machine is Reset.
  app.post(`${base}/stop`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = stopComputersBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "agent_sandboxes.invalidBody" }, 400);
    }
    try {
      const result = await stopEngentySpaceComputersForScope({
        sandboxIds: body.data.sandbox_ids,
        scope: scope.scope,
      });
      return c.json(result);
    } catch (err) {
      return handleRouteError(
        c,
        "stopSpaceComputers failed",
        "agent_sandboxes.stopFailed",
        err
      );
    }
  });

  app.delete(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const store = opts.getSessionStore();
    if (!store) {
      return c.json({ error: "agent_sandboxes.unconfiguredDatabase" }, 503);
    }
    const body = killSandboxesBodySchema.safeParse(
      c.req.header("content-type")?.includes("application/json")
        ? await c.req.json().catch(() => ({}))
        : {}
    );
    if (!body.success) {
      return c.json({ error: "agent_sandboxes.invalidBody" }, 400);
    }
    try {
      const result = await destroyEngentySandboxesForScope({
        getRunStore: opts.getRunStore,
        sandboxIds: body.data.sandbox_ids,
        scope: scope.scope,
        store,
      });
      return c.json(result);
    } catch (err) {
      return handleRouteError(
        c,
        "destroySandboxes failed",
        "agent_sandboxes.destroyFailed",
        err
      );
    }
  });
}
