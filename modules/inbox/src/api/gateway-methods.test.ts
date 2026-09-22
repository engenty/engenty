import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { registerInboxGatewayMethods } from "./gateway-methods.js";

/** The mailboxes core says the space has placed; each test sets it. */
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
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
          owner_user_id: OWNER,
          all_spaces: false,
          sharing: "personal",
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

const auth = { tenantId: TENANT } as never;

describe("inbox_account_bind", () => {
  it("creates the sync state, enables it, and pulls once", async () => {
    const { operation, pullStream, upsertSettings } = bindOperation({});

    const result = (await operation.handler({ connection_id: CONNECTION }, {
      auth,
    } as never)) as { bound: boolean };

    expect(result.bound).toBe(true);
    expect(upsertSettings).toHaveBeenCalledWith(CONNECTION, {
      // A personal mailbox stays scoped to its owner.
      owner_user_id: OWNER,
      sync_enabled: true,
    });
    expect(pullStream).toHaveBeenCalled();
  });

  it("does not restart a mailbox somebody paused", async () => {
    const { operation, upsertSettings } = bindOperation({
      existingState: { cursor: null, sync_enabled: false },
    });

    await operation.handler({ connection_id: CONNECTION }, { auth } as never);

    // Re-adding the app must not undo a deliberate pause.
    expect(upsertSettings).toHaveBeenCalledWith(CONNECTION, {
      owner_user_id: OWNER,
    });
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
    // E1 — a thread read is narrowed to the mailboxes this space placed, so
    // the declared contract is the account mount, not "any row this user owns".
    expect(
      serverOperations.find((op) => op.operationId === "inbox_thread_get")
        ?.spacePolicy
    ).toEqual({ kind: "account_mounted" });
  });
});

describe("inbox_space_mount", () => {
  it("binds every mailbox the space has placed and is ready", async () => {
    placed.current = new Set([CONNECTION]);
    const { mountOperation, pullStream, upsertSettings } = bindOperation({});

    const result = (await mountOperation.handler({ space_id: "space-1" }, {
      auth,
    } as never)) as { bound: unknown[]; needs: string[]; ready: boolean };

    // The wizard door ends at "the mail is here" too — same binding as
    // inbox_account_bind, for each placed mailbox.
    expect(upsertSettings).toHaveBeenCalledWith(CONNECTION, {
      owner_user_id: OWNER,
      sync_enabled: true,
    });
    expect(pullStream).toHaveBeenCalled();
    expect(result).toMatchObject({ needs: [], ready: true });
    expect(result.bound).toHaveLength(1);
  });

  it("says the space still needs a mailbox when none is placed", async () => {
    placed.current = new Set();
    const { mountOperation, upsertSettings } = bindOperation({});

    const result = await mountOperation.handler({ space_id: "space-1" }, {
      auth,
    } as never);

    // A tenant mailbox that this space did not place is not this space's.
    expect(upsertSettings).not.toHaveBeenCalled();
    expect(result).toEqual({ bound: [], needs: ["mailbox"], ready: false });
  });
});
