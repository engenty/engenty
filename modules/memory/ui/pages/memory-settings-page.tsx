// /settings/memory — each memory scope reads and edits as ONE continuous
// document (MEMORY.md experience) while module_memory.records stays the
// source of truth. Tabs: Profile (Mastra working-memory viewer, reset only) ·
// My memory · Projects · Organization (approval queue) · Entities.
//
// Save = diff-sync: walk the doc, diff against the loaded snapshot, emit
// create/update/archive ops. A concurrent agent write 409s (stale updated_at
// token) → toast + reload-merge. Live-cache refreshes the doc only while the
// editor is clean; a dirty editor gets a "changed underneath" hint instead.
import {
  parseWorkingMemoryProfile,
  useResetWorkingMemoryMutation,
  useWorkingMemoryQuery,
} from "@engenty/ai-ui/embed";
import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import type { JSONContent } from "@engenty/tiptap-editor";
import { RichEditor } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import {
  Badge,
  Button,
  Card,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Check, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  diffMemoryDoc,
  projectRecordsToDoc,
} from "../../src/services/memory-doc.js";
import type { MemoryRecord } from "../api.js";
import { MemoryConflictError, type MemoryScopeQuery } from "../api.js";
import { MemoryRecordNode } from "../doc/memory-record-node.js";
import { blocksToDocJson, docJsonToBlocks } from "../doc/tiptap-doc.js";
import {
  useApproveMemoryMutation,
  useRejectMemoryMutation,
  useSaveMemoryDocMutation,
  useScopeRecordsQuery,
  useScopeRefsQuery,
} from "../queries.js";
import "../memory-doc.css";

/* ── Profile tab: the Mastra working-memory viewer, unchanged (reset only) ── */

