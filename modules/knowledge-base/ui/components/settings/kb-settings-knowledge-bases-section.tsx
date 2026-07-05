/**
 * KB module settings: knowledge bases list and tenant-wide configuration.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SettingsFormCard,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@engenty/ui-core";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { KnowledgeBase } from "../../../src/schema/types.js";
import { createKb, deleteKb, updateKb, updateKbSettings } from "../../api.js";
import { kbDisplayName } from "../../kb-display-name.js";
import { kbScopedSettingsPath } from "../../kb-paths.js";
import { kbSettingsQueryOptions } from "../../queries.js";

function normalizeDescription(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function KbSettingsKnowledgeBasesSection({
  kbs,
  isLoading,
}: {
  kbs: KnowledgeBase[];
  isLoading: boolean;
}) {
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();
  const [addKbOpen, setAddKbOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editKb, setEditKb] = useState<KnowledgeBase | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);
  const defaultKbId = kbSettings?.default_kb_id?.trim() ?? "";

  const createMut = useMutation({
    mutationFn: async () => {
      if (!kbSettings) {
        throw new Error("Settings not loaded");
      }
      const isFirst = kbs.length === 0;
      const kb = await createKb({
        name: newName.trim(),
        slug: newName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
        description: null,
      });
      if (isFirst) {
        await updateKbSettings({
          ...kbSettings,
          default_kb_id: kb.id,
        });
      }
      return kb;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb", "knowledge-bases"] });
      queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
      setNewName("");
      setAddKbOpen(false);
      toast.success(t("settings.kbs.created"));
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteKb,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb", "knowledge-bases"] });
      toast.success(t("settings.kbs.deleted"));
    },
    onError: (err) => toast.error(err.message),
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editKb) {
        throw new Error("No knowledge base selected");
      }
      return updateKb(editKb.id, {
        name: editName.trim(),
        slug: editSlug.trim(),
        description: normalizeDescription(editDescription),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb", "knowledge-bases"] });
      setEditKb(null);
      toast.success(t("settings.kbs.updated"));
    },
    onError: (err) => toast.error(err.message),
  });

  const editDirty = useMemo(() => {
    if (!editKb) {
      return false;
    }
    const prevDesc =
      editKb.description == null || editKb.description.trim() === ""
        ? null
        : editKb.description.trim();
    return (
      editName.trim() !== editKb.name.trim() ||
      editSlug.trim() !== editKb.slug.trim() ||
      normalizeDescription(editDescription) !== prevDesc
    );
  }, [editKb, editName, editSlug, editDescription]);

  const setDefaultMut = useMutation({
    mutationFn: async (nextKbId: string) => {
      if (!kbSettings) {
        throw new Error("Settings not loaded");
      }
      await updateKbSettings({
        ...kbSettings,
        default_kb_id: nextKbId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
      toast.success(t("settings.kbs.default_set"));
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <section className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-lg">
            {t("settings.kbs_list_title")}
          </h2>
          <p className="whitespace-normal text-pretty break-words text-muted-foreground text-sm">
            {t("settings.kbs_list_description")}
          </p>
        </div>
        <Button
          className="shrink-0"
          onClick={() => {
            setNewName("");
            setAddKbOpen(true);
          }}
          size="sm"
          type="button"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t("settings.kbs.add_header")}
        </Button>
      </div>

      <SettingsFormCard variant="flush">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings.kbs.name")}</TableHead>
              <TableHead>{t("settings.kbs.slug")}</TableHead>
              <TableHead className="w-[168px] text-right">
                {t("settings.kbs.column_actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kbs.map((kb) => {
              const isDefault = defaultKbId.length > 0 && kb.id === defaultKbId;
              return (
                <TableRow key={kb.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="truncate text-foreground hover:underline"
                      to={kbScopedSettingsPath(kb.slug)}
                    >
                      {kbDisplayName(kb, t)}
                    </Link>
                    {isDefault ? (
                      <Badge className="ml-2" variant="secondary">
                        {t("settings.kbs.default_badge")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {kb.slug}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        aria-label={t("settings.kbs.edit")}
                        className="text-muted-foreground"
                        onClick={() => {
                          setEditKb(kb);
                          setEditName(kb.name);
                          setEditSlug(kb.slug);
                          setEditDescription(kb.description ?? "");
                        }}
                        size="icon"
                        title={t("settings.kbs.edit")}
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isDefault ? (
                        <span
                          className="inline-flex size-8 items-center justify-center text-primary"
                          title={t("settings.kbs.default_badge")}
                        >
                          <Star
                            aria-hidden
                            className="size-4"
                            fill="currentColor"
                          />
                        </span>
                      ) : (
                        <Button
                          aria-label={t("settings.kbs.set_default")}
                          className="text-muted-foreground"
                          disabled={setDefaultMut.isPending}
                          onClick={() => setDefaultMut.mutate(kb.id)}
                          size="icon"
                          title={t("settings.kbs.set_default")}
                          type="button"
                          variant="ghost"
                        >
                          <Star className="size-4" />
                        </Button>
                      )}
                      <Button
                        aria-label={t("actions.delete")}
                        className="text-destructive hover:bg-destructive/10"
                        disabled={isDefault || deleteMut.isPending}
                        onClick={() => {
                          if (
                            // biome-ignore lint/suspicious/noAlert: Simple confirmation is acceptable for settings table rows
                            confirm(t("settings.kbs.delete_confirm"))
                          ) {
                            deleteMut.mutate(kb.id);
                          }
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {kbs.length === 0 ? (
              <TableRow>
                <TableCell className="h-36 p-6" colSpan={3}>
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <p className="font-medium text-foreground text-sm">
                      {t("settings.kbs.empty_title")}
                    </p>
                    <p className="max-w-sm text-muted-foreground text-xs leading-relaxed">
                      {t("settings.kbs.empty_description")}
                    </p>
                    <Button
                      className="mt-1"
                      onClick={() => {
                        setNewName("");
                        setAddKbOpen(true);
                      }}
                      size="sm"
                      type="button"
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      {t("settings.kbs.empty_cta")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </SettingsFormCard>

      <Dialog
        onOpenChange={(open) => {
          setAddKbOpen(open);
          if (!open) {
            setNewName("");
          }
        }}
        open={addKbOpen}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim() || createMut.isPending) {
                return;
              }
              createMut.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("settings.kbs.add_dialog_title")}</DialogTitle>
              <DialogDescription>
                {t("settings.kbs.add_dialog_description")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label htmlFor="kb-settings-add-kb-name">
                {t("settings.kbs.name")}
              </Label>
              <Input
                autoFocus
                id="kb-settings-add-kb-name"
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("settings.kbs.name_placeholder")}
                value={newName}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={createMut.isPending}
                onClick={() => setAddKbOpen(false)}
                type="button"
                variant="outline"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={!newName.trim() || createMut.isPending}
                type="submit"
              >
                {createMut.isPending ? t("actions.saving") : t("actions.add")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setEditKb(null);
          }
        }}
        open={editKb !== null}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editDirty || editMut.isPending) {
                return;
              }
              editMut.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("settings.kbs.edit_dialog_title")}</DialogTitle>
              <DialogDescription>
                {t("settings.kbs.edit_dialog_description")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-2">
                <Label htmlFor="kb-settings-edit-kb-name">
                  {t("settings.kbs.name")}
                </Label>
                <Input
                  autoFocus
                  id="kb-settings-edit-kb-name"
                  onChange={(e) => setEditName(e.target.value)}
                  value={editName}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kb-settings-edit-kb-slug">
                  {t("settings.kbs.slug")}
                </Label>
                <Input
                  className="font-mono text-sm"
                  id="kb-settings-edit-kb-slug"
                  onChange={(e) => setEditSlug(e.target.value)}
                  spellCheck={false}
                  value={editSlug}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kb-settings-edit-kb-description">
                  {t("scoped_settings.field_description")}
                </Label>
                <Textarea
                  className="min-h-[88px]"
                  id="kb-settings-edit-kb-description"
                  onChange={(e) => setEditDescription(e.target.value)}
                  value={editDescription}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={editMut.isPending}
                onClick={() => setEditKb(null)}
                type="button"
                variant="outline"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !(editDirty && editName.trim() && editSlug.trim()) ||
                  editMut.isPending
                }
                type="submit"
              >
                {editMut.isPending ? t("actions.saving") : t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
