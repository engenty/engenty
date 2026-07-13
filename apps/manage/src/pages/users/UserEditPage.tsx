import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button, Input } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import { setUserPassword, updateUser } from "@/lib/api/users";
import { userQuery } from "@/lib/queries/users";

function generatePassword(): string {
  const alphabet =
    "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function UserEditPage() {
  const { t } = useTranslation("common");
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(userQuery(id));
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (data?.user) {
      setDisplayName(data.user.display_name ?? "");
      setEmail(data.user.email);
    }
  }, [data?.user]);

  const save = useMutation({
    mutationFn: () =>
      updateUser(id, { display_name: displayName.trim(), email: email.trim() }),
    onSuccess: async () => {
      toast.success(t("users.edit.success"));
      await queryClient.invalidateQueries({ queryKey: ["manage", "users"] });
      navigate(`/users/${id}`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const savePassword = useMutation({
    mutationFn: () => setUserPassword(id, password.trim()),
    onSuccess: () => {
      toast.success(t("users.edit.passwordSet"));
      setPassword("");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  return (
    <PageShell
      breadcrumbs={[
        { label: t("users.title"), to: "/users" },
        { label: data?.user.display_name ?? "…", to: `/users/${id}` },
        { label: t("users.edit.title") },
      ]}
      title={t("users.edit.title")}
    >
      <div className="max-w-md space-y-6 p-page">
        <PageState
          error={error}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm" htmlFor="user-name">
                {t("users.edit.nameLabel")}
              </label>
              <Input
                id="user-name"
                onChange={(e) => setDisplayName(e.target.value)}
                value={displayName}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm" htmlFor="user-email">
                {t("users.edit.emailLabel")}
              </label>
              <Input
                id="user-email"
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                value={email}
              />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={
                  !(email.trim() && displayName.trim()) || save.isPending
                }
                onClick={() => save.mutate()}
              >
                {t("common.save")}
              </Button>
              <Button
                onClick={() => navigate(`/users/${id}`)}
                variant="outline"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-border border-t pt-4">
            <h2 className="font-medium text-sm">{t("users.edit.password")}</h2>
            <div className="flex gap-2">
              <Input
                aria-label={t("users.edit.password")}
                onChange={(e) => setPassword(e.target.value)}
                type="text"
                value={password}
              />
              <Button
                onClick={() => setPassword(generatePassword())}
                variant="outline"
              >
                {t("users.edit.generate")}
              </Button>
            </div>
            <Button
              disabled={password.trim().length < 8 || savePassword.isPending}
              onClick={() => savePassword.mutate()}
            >
              {t("users.edit.setPassword")}
            </Button>
          </div>
        </PageState>
      </div>
    </PageShell>
  );
}
