import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { FileMountStore } from "../dal/file-manager-store.js";
import { registerFileSourcesRoutes } from "./file-sources-routes.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SPACE = "22222222-2222-4222-8222-222222222222";
const OTHER_SPACE = "33333333-3333-4333-8333-333333333333";
const DRIVE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MAILBOX = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const auth = { principalId: "user-1", tenantId: TENANT } as never;

/** The bind operation, with the two seams it touches. */
function bindOperation(
  options: { driveSpaceId?: string; existingFolderId?: string } = {}
) {
  const operations: PluginServerOperation[] = [];
  const create = vi.fn(async () => ({ id: "folder-1" }));
  const findByConnection = vi.fn(async () =>
    options.existingFolderId ? { id: options.existingFolderId } : null
  );
  registerFileSourcesRoutes(
    {
      registerHttpRoute: () => undefined,
      registerOperation: (operation: PluginServerOperation) => {
        operations.push(operation);
      },
    } as unknown as PluginServerApi,
    {
      client: {
        // Only drives are file sources; the mailbox is deliberately absent.
        listFileSources: vi.fn(async () => [
          {
            connector_id: "google-drive",
            connector_name: "Google Drive",
            display_name: null,
            external_account: "me@example.com",
            id: DRIVE,
            space_id: options.driveSpaceId ?? SPACE,
          },
        ]),
      } as never,
      getDb: () => ({}) as never,
      mounts: { create, findByConnection } as unknown as FileMountStore,
    }
  );
  const operation = operations.find(
    (entry) => entry.operationId === "files_account_bind"
  );
  const mountOperation = operations.find(
    (entry) => entry.operationId === "files_space_mount"
  );
  if (!(operation && mountOperation)) {
    throw new Error("files bind/mount operations were not registered");
  }
  return { create, findByConnection, mountOperation, operation };
}

describe("files_account_bind", () => {
  it("mounts the drive's provider root under the space", async () => {
    const { create, operation } = bindOperation();

    const result = await operation.handler(
      { connection_id: DRIVE, space_id: SPACE },
      { auth } as never
    );

    expect(result).toEqual({
      bound: true,
      created: true,
      folder_id: "folder-1",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { id: SPACE, type: "space" },
        tenantId: TENANT,
      }),
      {
        connectionId: DRIVE,
        // The account is the label, because that is what the person placed.
        name: "me@example.com",
        parentId: null,
        source: "gdrive",
        // The provider root: picking a subfolder is a decision only a person
        // can make, and the picker is still there for it.
        sourceFolderId: null,
      }
    );
  });

  it("keeps the mount it already has", async () => {
    const { create, operation } = bindOperation({ existingFolderId: "old" });

    const result = await operation.handler(
      { connection_id: DRIVE, space_id: SPACE },
      { auth } as never
    );

    // Binding runs again whenever either side is re-added; a second root for
    // the same drive is a duplicate tree nobody asked for.
    expect(result).toEqual({ bound: true, created: false, folder_id: "old" });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not show another Space's drive", async () => {
    const { create, operation } = bindOperation({ driveSpaceId: OTHER_SPACE });

    const result = await operation.handler(
      { connection_id: DRIVE, space_id: SPACE },
      { auth } as never
    );

    // A drive mounts only into the Files of the Space that owns it.
    expect(result).toEqual({ bound: false, created: false, folder_id: null });
    expect(create).not.toHaveBeenCalled();
  });

  it("leaves an account that is not a drive alone", async () => {
    const { create, operation } = bindOperation();

    const result = await operation.handler(
      { connection_id: MAILBOX, space_id: SPACE },
      { auth } as never
    );

    // Not a failure: the module declares its need by capability, and most
    // accounts do not carry files.
    expect(result).toEqual({ bound: false, created: false, folder_id: null });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("files_space_mount", () => {
  it("mounts every drive the space owns and is ready", async () => {
    const { create, mountOperation } = bindOperation();

    const result = await mountOperation.handler({ space_id: SPACE }, {
      auth,
    } as never);

    // Only file sources are listed; a mailbox of the space is not ours.
    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      bound: [
        {
          bound: true,
          connection_id: DRIVE,
          created: true,
          folder_id: "folder-1",
        },
      ],
      needs: [],
      ready: true,
    });
  });

  it("is ready with no drive at all — native folders need nothing", async () => {
    // The only drive belongs to another Space.
    const { create, mountOperation } = bindOperation({
      driveSpaceId: OTHER_SPACE,
    });

    const result = await mountOperation.handler({ space_id: SPACE }, {
      auth,
    } as never);

    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({ bound: [], needs: [], ready: true });
  });
});
