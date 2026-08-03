import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { Building2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectListItem } from "../api.js";
import { updateProject } from "../api.js";
import {
  ProjectClientPicker,
  type ProjectClientSelection,
} from "./project-client-picker.js";

export interface ProjectClientInfoSectionProps {
  className?: string;
  /** Omit (or pass `false`) for read-only surfaces such as the client portal. */
  editable?: boolean;
  onProjectUpdated?: () => void | Promise<void>;
  project: Pick<ProjectListItem, "client_id" | "client_name">;
  projectId?: string;
}

export function ProjectClientInfoSection({
  className,
  editable = false,
  onProjectUpdated,
  project,
  projectId,
}: ProjectClientInfoSectionProps) {
  const { t } = useTranslation("projects");
  const [saving, setSaving] = useState(false);
  const clientId = project.client_id?.trim() || null;
  const clientName = project.client_name?.trim() || null;
  const hasAny = Boolean(clientId || clientName);
  const contactsPath = clientId ? `/mdl/contacts/${clientId}` : null;
  const canEdit = editable && Boolean(projectId);

  const handleChange = async (next: ProjectClientSelection) => {
    if (!projectId) {
      return;
    }
    setSaving(true);
    try {
      await updateProject(projectId, next);
      await onProjectUpdated?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="group/client flex flex-wrap items-center gap-1.5">
        <h3 className="flex items-center gap-2 font-medium text-lg">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          {t("detail.clientInfo.heading")}
        </h3>
        {canEdit && hasAny ? (
          <ProjectClientPicker
            clientId={clientId}
            clientName={clientName}
            disabled={saving}
            onChange={handleChange}
            trigger={
              <Button
                aria-label={t("detail.clientInfo.change")}
                className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/client:opacity-100"
                size="sm"
                title={t("detail.clientInfo.change")}
                type="button"
                variant="ghost"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            }
          />
        ) : null}
      </div>

      {hasAny ? (
        <div className="space-y-3 pt-1">
          <div>
            {clientName ? (
              <p className="font-medium text-sm">{clientName}</p>
            ) : (
              contactsPath && (
                <Link
                  className="font-medium text-primary text-sm underline underline-offset-2 hover:opacity-90"
                  to={contactsPath}
                >
                  {t("detail.clientInfo.viewInContacts")}
                </Link>
              )
            )}
            {clientName && contactsPath ? (
              <Link
                className="mt-1 inline-block text-primary text-sm underline underline-offset-2 hover:opacity-90"
                to={contactsPath}
              >
                {t("detail.clientInfo.viewInContacts")}
              </Link>
            ) : null}
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              {t("detail.clientInfo.contactPersonLabel")}
            </p>
            <p className="mt-0.5 text-muted-foreground text-sm">
              {t("detail.clientInfo.contactPersonEmpty")}
            </p>
          </div>
        </div>
      ) : (
        <p className="pt-1 text-muted-foreground text-sm">
          {t("detail.clientInfo.empty")}{" "}
          {canEdit ? (
            <ProjectClientPicker
              clientId={null}
              clientName={null}
              disabled={saving}
              onChange={handleChange}
              trigger={
                <button
                  className="inline-flex items-center gap-1 font-medium text-primary text-sm hover:underline"
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("detail.clientInfo.addLink")}
                </button>
              }
            />
          ) : null}
        </p>
      )}
    </div>
  );
}
