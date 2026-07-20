// Remote channels settings: manage channel bindings (one messenger workspace/
// bot ↔ this tenant) and the verified external identities (messenger user →
// engenty user). All data flows through gateway ops via /api/tools.
//
// Note: remote_bindings_upsert replaces the whole row (no partial merge), so
// inline edits resend the full binding with the one field changed.
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type RemotePlatform = "slack" | "telegram" | "whatsapp" | "teams";
type SenderPolicy = "ignore" | "invite" | "deny";

interface Binding {
  agent_id: string;
  connection_id: string | null;
  display_name: string | null;
  external_workspace_id: string | null;
  id: string;
  platform: RemotePlatform;
  status: "active" | "disabled";
  unmapped_sender_policy: SenderPolicy;
}

interface Identity {
  display_name: string | null;
  external_user_id: string;
  id: string;
  platform: RemotePlatform;
  user_id: string;
  verified_at: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unexpected error";
}

async function invokeOp<T>(operationId: string, input: unknown): Promise<T> {
  const result = await requestApiJson<{ data?: T } & Record<string, unknown>>(
    `/api/tools/${operationId}/invoke`,
    { body: { input }, method: "POST" }
  );
  return (result.data ?? result) as T;
}

const keys = {
  bindings: ["engenty-remote", "bindings"] as const,
  identities: ["engenty-remote", "identities"] as const,
};

const CREATE_PLATFORMS: RemotePlatform[] = ["slack", "telegram"];
const POLICIES: SenderPolicy[] = ["ignore", "invite", "deny"];

