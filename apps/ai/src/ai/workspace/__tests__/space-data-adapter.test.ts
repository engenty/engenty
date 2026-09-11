/**
 * The `/data` mount's adapter (PLAN-space-data.md D4).
 *
 * The property under test throughout: a file operation on this mount is a CALL
 * to the space's data endpoints as the run's principal — never a byte read, and
 * never a shortcut around the operation pipeline.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createSpaceDataAdapter,
  SpaceDataRequestError,
} from "../space-data-adapter.js";

const OFFER_ID = "aaaa-bbbb";
const CONTACT_KEY = "Contacts/People/anna__1111.contact.md";
const OFFER_MEMBER_KEY = `Offers/draft/relaunch__${OFFER_ID}.offer/letter.md`;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(status === 200 ? { data } : data), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function adapterWith(handler: (url: string, init?: RequestInit) => Response) {
  const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init))
  );
  return {
    adapter: createSpaceDataAdapter({
      accessToken: "token-1",
      agentId: "agent-7",
      coreBaseUrl: "https://core.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      spaceId: "space-1",
    }),
    fetchImpl,
  };
}

const contactDocument = {
  kind: "record",
  members: [
    {
      content: "---\nid: 1111\n---\n\nNotes.\n",
      contentType: "text/markdown",
      derived: false,
      editable: true,
      encoding: "utf8",
      name: "anna__1111.contact.md",
    },
  ],
  name: "anna__1111.contact.md",
  nodeType: "contacts.contact",
  path: "People/anna__1111.contact.md",
  recordId: "1111",
  version: "2026-08-14T10:00:00Z",
};

describe("reads are operation calls", () => {
  it("reads a record through the space's data endpoint, as the agent", async () => {
    const { adapter, fetchImpl } = adapterWith(() =>
      jsonResponse(contactDocument)
    );
    const file = await adapter.download(CONTACT_KEY);
    expect(await file.text()).toContain("Notes.");
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://core.test/api/spaces/space-1/data/read?path=Contacts%2FPeople%2Fanna__1111.contact.md"
    );
    // The agent header is what makes a gated write escalate to an approval
    // instead of being allowed — losing it here would let agents write records
    // without a card.
    expect(
      (init?.headers as Record<string, string>)["x-engenty-agent-id"]
    ).toBe("agent-7");
  });

  it("addresses one member of a bundle without fetching the others", async () => {
    const { adapter, fetchImpl } = adapterWith(() =>
      jsonResponse({
        ...contactDocument,
        kind: "bundle",
        members: [
          {
            content: "Dear Müller GmbH,\n",
            contentType: "text/markdown",
            derived: false,
            editable: true,
            encoding: "utf8",
            name: "letter.md",
          },
        ],
        path: `draft/relaunch__${OFFER_ID}.offer`,
      })
    );
    const file = await adapter.download(OFFER_MEMBER_KEY);
    expect(await file.text()).toContain("Dear Müller GmbH");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      encodeURIComponent(OFFER_MEMBER_KEY)
    );
  });

  it("reports a missing member as an error the agent can read", async () => {
    const { adapter } = adapterWith(() =>
      jsonResponse({ ...contactDocument, members: [] })
    );
    await expect(adapter.download(CONTACT_KEY)).rejects.toBeInstanceOf(
      SpaceDataRequestError
    );
  });

  it("answers exists() false for a 404 and rethrows anything else", async () => {
    const missing = adapterWith(() =>
      jsonResponse({ error: { code: "contact_not_found", message: "no" } }, 404)
    );
    expect(await missing.adapter.exists(CONTACT_KEY)).toBe(false);

    const broken = adapterWith(() =>
      jsonResponse({ error: { message: "boom" } }, 500)
    );
    await expect(broken.adapter.exists(CONTACT_KEY)).rejects.toThrow();
  });
});

describe("writes go through the module's operation", () => {
  it("reads the current version, then presents it on the write", async () => {
    const calls: Array<{ body?: unknown; url: string }> = [];
    const { adapter } = adapterWith((url, init) => {
      calls.push({
        url,
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return jsonResponse(contactDocument);
    });
    await adapter.upload(CONTACT_KEY, "---\nid: 1111\n---\n\nNew notes.\n");
    expect(calls[0]?.url).toContain("/data/read?path=");
    expect(calls[1]?.url).toBe(
      "https://core.test/api/spaces/space-1/data/write"
    );
    expect(calls[1]?.body).toMatchObject({
      base_version: "2026-08-14T10:00:00Z",
      path: "Contacts/People/anna__1111.contact.md",
    });
  });

  it("names the member when writing into a bundle", async () => {
    const bodies: unknown[] = [];
    const { adapter } = adapterWith((_url, init) => {
      if (init?.body) {
        bodies.push(JSON.parse(String(init.body)));
      }
      return jsonResponse({ ...contactDocument, kind: "bundle" });
    });
    await adapter.upload(OFFER_MEMBER_KEY, "New intro.");
    expect(bodies[0]).toMatchObject({
      member: "letter.md",
      path: `Offers/draft/relaunch__${OFFER_ID}.offer`,
    });
  });

  it("surfaces an approval gate as a readable refusal, not a generic failure", async () => {
    const { adapter } = adapterWith((url) =>
      url.includes("/write")
        ? jsonResponse({ ok: false, status: "approval_required" }, 202)
        : jsonResponse(contactDocument)
    );
    await expect(adapter.upload(CONTACT_KEY, "x")).rejects.toThrow(
      /approve this change/
    );
  });

  it("refuses delete, copy and pre-signed uploads outright", async () => {
    const { adapter } = adapterWith(() => jsonResponse(contactDocument));
    // Deleting a record is `<module>_delete`, a critical-risk operation with
    // its own approval — reachable as a tool, never as an `rm` on a mount.
    await expect(adapter.delete(CONTACT_KEY)).rejects.toThrow(
      /not_supported|module/
    );
    await expect(adapter.copy(CONTACT_KEY, "x")).rejects.toThrow();
    await expect(
      adapter.signedUploadUrl(CONTACT_KEY, {} as never)
    ).rejects.toThrow(/operation/);
  });
});

describe("listing walks the tree, bounded", () => {
  it("starts from the visible roots when no prefix is given", async () => {
    const seen: string[] = [];
    const { adapter } = adapterWith((url) => {
      seen.push(url);
      if (url.includes("/roots")) {
        return jsonResponse([
          {
            label: "Contacts",
            moduleId: "contacts",
            root: "Contacts",
            writable: true,
          },
        ]);
      }
      return jsonResponse({
        entries: [
          {
            kind: "record",
            name: "anna__1111.contact.md",
            path: "People/anna__1111.contact.md",
            recordId: "1111",
            updatedAt: "2026-08-14T10:00:00Z",
            version: "2026-08-14T10:00:00Z",
          },
        ],
        folders: [],
      });
    });
    const result = await adapter.list();
    expect(result.items.map((item) => item.key)).toEqual([CONTACT_KEY]);
    expect(seen[0]).toContain("/data/roots");
  });

  it("keeps walking when one folder refuses — the tree fails separately", async () => {
    const { adapter } = adapterWith((url) => {
      if (url.includes("path=Contacts%2FSecret")) {
        return jsonResponse({ error: { message: "nope" } }, 403);
      }
      if (url.includes("path=Contacts%2FPeople")) {
        return jsonResponse({
          entries: [
            {
              kind: "record",
              name: "anna__1111.contact.md",
              path: "People/anna__1111.contact.md",
              recordId: "1111",
              version: "v",
            },
          ],
          folders: [],
        });
      }
      return jsonResponse({
        entries: [],
        folders: [
          { name: "Secret", path: "Secret" },
          { name: "People", path: "People" },
        ],
      });
    });
    const result = await adapter.list({ prefix: "Contacts" });
    expect(result.items.map((item) => item.key)).toEqual([CONTACT_KEY]);
  });
});
