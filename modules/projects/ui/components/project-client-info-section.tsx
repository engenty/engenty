import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProjectListItem } from "../api.js";

export interface ProjectClientInfoSectionProps {
  className?: string;
  project: Pick<ProjectListItem, "client_id" | "client_name">;
}

export function ProjectClientInfoSection({
  className,
  project,
}: ProjectClientInfoSectionProps) {
  const { t } = useTranslation("projects");
  const clientId = project.client_id?.trim() || null;
  const clientName = project.client_name?.trim() || null;
  const hasAny = Boolean(clientId || clientName);
  const contactsPath = clientId ? `/mdl/contacts/${clientId}` : null;

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="flex items-center gap-2 font-medium text-lg">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        {t("detail.clientInfo.heading")}
      </h3>

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
          {t("detail.clientInfo.empty")}
        </p>
      )}
    </div>
  );
}
