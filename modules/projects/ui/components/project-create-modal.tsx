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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createProject } from "../api.js";
import { getContactsPluginApi } from "../plugins.js";
import { useProjectEntitySearchQuery } from "../queries.js";

const NO_CLIENT_ID = "";

interface ProjectCreateModalProps {
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  open: boolean;
}

export function ProjectCreateModal({
  open,
  onOpenChange,
  onSuccess,
}: ProjectCreateModalProps) {
  const { t } = useTranslation("projects");
  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);

  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [clientSearch, setClientSearch] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientDisplayName, setClientDisplayName] = useState("");
  const [createNewEntity, setCreateNewEntity] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");

  const { data: entityOptions = [], isLoading: entityOptionsLoading } =
    useProjectEntitySearchQuery(
      contactsPlugin,
      clientSearch,
      open && clientOpen
    );

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle("");
    setTitleError(null);
    setSubmitError(null);
    setClientSearch("");
    setClientId(null);
    setClientDisplayName("");
    setCreateNewEntity(false);
    setNewEntityName("");
  }, [open]);

  const clearErrors = useCallback(() => {
    setTitleError(null);
    setSubmitError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      clearErrors();

      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setTitleError(t("create.titleRequired"));
        return;
      }

      setSubmitting(true);
      try {
        let finalClientId: string | null = null;
        let finalClientName: string | null = null;

        if (contactsPlugin) {
          if (createNewEntity && newEntityName.trim()) {
            const created = await contactsPlugin.createContact({
              display_name: newEntityName.trim(),
              type: "organisation",
              contact_name: newEntityName.trim(),
            });
            finalClientId = created?.id ?? null;
            finalClientName = created?.display_name ?? newEntityName.trim();
          } else if (clientId && clientId !== NO_CLIENT_ID) {
            finalClientId = clientId;
            finalClientName = clientDisplayName.trim() || null;
          }
        }

        await createProject({
          title: trimmedTitle,
          client_id: finalClientId,
          client_name: finalClientName,
          lead_id: null,
          portal_enabled: false,
          portal_password: null,
          portal_intro_text: null,
          created_by: null,
        });
        onOpenChange(false);
        onSuccess?.();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : t("create.createFailed");
        setSubmitError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [
      title,
      contactsPlugin,
      createNewEntity,
      newEntityName,
      clientId,
      clientDisplayName,
      onOpenChange,
      onSuccess,
      t,
      clearErrors,
    ]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setTitle("");
        setClientSearch("");
        setClientId(null);
        setClientDisplayName("");
        setCreateNewEntity(false);
        setNewEntityName("");
        clearErrors();
      }
      onOpenChange(next);
    },
    [onOpenChange, clearErrors]
  );

  const dialogDescriptionId = "project-create-dialog-description";

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent aria-describedby={dialogDescriptionId}>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription className="sr-only" id={dialogDescriptionId}>
            {t("create.title")}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="title">{t("create.projectTitle")}</Label>
            <Input
              aria-describedby={titleError ? "title-error" : undefined}
              aria-invalid={!!titleError}
              className={`mt-1 ${titleError ? "border-red-500" : ""}`}
              id="title"
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) {
                  setTitleError(null);
                }
              }}
              onFocus={() => setTitleError(null)}
              placeholder={t("create.projectTitle")}
              required
              value={title}
            />
            {titleError && (
              <p
                className="mt-1 text-red-600 text-sm"
                id="title-error"
                role="alert"
              >
                {titleError}
              </p>
            )}
          </div>

          {contactsPlugin ? (
            <>
              <div>
                <Label>{t("create.client")}</Label>
                <Popover onOpenChange={setClientOpen} open={clientOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="mt-1 flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setClientOpen((o) => !o)}
                      type="button"
                    >
                      <span
                        className={
                          clientId || clientDisplayName || createNewEntity
                            ? ""
                            : "text-muted-foreground"
                        }
                      >
                        {createNewEntity
                          ? t("create.createNewClient") +
                            (newEntityName ? `: ${newEntityName}` : "")
                          : clientDisplayName ||
                            clientId ||
                            t("create.clientOptional")}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-(--anchor-width) p-0"
                  >
                    <div className="p-1">
                      <Input
                        autoFocus
                        className="h-8"
                        onChange={(e) => setClientSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder={t("create.searchClientPlaceholder")}
                        value={clientSearch}
                      />
                    </div>
                    <div className="max-h-[200px] overflow-auto">
                      <button
                        className="w-full px-2 py-2 text-left text-muted-foreground text-sm hover:bg-accent"
                        onClick={() => {
                          setClientId(null);
                          setClientDisplayName("");
                          setCreateNewEntity(false);
                          setClientOpen(false);
                        }}
                        type="button"
                      >
                        {t("create.noClient")}
                      </button>
                      <button
                        className="w-full px-2 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setCreateNewEntity(true);
                          setClientId(null);
                          setClientDisplayName("");
                          setClientOpen(false);
                        }}
                        type="button"
                      >
                        + {t("create.createNewClient")}
                      </button>
                      {entityOptionsLoading && (
                        <div className="px-2 py-2 text-muted-foreground text-sm">
                          {t("create.loadingContacts")}
                        </div>
                      )}
                      {!entityOptionsLoading &&
                        entityOptions
                          .filter((e) => e.id && e.id !== "")
                          .map((e) => (
                            <button
                              className="w-full px-2 py-2 text-left text-sm hover:bg-accent"
                              key={e.id}
                              onClick={() => {
                                setClientId(e.id);
                                setClientDisplayName(e.display_name);
                                setCreateNewEntity(false);
                                setNewEntityName("");
                                setClientOpen(false);
                              }}
                              type="button"
                            >
                              {e.display_name}
                            </button>
                          ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {createNewEntity && (
                <div>
                  <Label htmlFor="newEntityName">
                    {t("create.newClientNameLabel")}
                  </Label>
                  <Input
                    className="mt-1"
                    id="newEntityName"
                    onChange={(e) => setNewEntityName(e.target.value)}
                    placeholder={t("create.clientNamePlaceholder")}
                    value={newEntityName}
                  />
                </div>
              )}
            </>
          ) : null}

          {submitError && (
            <p className="text-red-600 text-sm" role="alert">
              {submitError}
            </p>
          )}
          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("create.cancel")}
            </Button>
            <Button disabled={submitting} type="submit">
              {submitting ? t("portal.submitting") : t("create.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
