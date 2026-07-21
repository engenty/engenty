import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button } from "@engenty/ui-core";
import { Copy, Eye, EyeOff, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type RevealedSecret,
  revealSecret,
  type SecretListItem,
} from "../api.js";
import { formatRelativeTime } from "../lib/format-relative-time.js";
import {
  extractDomain,
  maskSecretValue,
  primarySecretValue,
  SECRET_KIND_ICONS,
  SECRET_KIND_LABEL_KEYS,
} from "../lib/secret-kinds.js";

/** One-shot bulk reveal/hide command from the vault topbar. */
export interface SecretsBulkRevealCommand {
  mode: "show" | "hide";
  seq: number;
}

interface PayloadField {
  label: string;
  value: string;
}

/** Flatten a revealed payload into labeled rows; key_list payloads carry a
 * `keys: [{ name, value }]` array, everything else is a flat record. */
function payloadFields(payload: Record<string, unknown>): PayloadField[] {
  const keys = payload.keys;
  if (Array.isArray(keys)) {
    return keys.map((entry, index) => {
      const item = entry as { name?: string; value?: unknown };
      return {
        label: item.name || `#${index + 1}`,
        value: String(item.value ?? ""),
      };
    });
  }
  const order = ["username", "password"];
  return Object.entries(payload)
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    })
    .map(([label, value]) => ({ label, value: String(value ?? "") }));
}

export function SecretRow({
  secret,
  onEdit,
  bulkReveal,
}: {
  bulkReveal: SecretsBulkRevealCommand;
  secret: SecretListItem;
  onEdit: (secret: SecretListItem) => void;
}) {
  const { t, i18n } = useTranslation("secrets");
  /** Cached after the first audited reveal; cleared only on bulk hide. */
  const [payload, setPayload] = useState<RevealedSecret | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const KindIcon = SECRET_KIND_ICONS[secret.kind] ?? SECRET_KIND_ICONS.note;
  const domain = extractDomain(secret.url);
  const primary = payload
    ? primarySecretValue(secret.kind, payload.payload)
    : null;
  const maskLabel = primary ? maskSecretValue(primary) : "••••••••";

  async function ensurePayload(): Promise<RevealedSecret | null> {
    if (payloadRef.current) {
      return payloadRef.current;
    }
    setBusy(true);
    try {
      const data = await revealSecret(secret.id);
      setPayload(data);
      payloadRef.current = data;
      return data;
    } catch (error) {
      const message = String((error as Error).message ?? error);
      toast.error(
        /403|forbidden/i.test(message) ? t("vault.forbidden") : message
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleReveal() {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    const data = await ensurePayload();
    if (data) {
      setPanelOpen(true);
    }
  }

  async function copyPrimary() {
    const data = await ensurePayload();
    if (!data) {
      return;
    }
    const value = primarySecretValue(secret.kind, data.payload);
    if (!value) {
      toast.error(t("vault.forbidden"));
      return;
    }
    await copyValue(value, t("vault.secretValue"));
  }

  useEffect(() => {
    if (bulkReveal.seq === 0) {
      return;
    }
    if (bulkReveal.mode === "hide") {
      setPanelOpen(false);
      setPayload(null);
      payloadRef.current = null;
      return;
    }
    if (payloadRef.current) {
      setPanelOpen(true);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void revealSecret(secret.id)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setPayload(data);
        payloadRef.current = data;
        setPanelOpen(true);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = String((error as Error).message ?? error);
        toast.error(
          /403|forbidden/i.test(message) ? t("vault.forbidden") : message
        );
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bulkReveal.seq, bulkReveal.mode, secret.id, t]);

  async function copyValue(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("vault.copied", { field: label }));
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <KindIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h4 className="truncate font-medium text-sm">{secret.name}</h4>
            {domain && secret.url && (
              <a
                className="truncate text-muted-foreground text-xs hover:text-foreground hover:underline"
                href={secret.url}
                rel="noreferrer"
                target="_blank"
              >
                {domain}
              </a>
            )}
          </div>
          {secret.description && (
            <p className="truncate text-muted-foreground text-xs">
              {secret.description}
            </p>
          )}
        </div>
        <button
          aria-label={t("vault.clickToCopy")}
          className="hidden max-w-[8rem] shrink-0 truncate font-mono text-muted-foreground text-xs hover:text-foreground sm:inline"
          disabled={busy}
          onClick={() => void copyPrimary()}
          title={t("vault.clickToCopy")}
          type="button"
        >
          {maskLabel}
        </button>
        <span
          className="hidden whitespace-nowrap text-muted-foreground text-xs md:inline"
          title={secret.updated_at}
        >
          {t("vault.updated", {
            ago: formatRelativeTime(secret.updated_at, i18n.language),
          })}
        </span>
        <Badge
          className="hidden whitespace-nowrap sm:inline-flex"
          variant="outline"
        >
          {t(SECRET_KIND_LABEL_KEYS[secret.kind] ?? "kind.note")}
        </Badge>
        <Button
          aria-label={panelOpen ? t("vault.hide") : t("vault.reveal")}
          className="h-7 w-7 p-0"
          disabled={busy}
          onClick={() => void toggleReveal()}
          size="sm"
          title={panelOpen ? t("vault.hide") : t("vault.reveal")}
          type="button"
          variant="ghost"
        >
          {panelOpen ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          aria-label={t("vault.edit")}
          className="h-7 w-7 p-0"
          onClick={() => onEdit(secret)}
          size="sm"
          title={t("vault.edit")}
          type="button"
          variant="ghost"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      {panelOpen && payload && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {payloadFields(payload.payload).map((field) => (
            <div className="flex items-center gap-2" key={field.label}>
              <span className="w-16 shrink-0 truncate text-muted-foreground text-xs capitalize">
                {field.label}:
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded bg-muted px-2 py-1">
                <button
                  className="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-sm"
                  onClick={() => void copyValue(field.value, field.label)}
                  title={t("vault.clickToCopy")}
                  type="button"
                >
                  {field.value}
                </button>
                <Button
                  aria-label={t("vault.copy")}
                  className="h-6 w-6 shrink-0 p-0"
                  onClick={() => void copyValue(field.value, field.label)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
