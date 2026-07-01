import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
} from "@engenty/ui-core";
import { useEffect, useMemo, useState } from "react";
import type {
  ContactRelationCreateInput,
  ContactRelationListItem,
  ContactRelationUpdateInput,
} from "../api.js";
import { ContactChooser } from "./contact-chooser.js";

export type ContactRelationDialogSubmitPayload =
  | { input: ContactRelationCreateInput; mode: "create" }
  | {
      mode: "edit";
      patch: ContactRelationUpdateInput;
      relationId: string;
    };

interface ContactRelationDialogProps {
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ContactRelationDialogSubmitPayload) => Promise<void>;
  open: boolean;
  organisationId: string;
  people: Array<{ display_name: string; id: string }>;
  relation: ContactRelationListItem | null;
  submitting: boolean;
  t: (key: string, options?: { defaultValue?: string }) => string;
}

interface RelationFormState {
  department: string;
  is_primary: boolean;
  personId: string | null;
  position: string;
  role: string;
}

const EMPTY_FORM: RelationFormState = {
  department: "",
  is_primary: false,
  personId: null,
  position: "",
  role: "",
};

export function ContactRelationDialog({
  error,
  onOpenChange,
  onSubmit,
  open,
  organisationId,
  people,
  relation,
  submitting,
  t,
}: ContactRelationDialogProps) {
  const [form, setForm] = useState<RelationFormState>(EMPTY_FORM);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      return;
    }

    if (!relation) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      department: relation.department ?? "",
      is_primary: relation.is_primary,
      personId: relation.other_contact.id,
      position: relation.position ?? "",
      role: relation.role ?? "",
    });
  }, [open, relation]);

  const title = relation
    ? t("relations.editRelation", { defaultValue: "Edit relation" })
    : t("relations.addRelation", { defaultValue: "Add relation" });

  const peopleOptions = useMemo(
    () =>
      people
        .slice()
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [people]
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.personId) {
      return;
    }

    if (relation) {
      await onSubmit({
        mode: "edit",
        patch: {
          department: form.department.trim() || null,
          is_primary: form.is_primary,
          position: form.position.trim() || null,
          role: form.role.trim() || null,
        },
        relationId: relation.id,
      });
      return;
    }

    await onSubmit({
      input: {
        department: form.department.trim() || null,
        from_contact_id: form.personId,
        is_primary: form.is_primary,
        position: form.position.trim() || null,
        relation_type: "works_at",
        role: form.role.trim() || null,
        to_contact_id: organisationId,
      },
      mode: "create",
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <form
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="flex items-center gap-4">
            <Label className="w-32 shrink-0 text-sm" htmlFor="relation-person">
              {t("relations.person", { defaultValue: "Person" })}
            </Label>
            <div className="flex-1">
              <ContactChooser
                className="w-full"
                disabled={Boolean(relation)}
                entities={peopleOptions}
                onChange={(personId) =>
                  setForm((current) => ({ ...current, personId }))
                }
                placeholder={t("relations.searchPeople", {
                  defaultValue: "Search people",
                })}
                value={form.personId}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Label className="w-32 shrink-0 text-sm" htmlFor="relation-role">
              {t("relations.role", { defaultValue: "Role" })}
            </Label>
            <Input
              id="relation-role"
              onChange={(event) =>
                setForm((current) => ({ ...current, role: event.target.value }))
              }
              value={form.role}
            />
          </div>

          <div className="flex items-center gap-4">
            <Label
              className="w-32 shrink-0 text-sm"
              htmlFor="relation-position"
            >
              {t("relations.position", { defaultValue: "Position" })}
            </Label>
            <Input
              id="relation-position"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  position: event.target.value,
                }))
              }
              value={form.position}
            />
          </div>

          <div className="flex items-center gap-4">
            <Label
              className="w-32 shrink-0 text-sm"
              htmlFor="relation-department"
            >
              {t("relations.department", { defaultValue: "Department" })}
            </Label>
            <Input
              id="relation-department"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  department: event.target.value,
                }))
              }
              value={form.department}
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="w-32 shrink-0 text-sm" htmlFor="relation-primary">
              {t("relations.primary", { defaultValue: "Primary" })}
            </Label>
            <div className="flex flex-1 items-center gap-3">
              <Switch
                checked={form.is_primary}
                id="relation-primary"
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    is_primary: checked,
                  }))
                }
              />
              <p className="text-muted-foreground text-sm">
                {t("relations.primaryDescription", {
                  defaultValue:
                    "Use as the default organisation shown for this person.",
                })}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button disabled={!form.personId || submitting} type="submit">
              {submitting
                ? t("saving")
                : relation
                  ? t("save")
                  : t("relations.addRelation", {
                      defaultValue: "Add relation",
                    })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
