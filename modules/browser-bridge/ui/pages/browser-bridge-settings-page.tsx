import { getApiBaseUrl, getCurrentAccessToken } from "@engenty/api-client";
import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type BridgeSessionStatus,
  disconnectInstallation,
  getBridgeSession,
  linkInstallation,
  updateAllowlist,
} from "../api.js";
import { useBrowserBridgeSettingsAgentUiSlice } from "../hooks/use-browser-bridge-agent-ui-slice.js";

const STATUS_POLL_MS = 10_000;
const EXTENSION_ID_STORAGE_KEY = "engenty.browser-bridge.extension-id";

/** Message contract for the web-app → extension link handshake. */
interface BridgeLinkMessage {
  allowed_origins: string[];
  api_base_url: string;
  connection_id: string;
  device_label: string;
  installation_id: string;
  kind: "engenty-bridge-link";
  session_id: string;
  token: string;
}

interface ChromeRuntimeLike {
  runtime?: {
    sendMessage: (
      extensionId: string,
      message: unknown,
      callback: (response: unknown) => void
    ) => void;
    lastError?: { message?: string };
  };
}

function sendToExtension(
  extensionId: string,
  message: BridgeLinkMessage
): Promise<unknown> {
  const chromeGlobal = (globalThis as { chrome?: ChromeRuntimeLike }).chrome;
  const runtime = chromeGlobal?.runtime;
  if (!runtime?.sendMessage) {
    return Promise.reject(
      new Error(
        "This browser cannot message extensions here — use Chrome on an origin listed in the extension's externally_connectable matches."
      )
    );
  }
  return new Promise((resolve, reject) => {
    runtime.sendMessage(extensionId, message, (response) => {
      const lastError = runtime.lastError;
      if (lastError) {
        reject(
          new Error(
            lastError.message ??
              "The extension did not answer — is it installed and is this origin allowed?"
          )
        );
        return;
      }
      resolve(response);
    });
  });
}

function parseOrigins(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function BrowserBridgeSettingsPage() {
  const { t: tCommon } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(tCommon("navigation.settings"));
  const [status, setStatus] = useState<BridgeSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [extensionId, setExtensionId] = useState(
    () => localStorage.getItem(EXTENSION_ID_STORAGE_KEY) ?? ""
  );
  const [allowlistText, setAllowlistText] = useState("");
  const [allowlistDirty, setAllowlistDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: "Browser bridge" },
    ],
    [moduleRootCrumb]
  );
  usePageConfig({ breadcrumbs, secondaryNavHeaderSlot });

  const refresh = useCallback(async () => {
    try {
      const next = await getBridgeSession();
      setStatus(next);
      setAllowlistDirty((dirty) => {
        if (!dirty) {
          setAllowlistText(
            (next.installation?.allowed_origins ?? []).join("\n")
          );
        }
        return dirty;
      });
    } catch {
      // transient — keep the previous status
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const installation = status?.installation ?? null;
  const linked = installation !== null && status?.session?.status === "active";
  useBrowserBridgeSettingsAgentUiSlice({
    linked,
    online: status?.online === true,
  });

  const handleLink = async () => {
    const targetExtensionId = extensionId.trim();
    if (!targetExtensionId) {
      toast.error(
        "Enter the extension id (chrome://extensions, Developer mode)."
      );
      return;
    }
    localStorage.setItem(EXTENSION_ID_STORAGE_KEY, targetExtensionId);
    setBusy(true);
    try {
      const deviceLabel = `Chrome — ${navigator.platform || "this device"}`;
      const allowedOrigins = parseOrigins(allowlistText);
      // The web app holds the Supabase session, so IT creates the link server
      // side and hands the result plus an access token to the extension. The
      // extension shows its own confirm UI before persisting anything.
      const link = await linkInstallation({ allowedOrigins, deviceLabel });
      const token = await getCurrentAccessToken();
      if (!token) {
        throw new Error("No active session token available.");
      }
      await sendToExtension(targetExtensionId, {
        allowed_origins: allowedOrigins,
        api_base_url: getApiBaseUrl() || window.location.origin,
        connection_id: link.connection_id,
        device_label: deviceLabel,
        installation_id: link.installation_id,
        kind: "engenty-bridge-link",
        session_id: link.session_id,
        token,
      });
      toast.success("Link sent — confirm it in the extension's side panel.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Linking failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAllowlist = async () => {
    if (!installation) {
      return;
    }
    setBusy(true);
    try {
      const result = await updateAllowlist({
        allowedOrigins: parseOrigins(allowlistText),
        installationId: installation.installation_id,
      });
      setAllowlistText(result.allowed_origins.join("\n"));
      setAllowlistDirty(false);
      toast.success("Allowlist saved.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!installation) {
      return;
    }
    setBusy(true);
    try {
      await disconnectInstallation(installation.installation_id);
      toast.success("Browser unlinked.");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Disconnect failed."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 p-page">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Extension link
              {loading ? (
                <Badge variant="outline">…</Badge>
              ) : linked ? (
                <Badge variant={status?.online ? "default" : "secondary"}>
                  {status?.online ? "online" : "offline"}
                </Badge>
              ) : (
                <Badge variant="outline">not linked</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Link the engenty browser extension so agents can drive a dedicated
              browser window: navigate, observe pages, and — with your approval
              — click and fill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {linked && installation ? (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Device: </span>
                  {installation.device_label}
                </div>
                <div>
                  <span className="text-muted-foreground">Last seen: </span>
                  {new Date(installation.last_seen_at).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">Linked thread: </span>
                  {status?.session?.thread_id ?? "none"}
                </div>
                <Button
                  disabled={busy}
                  onClick={() => void handleDisconnect()}
                  size="sm"
                  variant="outline"
                >
                  Unlink browser
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  1. Load the extension (chrome://extensions → Load unpacked →
                  the built <code>apps/browser-extension/dist</code> folder).
                  <br />
                  2. Copy its id from the extensions page and paste it below.
                  <br />
                  3. Click Link and confirm in the extension's side panel.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="bb-extension-id">Extension id</Label>
                  <Input
                    id="bb-extension-id"
                    onChange={(e) => setExtensionId(e.target.value)}
                    placeholder="e.g. abcdefghijklmnopabcdefghijklmnop"
                    value={extensionId}
                  />
                </div>
                <Button disabled={busy} onClick={() => void handleLink()}>
                  Link extension
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Origin allowlist</CardTitle>
            <CardDescription>
              Agents can only navigate the managed window to these origins (one
              per line, e.g. https://app.example.com or https://*.example.com).
              An empty list blocks all navigation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              onChange={(e) => {
                setAllowlistText(e.target.value);
                setAllowlistDirty(true);
              }}
              placeholder={"https://app.example.com\nhttps://*.example.com"}
              rows={5}
              value={allowlistText}
            />
            <Button
              disabled={busy || !installation || !allowlistDirty}
              onClick={() => void handleSaveAllowlist()}
              size="sm"
            >
              Save allowlist
            </Button>
            {!installation && (
              <p className="text-muted-foreground text-xs">
                Link the extension first — the allowlist you type here is also
                sent along at link time.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
