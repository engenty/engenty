/**
 * A record or bundle in the pane.
 *
 * The document is read FIRST and the renderer chosen from it, because the node
 * type — the only key that tells contacts from offers — is on the document,
 * not on the tree node. One extra thing the pane already fetched, not an extra
 * fetch.
 *
 * A module that contributed a view gets the pane to itself, chrome included;
 * otherwise the file is shown, which is the same text an agent reads through
 * `/data`.
 */
import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import type { SpaceDataDocument } from "@engenty/plugin-sdk";
import { useQueryClient } from "@engenty/query-client";
import { Spinner } from "@engenty/ui-core";
import { useCallback, useMemo } from "react";
import { buildSpaceDataNodeSlice } from "@/lib/space-data-agent-context";
import {
  spaceDriveKeys,
  useSpaceDataDocument,
  useSpaceDrive,
} from "@/lib/space-drive-queries";
import { useMemberDraft } from "./member-draft";
import {
  DerivedBadge,
  MemberActions,
  MemberEditor,
  MemberEditorBody,
  MemberReport,
} from "./member-editor";
import { PaneChrome, useNodeBreadcrumbs } from "./pane-chrome";
import {
  SPACE_DATA_NODE_SLICE_ID,
  spaceDataNodeSurface,
  useSpaceDataSurfaceView,
} from "./surfaces";

export function NodeDetail({
  onClose,
  path,
  spaceId,
}: {
  onClose: () => void;
  path: string;
  spaceId: string;
}) {
  const { t } = useTranslation("common");
  const query = useSpaceDataDocument(spaceId, path);
  const document = query.data ?? null;
  // The MODULE's limits, resolved from the node's root — so the copilot is told
  // what it may do here, not only where "here" is (P3.5).
  const drive = useSpaceDrive(spaceId);
  const capabilities = drive.capabilitiesByRoot[path.split("/")[0] ?? ""];
  const View = useSpaceDataSurfaceView(
    document ? spaceDataNodeSurface(document.nodeType) : null
  );

  // Told to the copilot HERE rather than in the file fallback below, because a
  // node rendered by its own module (a contact, an offer) is just as open as
  // one shown as its file — and this is the one place that has read the
  // document either way.
  useRegisterAgentUiSlice(
    SPACE_DATA_NODE_SLICE_ID,
    useMemo(
      () => (document ? buildSpaceDataNodeSlice(document, capabilities) : null),
      [capabilities, document]
    )
  );

  if (query.isPending) {
    return (
      <PaneChrome onClose={onClose}>
        <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
          <Spinner className="size-4" />
          {t("spaces.data.loading")}
        </div>
      </PaneChrome>
    );
  }
  if (query.error || !document) {
    return (
      <PaneChrome onClose={onClose}>
        <div className="p-6">
          <p className="text-destructive text-sm">
            {query.error instanceof Error
              ? query.error.message
              : t("spaces.data.readFailed", {
                  defaultValue: "This node could not be read.",
                })}
          </p>
        </div>
      </PaneChrome>
    );
  }
  if (View) {
    return (
      <View
        params={{
          nodeType: document.nodeType,
          path: document.path,
          recordId: document.recordId,
          spaceId,
        }}
        surface={spaceDataNodeSurface(document.nodeType)}
      />
    );
  }
  // No PaneChrome wrapper here: the node publishes its OWN info and CTAs to the
  // topbar, and a parent writing `null` actions afterwards would delete them —
  // usePageConfig is last-writer-wins and a parent's layout effect runs last.
  return (
    <RecordFileDetail document={document} onClose={onClose} spaceId={spaceId} />
  );
}

/** Re-read the node and the listing that addressed it after a write. */
function useInvalidateNode(spaceId: string, path: string): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: spaceDriveKeys.dataDocument(spaceId, path),
    });
    // The listing carries the version too, so a save that did not refresh it
    // would leave the next write presenting a stale base version.
    void queryClient.invalidateQueries({
      queryKey: [...spaceDriveKeys.dataChildren(spaceId, "")].slice(0, -1),
    });
  }, [path, queryClient, spaceId]);
}

/**
 * One member IS the pane: its info and CTAs in the topbar, the editor below it
 * edge to edge.
 *
 * Split from the bundle case because the topbar carries ONE set of actions.
 * That is exactly right for a collection view or a note — the common case, and
 * the one that wants the whole window — and wrong for a bundle, where five
 * members each have their own Save.
 */
function SingleMemberPane({
  document,
  member,
  onClose,
  spaceId,
}: {
  document: SpaceDataDocument;
  member: SpaceDataDocument["members"][number];
  onClose: () => void;
  spaceId: string;
}) {
  const breadcrumbs = useNodeBreadcrumbs(document.path);
  const invalidate = useInvalidateNode(spaceId, document.path);
  const state = useMemberDraft({
    document: {
      name: document.name,
      path: document.path,
      version: document.version,
    },
    member,
    onSaved: invalidate,
    spaceId,
  });
  const derived = member.derived;
  const actions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {derived ? <DerivedBadge collection={state.collection} /> : null}
        <MemberActions state={state} />
      </div>
    ),
    [derived, state]
  );

  return (
    <PaneChrome actions={actions} breadcrumbs={breadcrumbs} onClose={onClose}>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <MemberReport className="px-4 pt-3" state={state} />
        <MemberEditorBody flush member={member} state={state} />
      </div>
    </PaneChrome>
  );
}

/** A bundle: every member stacked, each with its own header row and CTAs. */
function BundlePane({
  document,
  onClose,
  spaceId,
}: {
  document: SpaceDataDocument;
  onClose: () => void;
  spaceId: string;
}) {
  const breadcrumbs = useNodeBreadcrumbs(document.path);
  const invalidate = useInvalidateNode(spaceId, document.path);

  return (
    <PaneChrome breadcrumbs={breadcrumbs} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        {document.members.map((member) => (
          <MemberEditor
            document={{
              name: document.name,
              path: document.path,
              version: document.version,
            }}
            key={member.name}
            member={member}
            onSaved={invalidate}
            spaceId={spaceId}
          />
        ))}
      </div>
    </PaneChrome>
  );
}

/** The node as its file: frontmatter and members, editable, 409 shown. */
function RecordFileDetail({
  document,
  onClose,
  spaceId,
}: {
  document: SpaceDataDocument;
  onClose: () => void;
  spaceId: string;
}) {
  const [single] = document.members;
  if (single && document.members.length === 1) {
    return (
      <SingleMemberPane
        document={document}
        member={single}
        onClose={onClose}
        spaceId={spaceId}
      />
    );
  }
  return <BundlePane document={document} onClose={onClose} spaceId={spaceId} />;
}
