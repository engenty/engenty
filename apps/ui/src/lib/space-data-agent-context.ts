/**
 * What the copilot is told about the node the user has open in the Data pane.
 *
 * The shell's AG-UI snapshot carries the route and a selection id and nothing
 * else, and its `pathname` is the path WITHOUT the query string — so on
 * `/s/<key>/data?file=…&fs=…` every byte that identifies what is open was
 * missing, and `selection` came through empty because nothing in the app had
 * ever registered a slice. A copilot asked "what am I looking at?" could
 * honestly answer only "the Data page".
 *
 * These builders are that slice. Two things travel:
 *
 * 1. **Where it is, in the agent's own terms.** A data node's path under the
 *    `/data` mount (PLAN-space-data.md D4) is the address the agent reads and
 *    writes with, so `/data/Contacts/contacts.csv` turns "what is open" into
 *    something it can act on instead of something it has to ask about.
 * 2. **What it says, bounded.** An excerpt answers the ordinary question with
 *    no tool call; the rest stays one read away, and the excerpt says so.
 *
 * Every value is capped HERE rather than trusted to be small: the snapshot has
 * a 32 KB ceiling whose check throws, and it runs inside a `useMemo` during
 * render — an oversized slice is a blank screen, not a truncated prompt. The
 * harness truncates `page` values at 800 chars but does NOT truncate
 * `app_context`, so that cap has to be ours.
 */
import type { AgentUiStateSlice } from "@engenty/app-shell";
import { buildAgentUiPageBrief } from "@engenty/app-shell";
import { parseCsvMatrix, serializeCsvMatrix } from "@engenty/import";
import type { SpaceDataDocument, SpaceDataMember } from "@engenty/plugin-sdk";

/** The `/data` mount every space-scoped agent gets (`DATA_MOUNT_PATH`). */
const DATA_MOUNT_PATH = "/data";

/** What the owning module supports here, as the roots endpoint reports it. */
export interface SpaceDataCapabilitiesBrief {
  canCreate: boolean;
  canDelete: boolean;
  canMove: boolean;
  canWrite: boolean;
}

/**
 * The capabilities as one readable clause.
 *
 * A list of booleans in a prompt is something the model has to interpret; a
 * sentence naming what is possible AND what is not is something it can act on.
 * The negative half matters most — "records here are not created or deleted
 * from the tree" is the sentence that stops an agent trying.
 */
function describeCapabilities(input: SpaceDataCapabilitiesBrief): string {
  const can = [
    input.canWrite ? "edit" : null,
    input.canCreate ? "create folders" : null,
    input.canMove ? "rename and move" : null,
    input.canDelete ? "delete" : null,
  ].filter((value): value is string => value !== null);
  const cannot = [
    input.canCreate ? null : "create",
    input.canMove ? null : "rename or move",
    input.canDelete ? null : "delete",
  ].filter((value): value is string => value !== null);
  return [
    can.length > 0 ? `Here you can ${can.join(", ")}.` : "This is read-only.",
    cannot.length > 0
      ? `You cannot ${cannot.join(" or ")} here from the tree — that is the module's own action.`
      : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" ");
}

/** One document's worth of text. Well under the snapshot ceiling. */
export const SPACE_DATA_EXCERPT_MAX_CHARS = 1600;
/** Per member of a bundle, where five of them share the budget. */
export const SPACE_DATA_MEMBER_EXCERPT_MAX_CHARS = 400;
/** Rows of a CSV worth showing before the agent should just read the file. */
export const SPACE_DATA_CSV_PREVIEW_ROWS = 20;

