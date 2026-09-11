import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRecordLinker,
  moduleRecordPath,
  withRecordLinks,
} from "./record-link.js";
import { clearSpaceKeyCache } from "./space-key.js";

function clientWithKey(key: string | null) {
  const maybeSingle = vi.fn(async () => ({
    data: key ? { key } : null,
    error: null,
  }));
  const filter = { eq: () => filter, maybeSingle };
  return {
    client: { schema: () => ({ from: () => ({ select: () => filter }) }) },
    maybeSingle,
  };
}

describe("record-link", () => {
  beforeEach(() => clearSpaceKeyCache());

  it("builds the space form when a key resolves", () => {
    expect(moduleRecordPath("brain", "tasks", "t-1")).toBe(
      "/s/brain/tasks/t-1"
    );
    expect(moduleRecordPath(null, "contacts", "c 1")).toBe(
      "/mdl/contacts/c%201"
    );
  });

  it("prefers the record's own space over the run's space", async () => {
    const { client, maybeSingle } = clientWithKey("projects-room");
    const link = createRecordLinker({ getTenantDb: () => client });
    await expect(
      link({ spaceId: "run-space", tenantId: "t" }, "projects", ["p-1"], "rec")
    ).resolves.toBe("/s/projects-room/projects/p-1");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("links tenant-shared records into the run's space, else /mdl", async () => {
    const { client } = clientWithKey("brain");
    const link = createRecordLinker({ getTenantDb: () => client });
    await expect(
      link({ spaceId: "s-1", tenantId: "t" }, "contacts", ["c-1"])
    ).resolves.toBe("/s/brain/contacts/c-1");
    await expect(link({ tenantId: "t" }, "contacts", ["c-1"])).resolves.toBe(
      "/mdl/contacts/c-1"
    );
    const offline = createRecordLinker({});
    await expect(
      offline({ spaceId: "s-1", tenantId: "t" }, "offers", ["o-1"])
    ).resolves.toBe("/mdl/offers/o-1");
  });

  it("attaches link to every row", async () => {
    const rows = await withRecordLinks(
      [{ id: "a" }, { id: "b" }],
      async (row) => `/mdl/team/${row.id}`
    );
    expect(rows).toEqual([
      { id: "a", link: "/mdl/team/a" },
      { id: "b", link: "/mdl/team/b" },
    ]);
  });
});
