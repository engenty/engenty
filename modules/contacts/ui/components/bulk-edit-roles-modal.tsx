import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useCallback, useState } from "react";
import { FIXED_CONTACT_ROLES } from "../api/role-menu-settings.js";
import type { ContactListItem, ContactRole } from "../api.js";
import { addContactRole, removeContactRole } from "../api.js";
import { useContactsRoleOptions } from "../hooks/use-contacts-role-options.js";

interface BulkEditRolesModalProps {
  entities: ContactListItem[];
  onClose: () => void;
  onSuccess: () => void;
  open: boolean;
  t: (key: string) => string;
}

export function BulkEditRolesModal({
  entities,
  onClose,
  onSuccess,
  open,
  t,
}: BulkEditRolesModalProps) {
  const roleOptions = useContactsRoleOptions();
  const allRoles = roleOptions.map((item) => item.slug);
  const roleTitleBySlug = new Map(
    roleOptions.map((item) => [item.slug, item.title?.trim() || item.slug])
  );
  const [addRoles, setAddRoles] = useState<Set<ContactRole>>(new Set());
  const [removeRoles, setRemoveRoles] = useState<Set<ContactRole>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAdd = useCallback((role: ContactRole) => {
    setAddRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
        setRemoveRoles((r) => {
          const n = new Set(r);
          n.delete(role);
          return n;
        });
      }
      return next;
    });
  }, []);

  const toggleRemove = useCallback((role: ContactRole) => {
    setRemoveRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
        setAddRoles((a) => {
          const n = new Set(a);
          n.delete(role);
          return n;
        });
      }
      return next;
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (addRoles.size === 0 && removeRoles.size === 0) {
      onClose();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      for (const entity of entities) {
        for (const role of addRoles) {
          if (!(entity.roles ?? []).includes(role)) {
            await addContactRole(entity.id, role);
          }
        }
        for (const role of removeRoles) {
          if ((entity.roles ?? []).includes(role)) {
            await removeContactRole(entity.id, role);
          }
        }
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }, [addRoles, entities, onClose, onSuccess, removeRoles, t]);

  const handleClose = useCallback(() => {
    setAddRoles(new Set());
    setRemoveRoles(new Set());
    setError(null);
    onClose();
  }, [onClose]);

  const hasChanges = addRoles.size > 0 || removeRoles.size > 0;

  return (
    <Dialog onOpenChange={(o) => !o && handleClose()} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("bulkEditRoles")}</DialogTitle>
        </DialogHeader>
        {error && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
          >
            {error}
          </div>
        )}
        <p className="text-muted-foreground text-sm">
          {t("bulkEditRolesDescription", {
            count: entities.length,
            defaultValue: `Apply role changes to ${entities.length} selected entities.`,
          })}
        </p>
        <div className="space-y-4">
          <div>
            <p className="mb-2 font-medium text-sm">
              {t("addRolesToSelected")}
            </p>
            <div className="flex flex-wrap gap-3">
              {allRoles.map((role) => (
                <label
                  className="flex cursor-pointer items-center gap-2"
                  key={role}
                >
                  <Checkbox
                    checked={addRoles.has(role)}
                    onCheckedChange={() => toggleAdd(role)}
                  />
                  <span className="text-sm">
                    {roleTitleBySlug.get(role) ||
                      (FIXED_CONTACT_ROLES.includes(
                        role as (typeof FIXED_CONTACT_ROLES)[number]
                      )
                        ? t(`role.${role}`)
                        : role)}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-medium text-sm">
              {t("removeRolesFromSelected")}
            </p>
            <div className="flex flex-wrap gap-3">
              {allRoles.map((role) => (
                <label
                  className="flex cursor-pointer items-center gap-2"
                  key={role}
                >
                  <Checkbox
                    checked={removeRoles.has(role)}
                    onCheckedChange={() => toggleRemove(role)}
                  />
                  <span className="text-sm">
                    {roleTitleBySlug.get(role) ||
                      (FIXED_CONTACT_ROLES.includes(
                        role as (typeof FIXED_CONTACT_ROLES)[number]
                      )
                        ? t(`role.${role}`)
                        : role)}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {entities.length <= 5 && (
            <div className="flex flex-wrap gap-1">
              {entities.map((e) => (
                <Badge key={e.id} variant="secondary">
                  {e.display_name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            {t("cancel")}
          </Button>
          <Button
            disabled={!hasChanges || submitting}
            onClick={() => void handleApply()}
          >
            {submitting ? t("saving") : t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
