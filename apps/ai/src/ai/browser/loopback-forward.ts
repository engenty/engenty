// The browser half of a CLI sign-in (`browser_sign_in`).
//
// A CLI that logs in itself (`acme login`) listens on 127.0.0.1:<port> in the
// Space computer and sends the person to a sign-in page whose last redirect
// goes to that port. The page opens in the agent's window of the Space
// browser, a different container: its 127.0.0.1 has nothing listening. So
// while a sign-in waits, the window's one navigation to that port is caught
// here and replayed inside the computer, host-side (`execInSpaceComputer`) —
// the browser never joins the computer's network (D2).
//
// Watched through the page's `request` event, not `page.route`: Playwright
// does not route the hops of a redirect, and a sign-in callback is always one.
// The browser's own attempt fails (connection refused) and the page is then
// replaced by a fixed note. The CLI's reply is shown as text, never rendered:
// its HTML would run in the browser that holds the Space's logins.

export interface CallbackRequest {
  isNavigationRequest(): boolean;
  method(): string;
  url(): string;
}

export interface SignInPage {
  off(
    event: "request" | "requestfailed",
    listener: (request: CallbackRequest) => void
  ): unknown;
  on(
    event: "request" | "requestfailed",
    listener: (request: CallbackRequest) => void
  ): unknown;
  setContent(html: string): Promise<void>;
}

/** What the CLI answered, as `curl` in the computer saw it. */
export interface ForwardResult {
  error?: string;
  status: number | null;
  text: string;
}

export type ForwardToComputer = (url: string) => Promise<ForwardResult>;

export interface CallbackOutcome {
  delivered: boolean;
  error?: string;
  status: number | null;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** Waiting for the browser's own attempt to fail before replacing the page. */
const BROWSER_FAILURE_WAIT_MS = 5000;

function loopbackPortOf(value: string): number | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
      return null;
    }
    const port = Number.parseInt(url.port, 10);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

/**
 * The loopback port a sign-in URL redirects to (`redirect_uri=http://127.0.0.1:53682/…`),
 * or null when none of its query values is one.
 */
export function loopbackCallbackPort(authUrl: string): number | null {
  let url: URL;
  try {
    url = new URL(authUrl);
  } catch {
    return null;
  }
  for (const value of url.searchParams.values()) {
    const port = loopbackPortOf(value);
    if (port) {
      return port;
    }
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** The CLI's reply reduced to a line of text. */
function plainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function notePage(outcome: CallbackOutcome, reply: string): string {
  const heading = outcome.delivered
    ? "The sign-in reached the CLI on the Space's computer."
    : "The sign-in did not reach the CLI on the Space's computer.";
  const detail = outcome.delivered
    ? `It answered: ${reply || `HTTP ${outcome.status}`}`
    : (outcome.error ?? "");
  return `<!doctype html><title>Sign-in</title><body style="font:15px system-ui;margin:48px"><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(detail)}</p><p>Go back to the chat and answer the card there.</p></body>`;
}

/**
 * Watch `page` for its navigation to `127.0.0.1:<port>` and replay the first
 * one in the computer. Anything else — another host or port, a script's
 * fetch, a second callback, anything after `disarm` — is left to the browser.
 */
export function armLoopbackForward(input: {
  forward: ForwardToComputer;
  page: SignInPage;
  port: number;
}): { disarm(): void; settle(): Promise<CallbackOutcome | null> } {
  let outcome: CallbackOutcome | null = null;
  let caught: CallbackRequest | null = null;
  let inflight: Promise<void> | null = null;
  let browserFailed: () => void = () => undefined;
  const failed = new Promise<void>((resolve) => {
    browserFailed = resolve;
  });

  const onFailed = (request: CallbackRequest) => {
    if (request === caught) {
      browserFailed();
    }
  };
  const onRequest = (request: CallbackRequest) => {
    if (
      caught ||
      !request.isNavigationRequest() ||
      request.method() !== "GET" ||
      loopbackPortOf(request.url()) !== input.port
    ) {
      return;
    }
    caught = request;
    disarm();
    input.page.on("requestfailed", onFailed);
    const url = request.url();
    inflight = (async () => {
      const result = await input.forward(url).catch(
        (err): ForwardResult => ({
          error: err instanceof Error ? err.message : String(err),
          status: null,
          text: "",
        })
      );
      const delivered =
        result.status !== null && result.status >= 200 && result.status < 400;
      outcome = {
        delivered,
        status: result.status,
        ...(delivered
          ? {}
          : {
              error:
                result.error ??
                `The CLI answered HTTP ${result.status ?? "nothing"}.`,
            }),
      };
      await Promise.race([
        failed,
        new Promise((resolve) => setTimeout(resolve, BROWSER_FAILURE_WAIT_MS)),
      ]);
      input.page.off("requestfailed", onFailed);
      await input.page
        .setContent(notePage(outcome, plainText(result.text)))
        .catch(() => undefined);
    })();
  };

  function disarm() {
    input.page.off("request", onRequest);
  }

  /** Stop watching; what the callback came to, once its forward finished. */
  async function settle(): Promise<CallbackOutcome | null> {
    disarm();
    await inflight;
    return outcome;
  }

  input.page.on("request", onRequest);
  return { disarm, settle };
}