export function isSpaceDataCsvContentType(contentType: string): boolean {
  return /^text\/(csv|tab-separated-values)/.test(contentType);
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max).trimEnd()}\n… (truncated)`;
}

/**
 * A bounded excerpt of one member.
 *
 * A CSV is cut by ROWS, not by characters: a byte cut lands mid-record and
 * hands the agent a broken last row, and the header is the part that makes
 * every other row readable — so it is always the first thing kept. The row
 * count that was dropped is stated, because an agent that cannot tell a
 * complete file from a truncated one will answer "there are 20 contacts".
 */
export function spaceDataAgentExcerpt(
  content: string,
  contentType: string,
  max = SPACE_DATA_EXCERPT_MAX_CHARS
): string {
  if (isSpaceDataCsvContentType(contentType)) {
    const matrix = parseCsvMatrix(content);
    if (matrix.columns.length > 0) {
      const omitted = Math.max(
        0,
        matrix.rows.length - SPACE_DATA_CSV_PREVIEW_ROWS
      );
      const body = serializeCsvMatrix({
        ...matrix,
        rows: matrix.rows.slice(0, SPACE_DATA_CSV_PREVIEW_ROWS),
      });
      return truncate(
        omitted > 0 ? `${body}… (${omitted} more rows)` : body,
        max
      );
    }
  }
  return truncate(content, max);
}

/**
 * The module that owns a node type — `contacts.contact` → `contacts`.
 *
 * This becomes `selection.entity_type`, which the prompt builder reads FIRST
 * when it resolves `page_module` (`resolveCurrentPageModule`). So the value has
 * to be the MODULE ID, not the entity's own name: the skill catalog and the
 * tool contracts are keyed by module id, and `contacts.contact` there would
 * send every module-scoped lookup after something nobody ships.
 */
export function spaceDataModuleIdOfNodeType(
  nodeType: string
): string | undefined {
  const [moduleId] = nodeType.split(".");
  return moduleId && moduleId.length > 0 ? moduleId : undefined;
}

function memberSummary(
  member: SpaceDataMember
): Record<string, string | boolean> {
  return {
    content_type: member.contentType,
    derived: member.derived,
    editable: member.editable,
    name: member.name,
  };
}

/**
 * The slice for a record or bundle open in the pane.
 *
 * `data_agent_path` is the point of the whole thing: it is what the agent
 * types. Everything else is what saves it a round trip.
 */
export function buildSpaceDataNodeSlice(
  document: SpaceDataDocument,
  capabilities?: SpaceDataCapabilitiesBrief
): AgentUiStateSlice {
  const agentPath = `${DATA_MOUNT_PATH}/${document.path}`;
  const single =
    document.members.length === 1 ? document.members[0] : undefined;
  const excerptBudget = single
    ? SPACE_DATA_EXCERPT_MAX_CHARS
    : SPACE_DATA_MEMBER_EXCERPT_MAX_CHARS;
  const excerpt = document.members
    .map(
      (member) =>
        `--- ${member.name} (${member.contentType}${member.derived ? ", derived" : ""})\n${spaceDataAgentExcerpt(member.content, member.contentType, excerptBudget)}`
    )
    .join("\n\n");

  return {
    app_context: [
      {
        description: `The document the user has open in the space Data pane, readable in full at ${agentPath}`,
        value: excerpt,
      },
    ],
    page: {
      ...buildAgentUiPageBrief({
        page_description: `Space data ${document.kind} "${document.name}" (${document.nodeType}) is open in the Data pane. The agent reads and writes it at ${agentPath}.`,
        page_title: document.name,
        page_type: "detail",
      }),
      data_agent_path: agentPath,
      data_kind: document.kind,
      data_members: document.members.map(memberSummary),
      data_node_type: document.nodeType,
      data_path: document.path,
      data_record_id: document.recordId,
      // The version the pane read. A write that quotes a different one is the
      // 409 the whole design exists to produce, so the agent should know which
      // one the human is looking at — but a COLLECTION view has no single
      // version, and an empty string reads as one rather than as none.
      ...(document.version ? { data_version: document.version } : {}),
      // What the agent MAY do here, not just where it is (P3.5).
      //
      // The path alone tells it the address; without this it has to discover
      // the module's limits by attempting them, which is exactly the
      // find-out-by-trying the protocol refuses everywhere else. Stated as a
      // sentence rather than flags because it lands in a prompt.
      ...(capabilities
        ? { data_capabilities: describeCapabilities(capabilities) }
        : {}),
    },
    selection: {
      entity_id: document.recordId,
      entity_type: spaceDataModuleIdOfNodeType(document.nodeType),
    },
  };
}

/**
 * The slice for a FILE in the tree — bytes in the space's file space.
 *
 * No agent path here on purpose. A file space is a `module_files` tree keyed by
 * `(tenant, owner_type, owner_id)`, not the workspace storage prefix behind
 * `/space`, and pointing the agent at a path that resolves to nothing is worse
 * than pointing it at nothing at all. Identity and an excerpt are honest.
 */
export function buildSpaceDataFileSlice({
  fileId,
  folderName,
  mimeType,
  name,
  sizeBytes,
}: {
  fileId: string;
  folderName?: string | null;
  mimeType: string;
  name: string;
  sizeBytes?: number | null;
}): AgentUiStateSlice {
  return {
    page: {
      ...buildAgentUiPageBrief({
        page_description: `File "${name}" (${mimeType || "unknown type"}) from the space's files is open in the Data pane.`,
        page_title: name,
        page_type: "detail",
      }),
      file_id: fileId,
      file_mime_type: mimeType,
      file_name: name,
      ...(folderName ? { file_folder: folderName } : {}),
      ...(typeof sizeBytes === "number" ? { file_size_bytes: sizeBytes } : {}),
    },
    selection: { entity_id: fileId },
  };
}

