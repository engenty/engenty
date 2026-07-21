import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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
  Textarea,
} from "@engenty/ui-core";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  ClientOption,
  OwnerScope,
  ProjectOption,
  SecretKind,
  SecretListItem,
} from "../api.js";
import { SECRET_KIND_LABEL_KEYS } from "../lib/secret-kinds.js";
import {
  useCreateSecretMutation,
  useDeleteSecretMutation,
  useUpdateSecretMutation,
} from "../queries.js";

const CREATABLE_KINDS: SecretKind[] = [
  "username_password",
  "api_key",
  "credit_card",
  "note",
];

interface PayloadDraft {
  content: string;
  cvv: string;
  expiry: string;
  number: string;
  password: string;
  username: string;
  value: string;
}

const EMPTY_PAYLOAD: PayloadDraft = {
  username: "",
  password: "",
  value: "",
  number: "",
  expiry: "",
  cvv: "",
  content: "",
};

function buildPayload(
  kind: SecretKind,
  draft: PayloadDraft
): Record<string, unknown> | null {
  switch (kind) {
    case "username_password":
      if (!(draft.username || draft.password)) {
        return null;
      }
      return { username: draft.username, password: draft.password };
    case "api_key":
      return draft.value ? { value: draft.value } : null;
    case "credit_card":
      if (!(draft.number || draft.expiry || draft.cvv)) {
        return null;
      }
      return { number: draft.number, expiry: draft.expiry, cvv: draft.cvv };
    case "note":
      return draft.content ? { content: draft.content } : null;
    default:
      return null;
  }
}

