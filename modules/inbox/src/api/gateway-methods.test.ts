import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { registerInboxGatewayMethods } from "./gateway-methods.js";

/** The mailboxes the space owns; each test sets it. */
const placed = vi.hoisted(() => ({ current: new Set<string>() }));
vi.mock("@engenty/connections-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@engenty/connections-sdk")>()),
  resolveSpaceRecordAccounts: vi.fn(async () => placed.current),
}));

function makeMockApi() {
  const serverOperations: PluginServerOperation[] = [];
  const api = {
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
  } as Pick<PluginServerApi, "registerOperation">;
  return { api: api as PluginServerApi, serverOperations };
}

const TENANT = "11111111-1111-4111-8111-111111111111";
const CONNECTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MAILBOX = { id: CONNECTION, space_id: SPACE };

/** The bind operation, with the seams a single run touches. */
function bindOperation(options: { existingState?: unknown; stream?: boolean }) {
  const { api, serverOperations } = makeMockApi();
  const upsertSettings = vi.fn(async () => ({ sync_enabled: true }));
  const pullStream = vi.fn(async () => ({ items: [], next_cursor: null }));
  registerInboxGatewayMethods(api, {
    connectionsClient: {
      listConnections: vi.fn(async () => [
        {
          autonomous_mode: "full",
          connector_id: "google-gmail",
          id: CONNECTION,
          space_id: SPACE,
          status: "active",
        },
      ]),
      pullStream,
    } as never,
    getConnector: () =>
      (options.stream === false ? {} : { stream: {} }) as never,
    getDb: () => ({}) as never,
    repoForAuth: () => ({}) as never,
    serviceRepoFor: () =>
      ({
        messages: { upsertMany: vi.fn(async () => 0) },
        syncState: {
          get: vi.fn(async () => options.existingState ?? null),
          recordResult: vi.fn(async () => undefined),
          upsertSettings,
        },
      }) as never,
  });
  const operation = serverOperations.find(
    (op) => op.operationId === "inbox_account_bind"
  );
  const mountOperation = serverOperations.find(
    (op) => op.operationId === "inbox_space_mount"
  );
  if (!(operation && mountOperation)) {
    throw new Error("inbox bind/mount operations were not registered");
  }
  return { mountOperation, operation, pullStream, upsertSettings };
}

// A run bound to the mailbox's Space (agents/services take the named Space).
const auth = {
  principalId: "agent-1",
  principalType: "agent",
  spaceId: SPACE,
  tenantId: TENANT,
} as never;

describe("inbox_account_bind", () => {
  it("creates the sync state, enables it, and pulls once", async () => {
    const { operation, pullStream, upsertSettings } = bindOperation({});

    const result = (await operation.handler({ connection_id: CONNECTION }, {
      auth,
    } as never)) as { bound: boolean };

    expect(result.bound).toBe(true);
    // The state row is stamped with the mailbox's Space.
    expect(upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining(MAILBOX),
      { sync_enabled: true }
    );
    expect(pullStream).toHaveBeenCalled();
  });

  it("does not restart a mailbox somebody paused", async () => {
    const { operation, upsertSettings } = bindOperation({
      existingState: { cursor: null, sync_enabled: false },
    });

    await operation.handler({ connection_id: CONNECTION }, { auth } as never);

    // Re-adding the app must not undo a deliberate pause.
    expect(upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining(MAILBOX),
      {}
    );
  });

  it("refuses a connector that carries no mail", async () => {
    const { operation, upsertSettings } = bindOperation({ stream: false });

    const result = (await operation.handler({ connection_id: CONNECTION }, {
      auth,
    } as never)) as { bound: boolean; skipped: string | null };

    expect(result).toMatchObject({ bound: false, skipped: "no_stream" });
    expect(upsertSettings).not.toHaveBeenCalled();
  });
});

describe("registerInboxGatewayMethods spacePolicy", () => {
  it("declares every mail read as account_mounted", () => {
    const { api, serverOperations } = makeMockApi();
    registerInboxGatewayMethods(api, {
      connectionsClient: {
        listConnections: vi.fn(async () => []),
      } as never,
      getConnector: () => undefined,
      getDb: () => ({}) as never,
      repoForAuth: () => ({}) as never,
      serviceRepoFor: () => ({}) as never,
    });

    expect(
      serverOperations.find((op) => op.operationId === "inbox_accounts_list")
        ?.spacePolicy
    ).toEqual({ kind: "account_mounted" });
    expect(
      serverOperations.find((op) => op.operationId === "inbox_threads_list")
        ?.spacePolicy
    ).toEqual({
      connectionInputKey: "connection_id",
      kind: "account_mounted",
    });
    // A thread read is narrowed to the caller's Spaces' mailboxes.
    expect(
      serverOperations.find((op) => op.operationId === "inbox_thread_get")
        ?.spacePolicy
    ).toEqual({ kind: "account_mounted" });
  });
});

describe("inbox_space_mount", () => {
  it("binds every mailbox the space owns and is ready", async () => {
    placed.current = new Set([CONNECTION]);
    const { mountOperation, pullStream, upsertSettings } = bindOperation({});

    const result = (await mountOperation.handler({ space_id: "space-1" }, {
      auth,
    } as never)) as { bound: unknown[]; needs: string[]; ready: boolean };

    // The wizard door ends at "the mail is here" too — same binding as
    // inbox_account_bind, for each mailbox the space owns.
    expect(upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining(MAILBOX),
      { sync_enabled: true }
    );
    expect(pullStream).toHaveBeenCalled();
    expect(result).toMatchObject({ needs: [], ready: true });
    expect(result.bound).toHaveLength(1);
  });

  it("says the space still needs a mailbox when it owns none", async () => {
    placed.current = new Set();
    const { mountOperation, upsertSettings } = bindOperation({});

    const result = await mountOperation.handler({ space_id: "space-1" }, {
      auth,
    } as never);

    // A tenant mailbox that another space owns is not this space's.
    expect(upsertSettings).not.toHaveBeenCalled();
    expect(result).toEqual({ bound: [], needs: ["mailbox"], ready: false });
  });
});
