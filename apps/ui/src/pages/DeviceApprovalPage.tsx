import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, Input, Label } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getWorkspaceContext, request } from "@/lib/api/client";

interface ApproveResponse {
  granted?: { capabilities: string[] };
  status: "approved" | "denied";
}

interface TenantOption {
  id: string;
  name: string;
}

function normalizeCode(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return cleaned.length > 4
    ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
    : cleaned;
}

export function DeviceApprovalPage() {
  const { t } = useTranslation("common");
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(() =>
    normalizeCode(searchParams.get("user_code") ?? "")
  );
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApproveResponse | null>(null);

  usePageConfig({
    breadcrumbs: useMemo(() => [{ label: t("deviceApproval.title") }], [t]),
  });

  useEffect(() => {
    getWorkspaceContext()
      .then((context) => {
        const options = (context.tenants ?? []).map((tenant) => ({
          id: tenant.id,
          name: tenant.name ?? tenant.id,
        }));
        setTenants(options);
        setTenantId(context.currentTenant?.id ?? options[0]?.id ?? "");
      })
      .catch(() => setTenants([]));
  }, []);

  const decide = async (action: "approve" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      const response = await request<ApproveResponse>(
        "/api/auth/device/approve",
        {
          method: "POST",
          body: JSON.stringify({ action, tenantId, userCode: code }),
        }
      );
      setResult(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes("404")
          ? t("deviceApproval.errorNotFound")
          : message.includes("403")
            ? t("deviceApproval.errorForbidden")
            : message
      );
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Card className="mx-auto mt-12 max-w-md space-y-4 p-6 text-center">
        <h1 className="font-semibold text-xl">
          {result.status === "approved"
            ? t("deviceApproval.approvedTitle")
            : t("deviceApproval.deniedTitle")}
        </h1>
        {result.status === "approved" && result.granted && (
          <p className="text-muted-foreground text-sm">
            {t("deviceApproval.grantedLabel")}:{" "}
            {result.granted.capabilities.join(", ") ||
              t("deviceApproval.grantedNone")}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          {t("deviceApproval.returnToTerminal")}
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto mt-12 max-w-md space-y-4 p-6">
      <h1 className="font-semibold text-xl">{t("deviceApproval.title")}</h1>
      <p className="text-muted-foreground text-sm">
        {t("deviceApproval.subtitle")}
      </p>
      <div className="space-y-2">
        <Label htmlFor="device-code">{t("deviceApproval.codeLabel")}</Label>
        <Input
          autoFocus
          className="text-center font-mono text-lg tracking-widest"
          id="device-code"
          onChange={(event) => setCode(normalizeCode(event.target.value))}
          placeholder="XXXX-XXXX"
          value={code}
        />
      </div>
      {tenants.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="device-tenant">
            {t("deviceApproval.tenantLabel")}
          </Label>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            id="device-tenant"
            onChange={(event) => setTenantId(event.target.value)}
            value={tenantId}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy || code.length !== 9 || !tenantId}
          onClick={() => decide("approve")}
        >
          {t("deviceApproval.approve")}
        </Button>
        <Button
          className="flex-1"
          disabled={busy || code.length !== 9}
          onClick={() => decide("deny")}
          variant="outline"
        >
          {t("deviceApproval.deny")}
        </Button>
      </div>
    </Card>
  );
}
