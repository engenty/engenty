import { Button } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  FileStorageSkillDetail,
  UpsertFileStorageSkillInput,
} from "../../lib/runtime/skills-api.js";
import {
  useDeleteSkillMutation,
  useReseedSkillsMutation,
  useSkillCatalogDetailQuery,
  useSkillCatalogQuery,
  useUpsertSkillMutation,
} from "../../lib/runtime/skills-queries.js";
import { SkillDetailPanel } from "./skill-detail-panel.js";
import { SkillEditorDialog } from "./skill-editor-dialog.js";
import { SkillsSidebar } from "./skills-sidebar.js";

interface SkillsTabProps {
  t: (key: string) => string;
}

export function SkillsTab({ t }: SkillsTabProps) {
  const catalogQuery = useSkillCatalogQuery();
  const skills = catalogQuery.data?.skills ?? [];

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] =
    useState<FileStorageSkillDetail | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const detailQuery = useSkillCatalogDetailQuery(selectedName);
  const upsertMutation = useUpsertSkillMutation();
  const deleteMutation = useDeleteSkillMutation();
  const reseedMutation = useReseedSkillsMutation();

  useEffect(() => {
    if (!selectedName && skills.length > 0) {
      setSelectedName(skills[0].name);
    }
  }, [skills, selectedName]);

  const handleSelect = (name: string) => {
    setSelectedName(name);
    setDeleteConfirming(false);
  };

  const handleNewSkill = () => {
    setEditingSkill(null);
    setEditorOpen(true);
  };

  const handleEditSkill = (skill: FileStorageSkillDetail) => {
    setEditingSkill(skill);
    setEditorOpen(true);
  };

  const handleEditorClose = () => {
    setEditorOpen(false);
    setEditingSkill(null);
  };

  const handleSave = async (input: UpsertFileStorageSkillInput) => {
    await upsertMutation.mutateAsync(input);
    setSelectedName(input.name);
  };

  const handleDeleteRequest = (_name: string) => {
    setDeleteConfirming(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedName) {
      return;
    }
    const deletedName = selectedName;
    await deleteMutation.mutateAsync(deletedName);
    setDeleteConfirming(false);
    const remaining = skills.filter((s) => s.name !== deletedName);
    setSelectedName(remaining.length > 0 ? remaining[0].name : null);
  };

  const handleReseed = () => {
    void reseedMutation.mutateAsync(false);
  };

  const selectedSkill = detailQuery.data?.skill ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          disabled={reseedMutation.isPending}
          onClick={handleReseed}
          size="sm"
          variant="outline"
        >
          {reseedMutation.isPending ? (
            <>
              <AnimatedLoaderIcon play="always" size="xs" />
              {t("skills.reseeding")}
            </>
          ) : (
            <>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t("skills.reseed")}
            </>
          )}
        </Button>
        <Button onClick={handleNewSkill} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("skills.newSkill")}
        </Button>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-4">
        <SkillsSidebar
          onSelect={handleSelect}
          selectedName={selectedName}
          skills={skills}
          t={t}
        />

        <div className="min-w-0">
          {deleteConfirming && selectedSkill ? (
            <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
              <p className="font-medium text-destructive">
                {t("skills.deleteWarning")}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => void handleDeleteConfirm()}
                  size="sm"
                  variant="destructive"
                >
                  {deleteMutation.isPending ? (
                    <AnimatedLoaderIcon play="always" size="xs" />
                  ) : null}
                  {t("skills.confirmDelete")}
                </Button>
                <Button
                  onClick={() => setDeleteConfirming(false)}
                  size="sm"
                  variant="outline"
                >
                  {t("skills.cancelDelete")}
                </Button>
              </div>
            </div>
          ) : null}

          {detailQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AnimatedLoaderIcon play="always" size="xs" />
              {t("skills.loadingDetail")}
            </div>
          ) : selectedSkill ? (
            <SkillDetailPanel
              onDelete={handleDeleteRequest}
              onEdit={handleEditSkill}
              skill={selectedSkill}
              t={t}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("skills.noSelection")}
            </p>
          )}
        </div>
      </div>

      <SkillEditorDialog
        initialSkill={editingSkill}
        onClose={handleEditorClose}
        onSave={handleSave}
        open={editorOpen}
        t={t}
      />
    </div>
  );
}