export function RemoteSettingsPage() {
  const { t } = useTranslation("engenty-remote");
  const queryClient = useQueryClient();

  const bindingsQuery = useQuery({
    queryFn: () =>
      invokeOp<{ bindings: Binding[] }>("remote_bindings_list", {}),
    queryKey: keys.bindings,
  });
  const identitiesQuery = useQuery({
    queryFn: () =>
      invokeOp<{ identities: Identity[] }>("remote_identities_list", {}),
    queryKey: keys.identities,
  });

  const invalidateBindings = () =>
    queryClient.invalidateQueries({ queryKey: keys.bindings });
  const invalidateIdentities = () =>
    queryClient.invalidateQueries({ queryKey: keys.identities });

  const [form, setForm] = useState({
    displayName: "",
    platform: "slack" as RemotePlatform,
    policy: "invite" as SenderPolicy,
    workspaceId: "",
  });

  const createBinding = useMutation({
    mutationFn: () =>
      invokeOp("remote_bindings_upsert", {
        display_name: form.displayName.trim() || null,
        external_workspace_id: form.workspaceId.trim() || null,
        platform: form.platform,
        unmapped_sender_policy: form.policy,
      }),
    onError: (error) =>
      toast.error(t("toasts.createFailed", { error: errorMessage(error) })),
    onSuccess: () => {
      setForm((previous) => ({
        ...previous,
        displayName: "",
        workspaceId: "",
      }));
      invalidateBindings();
    },
  });

  // Upsert replaces the row, so always send the full binding back.
  const updateBinding = useMutation({
    mutationFn: (binding: Binding) =>
      invokeOp("remote_bindings_upsert", {
        agent_id: binding.agent_id,
        connection_id: binding.connection_id,
        display_name: binding.display_name,
        external_workspace_id: binding.external_workspace_id,
        id: binding.id,
        platform: binding.platform,
        status: binding.status,
        unmapped_sender_policy: binding.unmapped_sender_policy,
      }),
    onError: (error) =>
      toast.error(t("toasts.updateFailed", { error: errorMessage(error) })),
    onSuccess: invalidateBindings,
  });

  const deleteBinding = useMutation({
    mutationFn: (id: string) => invokeOp("remote_bindings_delete", { id }),
    onError: (error) =>
      toast.error(t("toasts.deleteFailed", { error: errorMessage(error) })),
    onSuccess: invalidateBindings,
  });

  const revokeIdentity = useMutation({
    mutationFn: (id: string) => invokeOp("remote_identity_revoke", { id }),
    onError: (error) =>
      toast.error(t("toasts.revokeFailed", { error: errorMessage(error) })),
    onSuccess: invalidateIdentities,
  });

  // Surface list-load failures too (a failed query would otherwise render as a
  // silent empty state — e.g. before the module_remote schema is exposed).
  const bindingsError = bindingsQuery.error;
  const identitiesError = identitiesQuery.error;
  useEffect(() => {
    if (bindingsError) {
      toast.error(
        t("toasts.loadFailed", { error: errorMessage(bindingsError) })
      );
    }
  }, [bindingsError, t]);
  useEffect(() => {
    if (identitiesError) {
      toast.error(
        t("toasts.loadFailed", { error: errorMessage(identitiesError) })
      );
    }
  }, [identitiesError, t]);

  const bindings = bindingsQuery.data?.bindings ?? [];
  const identities = identitiesQuery.data?.identities ?? [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-semibold text-xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      {/* ── Bindings ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium text-base">{t("bindings.title")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("bindings.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/60 bg-card p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {t("bindings.platform")}
            </span>
            <Select
              onValueChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  platform: value as RemotePlatform,
                }))
              }
              value={form.platform}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATE_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {t(`platform.${platform}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {t("bindings.displayName")}
            </span>
            <Input
              className="w-48"
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  displayName: event.target.value,
                }))
              }
              placeholder={t("bindings.displayNamePlaceholder")}
              value={form.displayName}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {t("bindings.policy")}
            </span>
            <Select
              onValueChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  policy: value as SenderPolicy,
                }))
              }
              value={form.policy}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICIES.map((policy) => (
                  <SelectItem key={policy} value={policy}>
                    {t(`policy.${policy}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {t("bindings.workspaceId")}
            </span>
            <Input
              className="w-44"
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  workspaceId: event.target.value,
                }))
              }
              placeholder={t("bindings.workspaceIdPlaceholder")}
              value={form.workspaceId}
            />
          </div>
          <Button
            disabled={createBinding.isPending}
            onClick={() => createBinding.mutate()}
            size="sm"
          >
            {t("bindings.create")}
          </Button>
        </div>

        {bindings.length === 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/40 p-4 text-muted-foreground text-sm">
            {t("bindings.empty")}
          </div>
        ) : (
          <div className="rounded-md border border-border/60 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bindings.platform")}</TableHead>
                  <TableHead>{t("bindings.displayName")}</TableHead>
                  <TableHead>{t("bindings.workspaceId")}</TableHead>
                  <TableHead>{t("bindings.policy")}</TableHead>
                  <TableHead>{t("bindings.status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bindings.map((binding) => (
                  <TableRow key={binding.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`platform.${binding.platform}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {binding.display_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {binding.external_workspace_id ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Select
                        disabled={updateBinding.isPending}
                        onValueChange={(value) =>
                          updateBinding.mutate({
                            ...binding,
                            unmapped_sender_policy: value as SenderPolicy,
                          })
                        }
                        value={binding.unmapped_sender_policy}
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {POLICIES.map((policy) => (
                            <SelectItem key={policy} value={policy}>
                              {t(`policy.${policy}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={binding.status === "active"}
                          disabled={updateBinding.isPending}
                          onCheckedChange={(checked) =>
                            updateBinding.mutate({
                              ...binding,
                              status: checked ? "active" : "disabled",
                            })
                          }
                        />
                        <span className="text-muted-foreground text-xs">
                          {binding.status === "active"
                            ? t("bindings.active")
                            : t("bindings.disabled")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            {t("bindings.delete")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("bindings.deleteConfirmTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("bindings.deleteConfirmBody", {
                                name:
                                  binding.display_name ??
                                  t(`platform.${binding.platform}`),
                              })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteBinding.mutate(binding.id)}
                            >
                              {t("bindings.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ── Linked identities ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium text-base">{t("identities.title")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("identities.subtitle")}
          </p>
        </div>

        {identities.length === 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/40 p-4 text-muted-foreground text-sm">
            {t("identities.empty")}
          </div>
        ) : (
          <div className="rounded-md border border-border/60 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bindings.platform")}</TableHead>
                  <TableHead>{t("identities.externalUser")}</TableHead>
                  <TableHead>{t("identities.displayName")}</TableHead>
                  <TableHead>{t("identities.user")}</TableHead>
                  <TableHead>{t("identities.verifiedAt")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {identities.map((identity) => (
                  <TableRow key={identity.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`platform.${identity.platform}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {identity.external_user_id}
                    </TableCell>
                    <TableCell className="font-medium">
                      {identity.display_name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {identity.user_id}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {identity.verified_at
                        ? new Date(identity.verified_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            {t("identities.revoke")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("identities.revokeConfirmTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("identities.revokeConfirmBody", {
                                name:
                                  identity.display_name ??
                                  identity.external_user_id,
                              })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => revokeIdentity.mutate(identity.id)}
                            >
                              {t("identities.revoke")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
