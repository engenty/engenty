import { useTranslation } from "@engenty/i18n/ui";
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
import { useCallback, useMemo, useState } from "react";
import { useCreateAiSkillMutation } from "../../lib/admin/ai-runtime-queries";
import {
  isTitleDerivableToValidSkillName,
  titleToAgentSkillName,
} from "../agents-workspace/title-to-agent-skill-name";

export interface CreateSkillModalProps {
  existingSkillNames: ReadonlySet<string>;
  onCreated: (skillName: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

export function CreateSkillModal({
  existingSkillNames,
  onCreated,
  onOpenChange,
  open,
}: CreateSkillModalProps) {
  const { t } = useTranslation("ai-ui");
  const { t: tCommon } = useTranslation("common");
  const createMutation = useCreateAiSkillMutation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const derivedName = useMemo(() => titleToAgentSkillName(title), [title]);
  const derivedValid = useMemo(
    () => isTitleDerivableToValidSkillName(title),
    [title]
  );
  const duplicate = derivedValid && existingSkillNames.has(derivedName);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setLocalError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        reset();
      }
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const submit = useCallback(async () => {
    setLocalError(null);
    if (!derivedValid) {
      setLocalError(t("skillsCreateModal.invalidTitle"));
      return;
    }
    if (duplicate) {
      setLocalError(
        t("skillsCreateModal.duplicateName", { name: derivedName })
      );
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        description: description.trim() || null,
        metadata: { module_id: "engenty-core" },
        name: derivedName,
        title: title.trim() || null,
      });
      const skillName = result.skill.name;
      reset();
      onCreated(skillName);
      onOpenChange(false);
    } catch (error) {
      setLocalError(errorMessage(error, t("skillsCreateModal.createFailed")));
    }
  }, [
    createMutation,
    derivedName,
    derivedValid,
    description,
    duplicate,
    onCreated,
    onOpenChange,
    reset,
    t,
    title,
  ]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="bg-background sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle>{t("skillsCreateModal.title")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("skillsCreateModal.a11yDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="create-skill-title">
                {t("skillsCreateModal.titleField")}
              </Label>
              <Input
                autoComplete="off"
                id="create-skill-title"
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("skillsCreateModal.titlePlaceholder")}
                value={title}
              />
              {derivedName ? (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
                  <span className="font-medium text-foreground">
                    {t("skillsCreateModal.idLabel")}
                  </span>
                  <span className="font-mono text-foreground text-sm">
                    {derivedName}
                  </span>
                </div>
              ) : null}
              {title.trim() && !derivedValid ? (
                <p className="text-destructive text-xs">
                  {t("skillsCreateModal.invalidTitle")}
                </p>
              ) : null}
              {duplicate ? (
                <p className="text-destructive text-xs" role="status">
                  {t("skillsCreateModal.duplicateName", { name: derivedName })}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-skill-description">
                {t("skillsCreateModal.descriptionField")}
              </Label>
              <Textarea
                className="min-h-20"
                id="create-skill-description"
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("skillsCreateModal.descriptionPlaceholder")}
                value={description}
              />
            </div>
            {localError ? (
              <p className="text-destructive text-sm" role="alert">
                {localError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending
                ? tCommon("actions.creating")
                : tCommon("actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
