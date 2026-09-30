import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { Link as LinkIcon, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getContactsPluginApi } from "../plugins.js";
import { useProjectClientChoicesQuery } from "../queries.js";

/** The project's client: a contact id plus its name as shown. */
export interface ProjectClientSelection {
  client_id: string | null;
  client_name: string | null;
}

/**
 * The client line above the project title, as on an offer: the client's
 * name, then — on hover — a pen that opens the change-client dialog and a
 * link to the contact. Only with the contacts module. Unset and editable,
 * "Link a client" waits for the caller's hover group (`revealClassName`).
 */
export function ProjectClientTopline({
  clientId,
  clientName,
  onChange,
  revealClassName,
}: {
  clientId: string | null;
  clientName: string | null;
  /** Absent: read-only (no pen). */
  onChange?: (next: ProjectClientSelection) => void;
  revealClassName: string;
}) {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();
  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!contactsPlugin) {
    return null;
  }
  const name = clientName?.trim() || null;
  if (!(name || onChange)) {
    return null;
  }

  const iconClass =
    "size-6 p-0 text-inherit opacity-0 transition-opacity hover:bg-current/10 hover:text-inherit focus-visible:opacity-100 group-hover/client:opacity-100";

  return (
    <div className="group/client flex min-w-0 items-center gap-1">
      {name ? (
        <span className="truncate">{name}</span>
      ) : (
        <button
          className={cn(
            "truncate opacity-0 transition-opacity focus-visible:opacity-100",
            revealClassName
          )}
          onClick={() => setDialogOpen(true)}
          type="button"
        >
          {t("detail.clientInfo.addLink")}
        </button>
      )}
      {name && onChange ? (
        <Button
          aria-label={t("detail.clientInfo.change")}
          className={iconClass}
          onClick={() => setDialogOpen(true)}
          size="icon"
          title={t("detail.clientInfo.change")}
          type="button"
          variant="ghost"
        >
          <Pencil className="size-3.5" />
        </Button>
      ) : null}
      {clientId ? (
        <Button
          aria-label={t("detail.clientInfo.viewInContacts")}
          className={iconClass}
          onClick={() => navigate(`/mdl/contacts/${clientId}`)}
          size="icon"
          title={t("detail.clientInfo.viewInContacts")}
          type="button"
          variant="ghost"
        >
          <LinkIcon className="size-3.5" />
        </Button>
      ) : null}
      {onChange ? (
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
      ) : null}
    </div>
  );
}

/** Change-client dialog — the offers one: the contacts chooser and Save. */
export function ProjectChangeClientDialog({
  clientId,
  ContactChooser,
  contactsPlugin,
  onOpenChange,
  onSave,
  open,
}: {
  clientId: string | null;
  ContactChooser: NonNullable<
    ReturnType<typeof getContactsPluginApi>
  >["ContactChooser"];
  contactsPlugin: NonNullable<ReturnType<typeof getContactsPluginApi>>;
  onOpenChange: (open: boolean) => void;
  onSave: (next: ProjectClientSelection) => void;
  open: boolean;
}) {
  const { t } = useTranslation("projects");
  const { data: entities = [] } = useProjectClientChoicesQuery(
    contactsPlugin,
    open
  );
  const [selected, setSelected] = useState<string | null>(clientId);
  // Each opening starts from the project's current client.
  useEffect(() => {
    if (open) {
      setSelected(clientId);
    }
  }, [open, clientId]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("detail.clientInfo.change")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {t("detail.clientInfo.heading")}
            </p>
            <ContactChooser
              className="w-full"
              entities={entities}
              onChange={setSelected}
              value={selected}
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                onSave({
                  client_id: selected,
                  client_name: selected
                    ? (entities.find((e) => e.id === selected)?.display_name ??
                      null)
                    : null,
                })
              }
              size="sm"
            >
              {t("detail.clientInfo.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