/**
 * The open file's text, as a separate slice.
 *
 * Separate because the bytes are fetched a level below the row that names them
 * — and because slices merge, so the identity is published the moment the file
 * opens rather than waiting on a download that may still be in flight or may
 * never happen (an image, a PDF, something too large to preview).
 */
export function buildSpaceDataFileTextSlice({
  mimeType,
  name,
  text,
}: {
  mimeType: string;
  name: string;
  text: string;
}): AgentUiStateSlice {
  return {
    app_context: [
      {
        description: `The contents of "${name}", the file the user has open in the space Data pane`,
        value: spaceDataAgentExcerpt(text, mimeType),
      },
    ],
  };
}

/**
 * The slice for a space-scoped ARTIFACT open in the pane.
 *
 * An `app` artifact's content is a handle, not a document — excerpting its
 * JSON would tell the agent three ids and nothing it can use, so the context
 * SAYS it is a running App and names it; the `app_id` is what the App tooling
 * (`app_list`, `app_file_write`, `app_build`) takes. A text artifact excerpts
 * like any file.
 *
 * `selection.entity_type` stays empty on purpose: the prompt builder reports it
 * as `page_module` (see {@link spaceDataModuleIdOfNodeType}), and an artifact
 * belongs to the AI plane, not to a module — naming one here would point every
 * module-scoped lookup at something nobody ships.
 */
export function buildSpaceDataArtifactSlice({
  artifactId,
  content,
  title,
  type,
  version,
}: {
  artifactId: string;
  content: string | null;
  title: string;
  type: string;
  version: number;
}): AgentUiStateSlice {
  let appId: string | undefined;
  if (type === "app" && content) {
    try {
      const handle = JSON.parse(content) as { app_id?: unknown };
      appId = typeof handle.app_id === "string" ? handle.app_id : undefined;
    } catch {
      appId = undefined;
    }
  }

  return {
    app_context:
      type === "app"
        ? [
            {
              description:
                "The artifact the user has open in the space Data pane",
              value: `"${title}" is a running engenty App shown in the pane${appId ? ` (app_id ${appId})` : ""}. Its source lives in the Apps module, not in this artifact — use the App tools to read or change it.`,
            },
          ]
        : content
          ? [
              {
                description:
                  "The artifact the user has open in the space Data pane",
                value: spaceDataAgentExcerpt(content, ""),
              },
            ]
          : [],
    page: {
      ...buildAgentUiPageBrief({
        page_description: `Artifact "${title}" (${type}, v${version}) stored in this space is open in the Data pane.`,
        page_title: title,
        page_type: "detail",
      }),
      artifact_id: artifactId,
      artifact_type: type,
      artifact_version: version,
      ...(appId ? { app_id: appId } : {}),
    },
    selection: { entity_id: artifactId },
  };
}
