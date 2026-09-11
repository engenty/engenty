import { type FormEvent, useState } from "react";
import {
  connectDesktopServer,
  DEFAULT_DESKTOP_SERVER_URL,
  normalizeServerUrl,
} from "./desktop-runtime";

/**
 * First-run screen of the desktop shell: pick the engenty server this
 * installation talks to. Rendered before the main app (and its providers)
 * boots, so it stays dependency-free apart from Tailwind classes.
 */
export function ServerPickerScreen({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [serverUrl, setServerUrl] = useState(DEFAULT_DESKTOP_SERVER_URL);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeServerUrl(serverUrl);
    if (!normalized) {
      setError("Enter a server URL.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await connectDesktopServer(normalized);
      onConnected();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the server. Check the URL and your connection."
      );
      setConnecting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4">
      <div className="ui-card-panel w-full max-w-md p-6">
        <h1 className="font-semibold text-lg">Connect to engenty</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Enter the URL of the engenty server this desktop app should use. You
          can change it later from the menu-bar icon.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            autoFocus
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            disabled={connecting}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder="https://engenty.example.com"
            spellCheck={false}
            type="text"
            value={serverUrl}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <button
            className="w-full rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-60"
            disabled={connecting}
            type="submit"
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