function labelize(key: string): string {
  return key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function ProfileTab() {
  const { t } = useTranslation("memory");
  const memoryQuery = useWorkingMemoryQuery();
  const resetMutation = useResetWorkingMemoryMutation();
  const raw = memoryQuery.data?.working_memory ?? null;
  const profile = parseWorkingMemoryProfile(raw);
  const entries = profile
    ? Object.entries(profile).filter(([, value]) =>
        Array.isArray(value)
          ? value.length > 0
          : value != null && String(value).trim() !== ""
      )
    : [];
  const isEmpty = !raw?.trim() || entries.length === 0;
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t("profile.subtitle", {
            defaultValue:
              "The always-in-context profile the assistant maintains about you. It updates itself; reset is the only edit.",
          })}
        </p>
        <Button
          className="gap-1.5 text-destructive hover:bg-destructive/10"
          disabled={resetMutation.isPending || isEmpty}
          onClick={() => resetMutation.mutate()}
          size="sm"
          variant="outline"
        >
          {resetMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {t("profile.reset", { defaultValue: "Reset" })}
        </Button>
      </div>
      {memoryQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      ) : isEmpty ? (
        <p className="text-muted-foreground text-sm">
          {t("profile.empty", { defaultValue: "No profile yet." })}
        </p>
      ) : (
        entries.map(([key, value]) => (
          <div className="rounded-lg border bg-card p-3" key={key}>
            <h4 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {labelize(key)}
            </h4>
            <div className="text-foreground text-sm">
              {Array.isArray(value) ? value.join(", ") : String(value)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ── One scope as one editable document ── */

function ScopeDocEditor({
  canEdit,
  scope,
  showApprovals,
}: {
  canEdit: boolean;
  scope: MemoryScopeQuery;
  showApprovals: boolean;
}) {
  const { t } = useTranslation("memory");
  const recordsQuery = useScopeRecordsQuery(scope);
  const saveMutation = useSaveMemoryDocMutation(scope);
  const approveMutation = useApproveMemoryMutation(scope);
  const rejectMutation = useRejectMemoryMutation(scope);

  const [dirty, setDirty] = useState(false);
  const currentJsonRef = useRef<JSONContent | null>(null);
  // The snapshot the current editor session loaded — diff target and the
  // reference for "memory changed underneath".
  const [loadedVersion, setLoadedVersion] = useState(0);
  const loadedRecordsRef = useRef<MemoryRecord[]>([]);

  const records = recordsQuery.data ?? [];
  const dataVersion = recordsQuery.dataUpdatedAt;

  // While the editor is clean, follow live data (remount via key). While
  // dirty, freeze the editor and show a hint when data moved underneath.
  const editorVersion = dirty ? loadedVersion : dataVersion;
  if (!dirty && loadedVersion !== dataVersion) {
    loadedRecordsRef.current = records;
    setLoadedVersion(dataVersion);
  }
  const changedUnderneath = dirty && dataVersion !== loadedVersion;

  const initialJson = useMemo(
    () => blocksToDocJson(projectRecordsToDoc(loadedRecordsRef.current)),
    // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt per loaded snapshot version
    [editorVersion]
  );

  const snapshotBlocks = useMemo(
    () =>
      projectRecordsToDoc(loadedRecordsRef.current).flatMap((s) => s.blocks),
    // biome-ignore lint/correctness/useExhaustiveDependencies: same snapshot identity
    [editorVersion]
  );

  const onChange = useCallback((json: JSONContent) => {
    currentJsonRef.current = json;
    setDirty(true);
  }, []);

  const onSave = useCallback(async () => {
    const json = currentJsonRef.current;
    if (!json) {
      setDirty(false);
      return;
    }
    const ops = diffMemoryDoc(docJsonToBlocks(json), snapshotBlocks);
    if (ops.length === 0) {
      setDirty(false);
      return;
    }
    try {
      await saveMutation.mutateAsync(ops);
      setDirty(false);
      toast.success(t("doc.saved", { defaultValue: "Memory saved" }));
    } catch (error) {
      if (error instanceof MemoryConflictError) {
        toast.error(
          t("doc.conflict", {
            defaultValue:
              "An agent updated this memory while you were editing — reloaded with the latest state. Please re-apply your edit.",
          })
        );
        setDirty(false);
        await recordsQuery.refetch();
        return;
      }
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  }, [recordsQuery, saveMutation, snapshotBlocks, t]);

  const proposed = records.filter((record) => record.status === "proposed");

  if (recordsQuery.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("loading", { defaultValue: "Loading…" })}
      </p>
    );
  }
  if (recordsQuery.isError) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("doc.noAccess", {
          defaultValue: "You don't have access to this memory scope.",
        })}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {showApprovals && proposed.length > 0 ? (
        <Card className="border-amber-500/50 bg-amber-500/5 px-4 py-3">
          <h3 className="mb-2 font-semibold text-sm">
            {t("doc.proposals", { defaultValue: "Pending proposals" })}
          </h3>
          <div className="space-y-2">
            {proposed.map((record) => (
              <div
                className="flex items-center justify-between gap-3"
                key={record.id}
              >
                <div className="min-w-0">
                  <span className="font-medium text-sm">{record.title}</span>
                  <span className="ml-2 text-muted-foreground text-xs">
                    {record.agent_type_key ?? record.source_kind}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate(record.id)}
                    size="sm"
                    variant="outline"
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    {t("doc.approve", { defaultValue: "Approve" })}
                  </Button>
                  <Button
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate(record.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    {t("doc.reject", { defaultValue: "Reject" })}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {changedUnderneath ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
          <span>
            {t("doc.changedUnderneath", {
              defaultValue:
                "Memory changed underneath while you were editing — your edit is preserved.",
            })}
          </span>
          <Button
            onClick={() => {
              setDirty(false);
              currentJsonRef.current = null;
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            {t("doc.reload", { defaultValue: "Discard & reload" })}
          </Button>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card">
        <RichEditor
          content={initialJson}
          editable={canEdit}
          editorContentClassName="min-h-[16rem] px-4 py-3"
          extensions={[MemoryRecordNode]}
          key={`${scope.scope_kind}:${scope.scope_ref ?? ""}:${editorVersion}`}
          onChange={onChange}
          showToolbar={false}
          slashCommands={false}
        />
      </div>

      {canEdit ? (
        <div className="flex items-center justify-end gap-2">
          {dirty ? (
            <span className="text-muted-foreground text-xs">
              {t("doc.unsaved", { defaultValue: "Unsaved changes" })}
            </span>
          ) : null}
          <Button
            disabled={!dirty || saveMutation.isPending}
            onClick={() => void onSave()}
            size="sm"
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {t("doc.save", { defaultValue: "Save" })}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("doc.readOnly", { defaultValue: "Read-only" })}
        </p>
      )}
    </div>
  );
}

/* ── Ref picker for project / entity scopes ── */

function RefPicker({
  onSelect,
  scopeKind,
  selected,
}: {
  onSelect: (ref: string) => void;
  scopeKind: "project" | "entity";
  selected: string | null;
}) {
  const { t } = useTranslation("memory");
  const refsQuery = useScopeRefsQuery(scopeKind);
  const refs = refsQuery.data ?? [];
  if (refsQuery.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("loading", { defaultValue: "Loading…" })}
      </p>
    );
  }
  if (refs.length === 0 && !selected) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("refs.empty", {
          defaultValue:
            "No memories in this scope yet — agents create them as they work.",
        })}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {[...new Set([...(selected ? [selected] : []), ...refs])].map((ref) => (
        <Badge
          className={`cursor-pointer ${ref === selected ? "" : "opacity-60"}`}
          key={ref}
          onClick={() => onSelect(ref)}
          variant={ref === selected ? "default" : "outline"}
        >
          {ref}
        </Badge>
      ))}
    </div>
  );
}

/* ── The page ── */

export function MemorySettingsPage() {
  const { t } = useTranslation("memory");
  const { t: tCommon } = useTranslation("common");
  const { currentUserId } = useWorkspaceContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "mine";
  const selectedRef = searchParams.get("ref");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(tCommon("navigation.settings"));

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("title", { defaultValue: "Memory" }) },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    params.delete("ref");
    setSearchParams(params, { replace: true });
  };
  const setRef = (ref: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("ref", ref);
    setSearchParams(params, { replace: true });
  };

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-auto p-page pb-10">
      <div>
        <h1 className="font-semibold text-xl">
          {t("title", { defaultValue: "Memory" })}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("subtitle", {
            defaultValue:
              "What your agents have learned — each scope is one document. Edit it like text; every block stays a tracked record.",
          })}
        </p>
      </div>
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList>
          <TabsTrigger value="profile">
            {t("tabs.profile", { defaultValue: "Profile" })}
          </TabsTrigger>
          <TabsTrigger value="mine">
            {t("tabs.mine", { defaultValue: "My memory" })}
          </TabsTrigger>
          <TabsTrigger value="projects">
            {t("tabs.projects", { defaultValue: "Projects" })}
          </TabsTrigger>
          <TabsTrigger value="org">
            {t("tabs.org", { defaultValue: "Organization" })}
          </TabsTrigger>
          <TabsTrigger value="entities">
            {t("tabs.entities", { defaultValue: "Entities" })}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="pt-4" value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent className="pt-4" value="mine">
          {currentUserId ? (
            <ScopeDocEditor
              canEdit
              scope={{ scope_kind: "user", scope_ref: currentUserId }}
              showApprovals={false}
            />
          ) : null}
        </TabsContent>

        <TabsContent className="space-y-4 pt-4" value="projects">
          <RefPicker
            onSelect={setRef}
            scopeKind="project"
            selected={selectedRef}
          />
          {selectedRef ? (
            <ScopeDocEditor
              canEdit
              scope={{ scope_kind: "project", scope_ref: selectedRef }}
              showApprovals={false}
            />
          ) : null}
        </TabsContent>

        <TabsContent className="pt-4" value="org">
          <ScopeDocEditor
            canEdit
            scope={{ scope_kind: "org", scope_ref: null }}
            showApprovals
          />
        </TabsContent>

        <TabsContent className="space-y-4 pt-4" value="entities">
          <RefPicker
            onSelect={setRef}
            scopeKind="entity"
            selected={selectedRef}
          />
          {selectedRef ? (
            <ScopeDocEditor
              canEdit
              scope={{ scope_kind: "entity", scope_ref: selectedRef }}
              showApprovals={false}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
