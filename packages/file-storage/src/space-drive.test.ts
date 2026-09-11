import { describe, expect, it } from "vitest";
import {
  fileSpaceDriveQueryKey,
  fileSpaceInvalidationKey,
  fileSpaceListingQueryKey,
  fileSpaceOwnerKey,
  fileSpaceOwnerPath,
  projectFileSpaceOwner,
  spaceFileSpaceOwner,
} from "./file-space-owner.js";
import {
  buildSpaceDrive,
  type DriveNode,
  spaceDataChildNodes,
  spaceDriveProjectNodes,
  spaceDriveRootOwner,
  spaceFolderChildNodes,
} from "./space-drive.js";

const SPACE = "019fe871-f780-78ee-9232-20b4c84665de";

const kindsOf = (nodes: DriveNode[]) =>
  nodes.map((node) => `${node.kind}:${node.name}`);

describe("buildSpaceDrive", () => {
  it("projects every store into one tree", () => {
    const nodes = buildSpaceDrive({
      artifacts: [{ id: "a1", title: "Campaign calendar" }],
      dataRoots: [{ label: "Files", moduleId: "files", root: "Files" }],
      projects: [{ id: "pr1", title: "Relaunch" }],
      spaceId: SPACE,
    });
    expect(kindsOf(nodes)).toEqual([
      "folder:Files",
      "folder:Projects",
      "artifact:Campaign calendar",
    ]);
  });

  it("does NOT read the space's own file space itself any more", () => {
    // It arrives as the `files` module's adapter root, already mount-filtered
    // by the server — which is what makes mount = grant true of it. Assembling
    // it here as well would both duplicate every folder and keep an ungated
    // lane alive beside the gated one.
    const nodes = buildSpaceDrive({
      artifacts: [{ id: "a1", title: "Campaign calendar" }],
      spaceId: SPACE,
    });
    expect(kindsOf(nodes)).toEqual(["artifact:Campaign calendar"]);
  });

  it("omits the Projects folder when the space has none", () => {
    const nodes = buildSpaceDrive({ spaceId: SPACE });
    expect(nodes).toEqual([]);
  });

  it("takes the Projects label from the caller so it can be translated", () => {
    const nodes = buildSpaceDrive({
      projects: [{ id: "pr1", title: "Relaunch" }],
      projectsFolderLabel: "Projekte",
      spaceId: SPACE,
    });
    expect(nodes[0]?.name).toBe("Projekte");
  });
});

