/**
 * One HTTP client for the space Data endpoints, shared by both faces.
 *
 * There are two consumers and they must not drift: the files-sdk adapter that
 * backs sandbox STAGING (D6, an object-shaped read-through cache, which is
 * genuinely what that path wants) and `SpaceDataFilesystem`, the agent's `/data`
 * mount. The thing they must agree on is not the shape of a listing — it is the
 * shape of a REFUSAL, and there are two the caller has to act on differently:
 *
 * - **202 `approval_required`** arrives with `ok: false` and 202 is INSIDE
 *   `response.ok`. Read as success it tells the agent the record changed while
 *   a human is still being asked, and the agent moves on from a write that
 *   never landed.
 * - **409 `data_conflict`** means re-read and re-apply, not "write failed".
 *
 * Both are answers. Collapsing either into a generic error is how an agent ends
 * up retrying a write a person deliberately paused.
 */

/** A refusal from the data plane, kept as an ERROR the agent can read. */
export class SpaceDataRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SpaceDataRequestError";
    this.status = status;
  }
}

export interface SpaceDataMember {
  content: string;
  contentType: string;
  derived: boolean;
  editable: boolean;
  encoding: "base64" | "utf8";
  name: string;
}

export interface SpaceDataDocumentDto {
  kind: "bundle" | "record";
  members: SpaceDataMember[];
  name: string;
  nodeType: string;
  path: string;
  recordId: string;
  updatedAt?: string;
  version: string;
}

export interface SpaceDataEntryDto {
  kind: "bundle" | "record";
  name: string;
  path: string;
  recordId: string;
  title?: string;
  updatedAt?: string;
  version: string;
}

export interface SpaceDataListingDto {
  entries: SpaceDataEntryDto[];
  folders: Array<{ name: string; nodeType?: string; path: string }>;
  self?: { name: string; nodeType?: string; path: string };
  truncated?: boolean;
}

export interface SpaceDataRootDto {
  label: string;
  moduleId: string;
  root: string;
  writable: boolean;
}

export interface SpaceDataClientOptions {
  accessToken: string;
  /**
   * The agent's `core.agents` principal uuid, forwarded so a gated write
   * escalates to an approval. NOT the AI-plane agent key — core matches it
   * against uuid grant columns and a key fails the query outright.
   */
  agentId?: string;
  coreBaseUrl: string;
  fetchImpl?: typeof fetch;
  spaceId: string;
}

export interface SpaceDataClient {
  create: (input: {
    content?: string;
    kind: "folder" | "node";
    name: string;
    parentPath: string;
  }) => Promise<SpaceDataDocumentDto>;
  list: (path: string) => Promise<SpaceDataListingDto>;
  move: (input: {
    baseVersion?: string;
    newName?: string;
    path: string;
    toParentPath?: string;
  }) => Promise<SpaceDataDocumentDto>;
  read: (path: string) => Promise<SpaceDataDocumentDto>;
  remove: (input: {
    path: string;
    recursive?: boolean;
  }) => Promise<{ deleted: true }>;
  roots: () => Promise<SpaceDataRootDto[]>;
  write: (input: {
    baseVersion: string;
    content: string;
    member?: string;
    path: string;
  }) => Promise<SpaceDataDocumentDto>;
}

export function createSpaceDataClient(
  options: SpaceDataClientOptions
): SpaceDataClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = `${options.coreBaseUrl.replace(/\/$/, "")}/api/spaces/${encodeURIComponent(
    options.spaceId
  )}/data`;

  async function call<T>(
    path: string,
    init?: { body?: unknown; method?: string }
  ): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      headers: {
        authorization: `Bearer ${options.accessToken}`,
        "content-type": "application/json",
        // Same header the tool lane forwards. It only ever ADDS an approval
        // requirement — the token's own capabilities remain the ceiling.
        ...(options.agentId ? { "x-engenty-agent-id": options.agentId } : {}),
      },
      method: init?.method ?? "GET",
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const payload = (await response.json().catch(() => null)) as {
      approvalRequestId?: string;
      code?: string;
      data?: unknown;
      error?: { code?: string; message?: string };
      message?: string;
      ok?: boolean;
      status?: string;
    } | null;
    if (payload?.status === "approval_required") {
      throw new SpaceDataRequestError(
        202,
        "approval_required",
        `A human has been asked to approve this change; it is not applied yet.${
          payload.approvalRequestId
            ? ` (request ${payload.approvalRequestId})`
            : ""
        }`
      );
    }
    if (!response.ok) {
      // An adapter's own refusal arrives FLAT (`{code, message}`) because it
      // travels through `invokeOperation`'s error passthrough, while core's own
      // refusals are wrapped in `{ok:false, error:{…}}`. Both shapes are real,
      // so both are read — a 409 that lost its code would read as a plain
      // failure and the agent would retry instead of re-reading.
      throw new SpaceDataRequestError(
        response.status,
        payload?.error?.code ?? payload?.code ?? `http_${response.status}`,
        payload?.error?.message ??
          payload?.message ??
          `space data request failed with ${response.status}`
      );
    }
    return (payload?.data ?? payload) as T;
  }

  return {
    create: (input) =>
      call<SpaceDataDocumentDto>("/create", {
        body: {
          kind: input.kind,
          name: input.name,
          parent_path: input.parentPath,
          ...(input.content === undefined ? {} : { content: input.content }),
        },
        method: "POST",
      }),

    list: (path) =>
      call<SpaceDataListingDto>(`/list?path=${encodeURIComponent(path)}`),

    move: (input) =>
      call<SpaceDataDocumentDto>("/move", {
        body: {
          path: input.path,
          ...(input.baseVersion ? { base_version: input.baseVersion } : {}),
          ...(input.newName ? { new_name: input.newName } : {}),
          ...(input.toParentPath === undefined
            ? {}
            : { to_parent_path: input.toParentPath }),
        },
        method: "POST",
      }),

    read: (path) =>
      call<SpaceDataDocumentDto>(`/read?path=${encodeURIComponent(path)}`),

    remove: (input) =>
      call<{ deleted: true }>("/delete", {
        body: {
          path: input.path,
          ...(input.recursive === undefined
            ? {}
            : { recursive: input.recursive }),
        },
        method: "DELETE",
      }),

    roots: () => call<SpaceDataRootDto[]>("/roots"),

    write: (input) =>
      call<SpaceDataDocumentDto>("/write", {
        body: {
          base_version: input.baseVersion,
          content: input.content,
          path: input.path,
          ...(input.member ? { member: input.member } : {}),
        },
        method: "PUT",
      }),
  };
}
