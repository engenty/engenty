import {
  Button,
  CardSection,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FIXED_CONTACT_ROLES } from "../api/role-menu-settings.js";
import type { ContactCreateInput, ContactRole } from "../api.js";
import { createContact, getNextReferenceId } from "../api.js";
import { useContactsRoleOptions } from "../hooks/use-contacts-role-options.js";

const ROLE_NONE_VALUE = "";

export interface AddContactDialogConfig {
  buildCreateInput: (
    primaryValue: string,
    referenceId: string,
    roles: ContactRole[]
  ) => ContactCreateInput;
  entityType: "organisation" | "person";
  primaryFieldLabelKey: string;
  titleKey: string;
}

interface AddContactDialogProps {
  config: AddContactDialogConfig;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  open: boolean;
  t: (key: string) => string;
}

const emptyForm = { primary: "", role: ROLE_NONE_VALUE };

export function AddContactDialog({
  config,
  open,
  onOpenChange,
  onSuccess,
  t,
}: AddContactDialogProps) {
  const navigate = useNavigate();
  const roleOptions = useContactsRoleOptions();
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setApiError(null);
      setSubmitting(true);
      try {
        const referenceId = await getNextReferenceId();
        const roles: ContactRole[] =
          formData.role && formData.role !== ROLE_NONE_VALUE
            ? [formData.role as ContactRole]
            : [];
        const createInput = config.buildCreateInput(
          formData.primary.trim(),
          referenceId,
          roles
        );
        const created = await createContact(createInput);
        onOpenChange(false);
        setFormData(emptyForm);
        onSuccess?.();
        navigate(`/mdl/contacts/${created.id}/edit`);
      } catch (err: unknown) {
        setApiError(err instanceof Error ? err.message : t("createFailed"));
      } finally {
        setSubmitting(false);
      }
    },
    [config, formData, navigate, onOpenChange, onSuccess, t]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setFormData(emptyForm);
        setApiError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(config.titleKey)}</DialogTitle>
        </DialogHeader>
        {apiError && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
          >
            {apiError}
          </div>
        )}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <CardSection.Header
              title={t("sectionBasicInfo")}
              variant="meta"
            />
            <div className="flex items-center gap-4">
              <Label className="w-32 shrink-0 text-sm" htmlFor="primary">
                {t(config.primaryFieldLabelKey)} *
              </Label>
              <Input
                id="primary"
                onChange={(e) =>
                  setFormData((p) => ({ ...p, primary: e.target.value }))
                }
                required
                value={formData.primary}
              />
            </div>
            <div className="flex items-center gap-4">
              <Label className="w-32 shrink-0 text-sm" htmlFor="role">
                {t("assignRole")}
              </Label>
              <Select
                onValueChange={(v) => setFormData((p) => ({ ...p, role: v }))}
                value={formData.role}
              >
                <SelectTrigger className="flex-1" id="role">
                  <SelectValue placeholder={t("noRole")}>
                    {formData.role && formData.role !== ROLE_NONE_VALUE
                      ? (() => {
                          const item = roleOptions.find(
                            (r) => r.slug === formData.role
                          );
                          if (!item) {
                            return formData.role;
                          }
                          return (
                            item.title?.trim() ||
                            (FIXED_CONTACT_ROLES.includes(
                              item.slug as (typeof FIXED_CONTACT_ROLES)[number]
                            )
                              ? t(`role.${item.slug}`)
                              : item.slug)
                          );
                        })()
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROLE_NONE_VALUE}>{t("noRole")}</SelectItem>
                  {roleOptions
                    .filter((item) => item.visible)
                    .map((item) => (
                      <SelectItem key={item.slug} value={item.slug}>
                        {item.title?.trim() ||
                          (FIXED_CONTACT_ROLES.includes(
                            item.slug as (typeof FIXED_CONTACT_ROLES)[number]
                          )
                            ? t(`role.${item.slug}`)
                            : item.slug)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button disabled={submitting} type="submit">
              {submitting ? t("creating") : t("createContact")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