describe("one level of a file space", () => {
  const owner = spaceDriveRootOwner(SPACE);

  it("badges a connector-backed folder as a mount, not a folder", () => {
    // The one distinction a reader most needs: those bytes are not ours.
    const nodes = spaceFolderChildNodes({
      folders: [
        {
          connectionId: "cnx-1",
          id: "d1",
          name: "Shared Drive",
          parentId: null,
          source: "gdrive",
        },
        { id: "d2", name: "Research", parentId: null, source: "native" },
      ],
      owner,
    });
    expect(kindsOf(nodes)).toEqual(["folder:Research", "mount:Shared Drive"]);
    expect(nodes.find((n) => n.kind === "mount")?.connectionId).toBe("cnx-1");
  });

  it("gives every node an id unique across kinds", () => {
    // A file and a folder can share a source id across stores; the tree key
    // has to survive that.
    const nodes = spaceFolderChildNodes({
      files: [{ folderId: null, id: "same", name: "same" }],
      folders: [{ id: "same", name: "same", parentId: null }],
      owner,
    });
    const ids = nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("project folder ⇄ project Files tab", () => {
  it("addresses the SAME file space from both renderings", () => {
    // The plan: "ONE object, two renderings. Enforce with a shared resolver; if
    // they can drift, they will." This is that enforcement, asserted — the tab
    // and the Drive node both go through projectFileSpaceOwner.
    const projectId = "019fe8ec-c14e-753a-be70-320b8bb27cf8";
    const [driveNode] = spaceDriveProjectNodes([
      { id: projectId, title: "Relaunch" },
    ]);
    const filesTabOwner = projectFileSpaceOwner(projectId);

    expect(driveNode?.owner).toEqual(filesTabOwner);
    expect(fileSpaceOwnerKey(driveNode?.owner ?? filesTabOwner)).toBe(
      fileSpaceOwnerKey(filesTabOwner)
    );
    // And the same HTTP path, which is what actually decides which rows come
    // back from `/api/files/spaces/:ownerType/:ownerId`.
    expect(fileSpaceOwnerPath(driveNode?.owner ?? filesTabOwner)).toBe(
      fileSpaceOwnerPath(filesTabOwner)
    );
  });

  it("keeps the space's own file space distinct from a project's", () => {
    const id = "shared-id";
    expect(fileSpaceOwnerKey(spaceFileSpaceOwner(id))).not.toBe(
      fileSpaceOwnerKey(projectFileSpaceOwner(id))
    );
  });

  it("roots the Drive on the space's own file space", () => {
    expect(spaceDriveRootOwner(SPACE)).toEqual({ id: SPACE, type: "space" });
  });
});

describe("file-space query keys", () => {
  it("lets a Files UI mutation invalidate the Data tree listing", () => {
    // The FileManager and the sidebar tree used to cache the same folder under
    // unrelated keys, so "New folder" updated the landing grid and left the
    // tree stale. They still cannot SHARE a cache entry (different shapes), but
    // they must share an invalidation prefix.
    const owner = spaceFileSpaceOwner(SPACE);
    const prefix = fileSpaceInvalidationKey(owner);
    const listing = fileSpaceListingQueryKey(owner, null);
    const drive = fileSpaceDriveQueryKey(owner, null);
    expect(listing.slice(0, prefix.length)).toEqual([...prefix]);
    expect(drive.slice(0, prefix.length)).toEqual([...prefix]);
    expect(listing).not.toEqual(drive);
  });
});

describe("fileSpaceOwnerPath", () => {
  it("encodes an owner id so it cannot address another file space", () => {
    // The id arrives from a route parameter; a raw slash would silently walk
    // to a different space.
    expect(fileSpaceOwnerPath({ id: "a/b", type: "project" })).toBe(
      "project/a%2Fb"
    );
  });
});

describe("data roots and their children (PLAN-space-data.md D1)", () => {
  it("puts every mounted module's root at the top level, lazily", () => {
    const nodes = buildSpaceDrive({
      dataRoots: [
        { label: "Offers", moduleId: "offers", root: "Offers" },
        { label: "Contacts", moduleId: "contacts", root: "Contacts" },
      ],
      spaceId: "s1",
    });
    expect(nodes.map((node) => node.name)).toEqual(["Contacts", "Offers"]);
    // A disclosure triangle and no children: the tree fetches on open, because
    // reading every module's rows to draw the first screen would make this a
    // store rather than a view.
    expect(nodes[0]?.hasChildren).toBe(true);
    expect(nodes[0]?.children).toBeUndefined();
    expect(nodes[0]?.dataPath).toBe("Contacts");
  });

  it("carries a root's declared type onto its node", () => {
    const nodes = buildSpaceDrive({
      dataRoots: [
        {
          label: "Contacts",
          moduleId: "contacts",
          root: "Contacts",
          rootNodeType: "contacts.root",
        },
        { label: "Files", moduleId: "files", root: "Files" },
      ],
      spaceId: "s1",
    });
    expect(nodes[0]?.nodeType).toBe("contacts.root");
    expect(nodes[1]).not.toHaveProperty("nodeType");
  });

  it("takes the server's paths AS GIVEN, joining nothing", () => {
    // The server roots every path before it leaves the HTTP boundary. Joining
    // again here is how `Contacts/People` once became
    // `Contacts/People/People/anna.md`, and how a save once 404'd on a folder
    // called `draft`.
    const nodes = spaceDataChildNodes({
      entries: [
        {
          kind: "record",
          name: "anna__42.contact.md",
          path: "Contacts/People/anna__42.contact.md",
          recordId: "42",
          version: "2026-08-14T10:00:00Z",
        },
      ],
      folders: [{ name: "People", path: "Contacts/People" }],
      moduleId: "contacts",
      parentPath: "Contacts/People",
    });
    expect(nodes.map((node) => node.dataPath)).toEqual([
      "Contacts/People",
      "Contacts/People/anna__42.contact.md",
    ]);
  });

  it("carries a folder's declared type so the pane can key a renderer on it", () => {
    const [folder] = spaceDataChildNodes({
      folders: [
        {
          name: "People",
          nodeType: "contacts.folder",
          path: "Contacts/People",
        },
      ],
      moduleId: "contacts",
      parentPath: "Contacts",
    });
    expect(folder?.nodeType).toBe("contacts.folder");
  });

  it("carries a connected folder's connection onto the data-tree row", () => {
    const [folder] = spaceDataChildNodes({
      folders: [
        {
          connectionId: "cnx-1",
          name: "deploy",
          nodeType: "files.mount",
          path: "Files/deploy",
        },
      ],
      moduleId: "files",
      parentPath: "Files",
    });
    expect(folder?.connectionId).toBe("cnx-1");
    expect(folder?.nodeType).toBe("files.mount");
  });

  it("carries mime type and size onto file records", () => {
    const [node] = spaceDataChildNodes({
      entries: [
        {
          kind: "record",
          mimeType: "text/markdown",
          name: "index__abc.md",
          path: "Files/engrd/index__abc.md",
          recordId: "abc",
          sizeBytes: 42,
          title: "index.md",
          version: "v",
        },
      ],
      moduleId: "files",
      parentPath: "Files/engrd",
    });
    expect(node?.mimeType).toBe("text/markdown");
    expect(node?.name).toBe("index.md");
    expect(node?.sizeBytes).toBe(42);
  });

  it("leaves nodeType absent on an untyped folder rather than empty", () => {
    // An empty string would look like a declared type to every `?.` downstream
    // and would resolve to the surface `spaces.data.folder:`.
    const [folder] = spaceDataChildNodes({
      folders: [{ name: "Inbox", path: "Files/Inbox" }],
      moduleId: "files",
      parentPath: "Files",
    });
    expect(folder).not.toHaveProperty("nodeType");
  });

  it("carries the version onto record nodes so a write can present it", () => {
    const [node] = spaceDataChildNodes({
      entries: [
        {
          kind: "bundle",
          name: "relaunch__7.offer",
          path: "Offers/draft/relaunch__7.offer",
          recordId: "7",
          updatedAt: "2026-08-14T10:00:00Z",
          version: "2026-08-14T10:00:00Z",
        },
      ],
      moduleId: "offers",
      parentPath: "Offers/draft",
    });
    expect(node?.version).toBe("2026-08-14T10:00:00Z");
    expect(node?.kind).toBe("bundle");
    expect(node?.moduleId).toBe("offers");
  });

  it("sorts folders above bundles above records", () => {
    const nodes = spaceDataChildNodes({
      entries: [
        {
          kind: "record",
          name: "a__1.contact.md",
          path: "Root/a__1.contact.md",
          recordId: "1",
          version: "v",
        },
        {
          kind: "bundle",
          name: "b__2.offer",
          path: "Root/b__2.offer",
          recordId: "2",
          version: "v",
        },
      ],
      folders: [{ name: "Zzz", path: "Root/Zzz" }],
      moduleId: "m",
      parentPath: "Root",
    });
    expect(nodes.map((node) => node.kind)).toEqual([
      "folder",
      "bundle",
      "record",
    ]);
  });
});

describe("reference files render as the record they point at (D5)", () => {
  it("shows a .ref.json as a record, labelled without the extension", () => {
    const [node] = spaceFolderChildNodes({
      files: [
        {
          folderId: null,
          id: "f1",
          name: "Relaunch offer.ref.json",
        },
      ],
      owner: spaceDriveRootOwner(SPACE),
    });
    // The reader clicked a shortcut to an offer and should see an offer, not
    // the JSON that names it.
    expect(node?.kind).toBe("record");
    expect(node?.name).toBe("Relaunch offer");
    expect(node?.isReference).toBe(true);
    // The bytes are still a file in the file space — resolving the pointer is
    // the click's job, so the node keeps the FILE's id.
    expect(node?.sourceId).toBe("f1");
  });

  it("leaves an ordinary file alone", () => {
    const [node] = spaceFolderChildNodes({
      files: [{ folderId: null, id: "f2", name: "brief.pdf" }],
      owner: spaceDriveRootOwner(SPACE),
    });
    expect(node?.kind).toBe("file");
    expect(node?.isReference).toBeUndefined();
  });
});

describe("a real tree: every container can be opened", () => {
  it("marks folders, mounts and projects expandable and carries their file space", () => {
    const fileSpace = spaceFolderChildNodes({
      folders: [
        { id: "d1", name: "Research", parentId: null },
        { connectionId: "cnx-1", id: "d2", name: "Shared", parentId: null },
      ],
      owner: spaceDriveRootOwner(SPACE),
    });
    const nodes = buildSpaceDrive({
      projects: [{ id: "pr1", title: "Relaunch" }],
      spaceId: SPACE,
    });
    const research = fileSpace.find((node) => node.name === "Research");
    const shared = fileSpace.find((node) => node.name === "Shared");
    const project = nodes
      .find((node) => node.name === "Projects")
      ?.children?.find((node) => node.name === "Relaunch");

    // Without an owner on the node, opening a folder could only guess which
    // file space it belongs to — and would guess wrong inside a project.
    expect(research?.hasChildren).toBe(true);
    expect(research?.owner).toEqual(spaceFileSpaceOwner(SPACE));
    expect(shared?.hasChildren).toBe(true);
    expect(shared?.owner).toEqual(spaceFileSpaceOwner(SPACE));
    expect(project?.hasChildren).toBe(true);
    expect(project?.owner).toEqual(projectFileSpaceOwner("pr1"));
  });

  it("builds a folder's children the same way it builds the root", () => {
    const owner = projectFileSpaceOwner("pr1");
    const nodes = spaceFolderChildNodes({
      files: [
        {
          folderId: "d1",
          id: "f1",
          mimeType: "application/pdf",
          name: "b.pdf",
          sizeBytes: 12,
        },
      ],
      folders: [{ id: "d2", name: "Deep", parentId: "d1" }],
      owner,
    });
    expect(kindsOf(nodes)).toEqual(["folder:Deep", "file:b.pdf"]);
    // The owner travels DOWN: a folder three levels inside a project still
    // knows whose file space it is in.
    expect(nodes.every((node) => node.owner === owner)).toBe(true);
    const file = nodes.find((node) => node.kind === "file");
    expect(file?.mimeType).toBe("application/pdf");
    expect(file?.sizeBytes).toBe(12);
  });

  it("carries the file space onto a nested reference file too", () => {
    const [node] = spaceFolderChildNodes({
      files: [{ folderId: "d1", id: "f1", name: "Kunde.ref.json" }],
      owner: spaceFileSpaceOwner(SPACE),
    });
    expect(node?.kind).toBe("record");
    expect(node?.isReference).toBe(true);
  });
});

describe("a folder's index is the folder, not a row inside it", () => {
  it("keeps index.article.md out of the tree while the listing still carries it", () => {
    const nodes = spaceDataChildNodes({
      entries: [
        {
          kind: "record",
          name: "index.article.md",
          path: "Knowledge/base__k1/cat__c1/setup__a1.article/index.article.md",
          recordId: "a1",
          title: "Setup",
          version: "v1",
        },
        {
          kind: "record",
          name: "step-one__a2.article.md",
          path: "Knowledge/base__k1/cat__c1/setup__a1.article/step-one__a2.article.md",
          recordId: "a2",
          title: "Step one",
          version: "v1",
        },
      ],
      moduleId: "knowledge-base",
      parentPath: "Knowledge/base__k1/cat__c1/setup__a1.article",
    });
    // The folder row above already stands for `a1`; listing it again would put
    // the same page inside itself.
    expect(nodes.map((node) => node.name)).toEqual(["Step one"]);
  });

  it("shows the record's TITLE, not its file name", () => {
    const [node] = spaceDataChildNodes({
      entries: [
        {
          kind: "record",
          name: "sicherheit-an-bord__a4.article.md",
          path: "Knowledge/base__k1/cat__c1/sicherheit-an-bord__a4.article.md",
          recordId: "a4",
          title: "Sicherheit an Bord",
          version: "v1",
        },
      ],
      moduleId: "knowledge-base",
      parentPath: "Knowledge/base__k1/cat__c1",
    });
    expect(node?.name).toBe("Sicherheit an Bord");
  });

  it("falls back to the file name for an adapter that sends no title", () => {
    const [node] = spaceDataChildNodes({
      entries: [
        {
          kind: "record",
          name: "contacts.csv",
          path: "Contacts/contacts.csv",
          recordId: "collection",
          version: "",
        },
      ],
      moduleId: "contacts",
      parentPath: "Contacts",
    });
    expect(node?.name).toBe("contacts.csv");
  });
});

describe("mixed artifacts", () => {
  it("nests folder children and stamps markdown type for the page icon", () => {
    const nodes = buildSpaceDrive({
      artifacts: [
        { id: "f1", parentId: null, title: "Briefs", type: "folder" },
        {
          id: "m1",
          parentId: "f1",
          title: "Q3",
          type: "markdown",
        },
        { id: "h1", parentId: null, title: "Report", type: "html" },
      ],
      spaceId: SPACE,
    });
    expect(kindsOf(nodes)).toEqual(["folder:Briefs", "artifact:Report"]);
    const briefs = nodes.find((node) => node.name === "Briefs");
    expect(briefs?.nodeType).toBe("folder");
    expect(
      briefs?.children?.map((child) => `${child.kind}:${child.name}`)
    ).toEqual(["artifact:Q3"]);
    expect(briefs?.children?.[0]?.nodeType).toBe("markdown");
    expect(nodes.find((node) => node.name === "Report")?.nodeType).toBe("html");
  });
});
