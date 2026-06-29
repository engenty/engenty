import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useState } from "react";
import type {
  FileStorageSkillDetail,
  UpsertFileStorageSkillInput,
} from "../../lib/runtime/skills-api.js";

interface SkillEditorDialogProps {
  initialSkill?: FileStorageSkillDetail | null;
  onClose: () => void;
  onSave: (input: UpsertFileStorageSkillInput) => Promise<void>;
  open: boolean;
  t: (key: string) => string;
}

export function SkillEditorDialog({
  initialSkill,
  onClose,
  onSave,
  open,
  t,
}: SkillEditorDialogProps) {
  const isEdit = Boolean(initialSkill);
  const [name, setName] = useState(initialSkill?.name ?? "");
  const [description, setDescription] = useState(
    initialSkill?.frontmatter.description ?? initialSkill?.description ?? ""
  );
  const [body, setBody] = useState(initialSkill?.body ?? "");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    try {
      await onSave({
        body,
        frontmatter: { description: description || undefined },
        name: name.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("skills.editSkill") : t("skills.newSkill")}
          </DialogTitle>
          <DialogDescription>{t("skills.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="skill-editor-name">{t("skills.nameLabel")}</Label>
            <Input
              disabled={isEdit}
              id="skill-editor-name"
              onChange={(e) => setName(e.target.value)}
              pattern="[a-z0-9-]+"
              placeholder={t("skills.namePlaceholder")}
              required
              value={name}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skill-editor-description">
              {t("skills.descriptionLabel")}
            </Label>
            <Input
              id="skill-editor-description"
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("skills.descriptionPlaceholder")}
              value={description}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="skill-editor-body">{t("skills.bodyLabel")}</Label>
            <Textarea
              className="min-h-[300px] font-mono"
              id="skill-editor-body"
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("skills.bodyPlaceholder")}
              value={body}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("skills.cancel")}
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={() => void handleSave()}
            type="button"
          >
            {saving ? (
              <>
                <AnimatedLoaderIcon play="always" size="xs" />
                {t("skills.saving")}
              </>
            ) : (
              t("skills.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