export function SecretFormDialog({
  open,
  onOpenChange,
  secret,
  clients,
  projects,
  currentUserId,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create mode */
  secret: SecretListItem | null;
  clients: ClientOption[];
  projects: ProjectOption[];
  currentUserId: string | null;
  tenantId: string | null;
}) {
  const { t } = useTranslation("secrets");
  const createMutation = useCreateSecretMutation();
  const updateMutation = useUpdateSecretMutation();
  const deleteMutation = useDeleteSecretMutation();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<SecretKind>("username_password");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [ownerScope, setOwnerScope] = useState<OwnerScope>("user");
  const [ownerId, setOwnerId] = useState("");
  const [payload, setPayload] = useState<PayloadDraft>(EMPTY_PAYLOAD);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(secret?.name ?? "");
    setKind(secret?.kind ?? "username_password");
    setUrl(secret?.url ?? "");
    setDescription(secret?.description ?? "");
    setOwnerScope(secret?.owner_scope ?? "user");
    setOwnerId(secret?.owner_id ?? "");
    setPayload(EMPTY_PAYLOAD);
  }, [open, secret?.id]);

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  function resolvedOwnerId(scope: OwnerScope): string {
    if (scope === "user") {
      return currentUserId ?? "";
    }
    if (scope === "tenant") {
      return tenantId ?? "";
    }
    return ownerId;
  }

  const ownerReady = resolvedOwnerId(ownerScope).length > 0;
  const payloadDraft = buildPayload(kind, payload);
  const canSubmit =
    name.trim().length > 0 &&
    ownerReady &&
    !busy &&
    (secret ? true : payloadDraft !== null);

  async function submit() {
    try {
      if (secret) {
        const ownerChanged =
          ownerScope !== secret.owner_scope ||
          resolvedOwnerId(ownerScope) !== secret.owner_id;
        await updateMutation.mutateAsync({
          update: {
            id: secret.id,
            name: name.trim(),
            url: url.trim() || null,
            description: description.trim() || null,
            ...(payloadDraft ? { payload: payloadDraft } : {}),
          },
          ...(ownerChanged
            ? {
                move: {
                  owner_scope: ownerScope,
                  owner_id: resolvedOwnerId(ownerScope),
                },
              }
            : {}),
        });
        toast.success(t("form.updated"));
      } else {
        await createMutation.mutateAsync({
          owner_scope: ownerScope,
          owner_id: resolvedOwnerId(ownerScope),
          name: name.trim(),
          kind,
          url: url.trim() || undefined,
          description: description.trim() || undefined,
          payload: payloadDraft ?? {},
        });
        toast.success(t("form.created"));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(String((error as Error).message ?? error));
    }
  }

  async function remove() {
    if (!secret) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(secret.id);
      toast.success(t("form.deleted"));
      onOpenChange(false);
    } catch (error) {
      toast.error(String((error as Error).message ?? error));
    }
  }

  const payloadPlaceholder = secret ? t("form.leaveEmptyToKeep") : undefined;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {secret ? t("form.editTitle") : t("form.addTitle")}
          </DialogTitle>
          <DialogDescription>{t("form.subtitle")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {secret ? null : (
            <Select
              onValueChange={(value) => setKind(value as SecretKind)}
              value={kind}
            >
              <SelectTrigger
                aria-label={t("form.kind")}
                className="w-full sm:w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATABLE_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(SECRET_KIND_LABEL_KEYS[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="secret-name">{t("form.name")}</Label>
              <Input
                autoComplete="off"
                id="secret-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            {secret ? (
              <Badge className="mb-1.5 whitespace-nowrap" variant="secondary">
                {t(SECRET_KIND_LABEL_KEYS[secret.kind] ?? "kind.note")}
              </Badge>
            ) : null}
          </div>

          {kind === "username_password" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="secret-username">{t("form.username")}</Label>
                <Input
                  autoComplete="off"
                  id="secret-username"
                  onChange={(event) =>
                    setPayload((p) => ({ ...p, username: event.target.value }))
                  }
                  placeholder={payloadPlaceholder}
                  value={payload.username}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="secret-password">{t("form.password")}</Label>
                <Input
                  autoComplete="off"
                  id="secret-password"
                  onChange={(event) =>
                    setPayload((p) => ({ ...p, password: event.target.value }))
                  }
                  placeholder={payloadPlaceholder}
                  type="password"
                  value={payload.password}
                />
              </div>
            </div>
          )}
          {kind === "api_key" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="secret-value">{t("form.value")}</Label>
              <Input
                autoComplete="off"
                id="secret-value"
                onChange={(event) =>
                  setPayload((p) => ({ ...p, value: event.target.value }))
                }
                placeholder={payloadPlaceholder}
                type="password"
                value={payload.value}
              />
            </div>
          )}
          {kind === "credit_card" && (
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="secret-card-number">
                  {t("form.cardNumber")}
                </Label>
                <Input
                  autoComplete="off"
                  id="secret-card-number"
                  inputMode="numeric"
                  onChange={(event) =>
                    setPayload((p) => ({ ...p, number: event.target.value }))
                  }
                  placeholder={payloadPlaceholder}
                  value={payload.number}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="secret-card-expiry">
                  {t("form.cardExpiry")}
                </Label>
                <Input
                  autoComplete="off"
                  id="secret-card-expiry"
                  onChange={(event) =>
                    setPayload((p) => ({ ...p, expiry: event.target.value }))
                  }
                  placeholder="MM/YY"
                  value={payload.expiry}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="secret-card-cvv">{t("form.cardCvv")}</Label>
                <Input
                  autoComplete="off"
                  id="secret-card-cvv"
                  inputMode="numeric"
                  onChange={(event) =>
                    setPayload((p) => ({ ...p, cvv: event.target.value }))
                  }
                  placeholder={payloadPlaceholder}
                  type="password"
                  value={payload.cvv}
                />
              </div>
            </div>
          )}
          {kind === "note" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="secret-content">{t("form.content")}</Label>
              <Textarea
                id="secret-content"
                onChange={(event) =>
                  setPayload((p) => ({ ...p, content: event.target.value }))
                }
                placeholder={payloadPlaceholder}
                rows={4}
                value={payload.content}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("form.owner")}</Label>
              <Select
                onValueChange={(value) => {
                  setOwnerScope(value as OwnerScope);
                  setOwnerId("");
                }}
                value={ownerScope}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("scope.user")}</SelectItem>
                  <SelectItem value="tenant">{t("scope.tenant")}</SelectItem>
                  <SelectItem value="client">{t("scope.client")}</SelectItem>
                  <SelectItem value="project">{t("scope.project")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(ownerScope === "client" || ownerScope === "project") && (
              <div className="flex flex-col gap-1.5">
                <Label>
                  {ownerScope === "client"
                    ? t("scope.client")
                    : t("scope.project")}
                </Label>
                <Select onValueChange={setOwnerId} value={ownerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("form.selectOwner")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerScope === "client"
                      ? clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.display_name}
                          </SelectItem>
                        ))
                      : projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.title}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="secret-url">{t("form.url")}</Label>
            <Input
              autoComplete="off"
              id="secret-url"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
              value={url}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="secret-description">{t("form.description")}</Label>
            <Textarea
              id="secret-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </div>

          <DialogFooter className="mt-2 gap-2 sm:justify-between">
            <div>
              {secret && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={busy}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t("form.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("form.deleteConfirmTitle")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("form.deleteConfirmBody", { name: secret.name })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void remove()}>
                        {t("form.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onOpenChange(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("form.cancel")}
              </Button>
              <Button disabled={!canSubmit} size="sm" type="submit">
                {secret ? t("form.update") : t("form.add")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
