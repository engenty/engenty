import { useTranslation } from "@engenty/i18n/ui";
import { Button, SettingsCard, SettingsSection } from "@engenty/ui-core";
import { FolderInput, Link as LinkIcon, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getContactsPluginApi } from "../plugins.js";
import { useProjectClientContactQuery } from "../queries.js";
import type { ProjectClientSelection } from "./project-client-topline.js";
import { ProjectChangeClientDialog } from "./project-client-topline.js";

/**
 * The client in the project's settings sidebar, laid out like an offer's
 * recipient card: the name with change and open-contact icons, then the
 * contact's address and email. Only with the contacts module.
 */
export function ProjectClientSettingsSection({
  clientId,
  clientName,
  onChange,
}: {
  clientId: string | null;
  clientName: string | null;
  onChange: (next: ProjectClientSelection) => void;
}) {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();
  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: contact } = useProjectClientContactQuery(
    contactsPlugin,
    clientId
  );

  if (!contactsPlugin) {
    return null;
  }
  const name = contact?.display_name ?? clientName?.trim() ?? null;
  const place = [contact?.address_zip, contact?.address_city]
    .filter(Boolean)
    .join(" ");
  const addressLines = [
    contact?.address_street,
    [place, contact?.address_country].filter(Boolean).join(", "),
  ].filter((line): line is string => Boolean(line));
  const reachLines = [contact?.email, contact?.phone].filter(
    (line): line is string => Boolean(line)
  );

  return (
    <SettingsSection
      description={t("detail.projectSettings.clientSectionDescription")}
      title={t("detail.projectSettings.clientSection")}
    >
      <SettingsCard className="p-4">
        {name ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-1">
              <p className="min-w-0 flex-1 font-semibold text-foreground">
                {name}
              </p>
              <div className="-mt-1 -mr-1.5 flex shrink-0 gap-1">
                <Button
                  aria-label={t("detail.clientInfo.change")}
                  className="h-6 w-6"
                  onClick={() => setDialogOpen(true)}
                  size="icon"
                  title={t("detail.clientInfo.change")}
                  variant="ghost"
                >
                  <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                {clientId ? (
                  <Button
                    aria-label={t("detail.clientInfo.viewInContacts")}
                    className="h-6 w-6"
                    onClick={() => navigate(`/mdl/contacts/${clientId}`)}
                    size="icon"
                    title={t("detail.clientInfo.viewInContacts")}
                    variant="ghost"
                  >
                    <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                ) : null}
              </div>
            </div>
            {addressLines.map((line) => (
              <p className="text-foreground" key={line}>
                {line}
              </p>
            ))}
            {reachLines.length > 0 ? (
              <div className="space-y-1 border-border border-t pt-2">
                {reachLines.map((line) => (
                  <p className="truncate text-foreground" key={line}>
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {t("detail.clientInfo.empty")}
            </span>
            <Button
              className="shrink-0 gap-1"
              onClick={() => setDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("detail.clientInfo.addLink")}
            </Button>
          </div>
        )}
      </SettingsCard>
      <ProjectChangeClientDialog
        ContactChooser={contactsPlugin.ContactChooser}
        clientId={clientId}
        contactsPlugin={contactsPlugin}
        onOpenChange={setDialogOpen}
        onSave={(next) => {
          setDialogOpen(false);
          onChange(next);
        }}
        open={dialogOpen}
      />
    </SettingsSection>
  );
}
