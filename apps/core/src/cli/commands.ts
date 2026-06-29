import os from "node:os";
import type { Command } from "commander";
import {
  loginWithDevCredentials,
  resolveDevLoginParams,
} from "./auth-dev-login.js";
import {
  authenticatedJsonRequest,
  CLI_AUTH_SESSION_FILE,
  clearStoredSession,
  getStoredSession,
  pollDeviceToken,
  startDeviceAuthorization,
  storeSession,
} from "./auth-sdk.js";
import { registerAuthTokensCommands } from "./auth-tokens-commands.js";
import { runCliAction } from "./cli-errors.js";
import { callCoreApi, defaultApiUrl, resolveApiUrl } from "./core-api.js";
import { openInBrowser } from "./open-browser.js";

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authentication and token session flows");
  registerAuthTokensCommands(auth);
  auth
    .command("login")
    .option(
      "--dev",
      "Dev login: real Supabase user token (needed for /ai routes, e.g. engenty skills); uses ENGENTY_DEV_EMAIL/ENGENTY_DEV_PASS"
    )
    .option("--email <email>", "Dev login email (default ENGENTY_DEV_EMAIL)")
    .option(
      "--password <pass>",
      "Dev login password (default ENGENTY_DEV_PASS)"
    )
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option(
      "--capabilities <csv>",
      "Narrow the requested capabilities (default: everything your role allows)"
    )
    .option("--no-browser", "Print the verification URL only (SSH/headless)")
    .action(
      runCliAction(
        async (opts: {
          apiUrl?: string;
          browser?: boolean;
          capabilities?: string;
          dev?: boolean;
          email?: string;
          password?: string;
        }) => {
          if (opts.dev) {
            const session = await loginWithDevCredentials(
              resolveDevLoginParams({
                apiUrl: resolveApiUrl(opts),
                email: opts.email,
                password: opts.password,
              })
            );
            storeSession(session);
            console.log(
              JSON.stringify(
                {
                  ok: true,
                  apiUrl: session.apiUrl,
                  mode: "dev",
                  expiresAt: session.expiresAt
                    ? new Date(session.expiresAt).toISOString()
                    : null,
                },
                null,
                2
              )
            );
            console.error(
              `Dev login complete (Supabase user token). Session saved to ${CLI_AUTH_SESSION_FILE}.`
            );
            return;
          }
          await deviceFlowLoginAction(opts);
        }
      )
    );

  async function deviceFlowLoginAction(opts: {
    apiUrl?: string;
    browser?: boolean;
    capabilities?: string;
  }): Promise<void> {
    const apiUrl = resolveApiUrl(opts);
    const start = await startDeviceAuthorization({
      apiUrl,
      capabilities: String(opts.capabilities ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      clientName: `engenty-cli@${os.hostname()}`,
    });
    console.error(
      [
        "",
        `  Confirm this login in your browser. Your code: ${start.userCode}`,
        "",
        `  ${start.verificationUriComplete}`,
        "",
      ].join("\n")
    );
    if (opts.browser !== false) {
      openInBrowser(start.verificationUriComplete);
    }
    console.error("  Waiting for approval…");
    const session = await pollDeviceToken({
      apiUrl,
      deviceCode: start.deviceCode,
      expiresIn: start.expiresIn,
      intervalSeconds: start.interval,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          apiUrl: session.apiUrl,
          sessionId: session.sessionId,
          expiresAt: session.expiresAt
            ? new Date(session.expiresAt).toISOString()
            : null,
        },
        null,
        2
      )
    );
    console.error(`Login approved. Session saved to ${CLI_AUTH_SESSION_FILE}.`);
  }

  auth
    .command("status")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .action(async (opts: { apiUrl?: string }) => {
      const apiUrl = resolveApiUrl(opts);
      const stored = getStoredSession(apiUrl);
      if (!stored) {
        console.log(JSON.stringify({ authenticated: false }, null, 2));
        return;
      }
      const introspection = await authenticatedJsonRequest<
        Record<string, unknown>
      >({
        apiUrl,
        endpoint: "/api/auth/token/introspect",
        method: "POST",
        body: { token: stored.accessToken },
      });
      console.log(
        JSON.stringify({ authenticated: true, session: introspection }, null, 2)
      );
    });

  auth
    .command("logout")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .action(async (opts: { apiUrl?: string }) => {
      const apiUrl = resolveApiUrl(opts);
      const stored = getStoredSession(apiUrl);
      if (stored?.sessionId) {
        await authenticatedJsonRequest<Record<string, unknown>>({
          apiUrl,
          endpoint: `/api/auth/sessions/${encodeURIComponent(stored.sessionId)}`,
          method: "DELETE",
        }).catch(() => undefined);
      }
      clearStoredSession();
      console.log(JSON.stringify({ ok: true, loggedOut: true }, null, 2));
    });
}

export function registerModuleOperationCommands(program: Command): void {
  const existingModules = program.commands.find(
    (command) => command.name() === "modules"
  );
  const modules =
    existingModules ??
    program
      .command("modules")
      .description("Module-first tool access (alias — prefer `engenty tools`)");
  const tools = modules.command("tools").description("List and invoke tools");
  tools
    .command("list")
    .option("--module <id>", "Limit contracts to one module")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .action(
      runCliAction(
        async (opts: { apiUrl?: string; token?: string; module?: string }) => {
          const endpoint = opts.module
            ? `/api/${encodeURIComponent(opts.module)}/tools`
            : "/api/tools/contracts";
          const result = await callCoreApi(opts, "GET", endpoint);
          console.log(JSON.stringify(result, null, 2));
        }
      )
    );
  tools
    .command("invoke")
    .requiredOption("--tool <id>", "Tool ID (e.g. contacts_list)")
    .option("--module <id>", "Use the module-scoped tool endpoint")
    .option("--input <json>", "JSON input object", "{}")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .action(
      runCliAction(
        async (opts: {
          tool: string;
          module?: string;
          input?: string;
          apiUrl?: string;
          token?: string;
        }) => {
          const parsedInput = JSON.parse(opts.input ?? "{}");
          const endpoint = opts.module
            ? `/api/${encodeURIComponent(opts.module)}/tools/${encodeURIComponent(opts.tool)}/invoke`
            : `/api/tools/${encodeURIComponent(opts.tool)}/invoke`;
          const result = await callCoreApi(opts, "POST", endpoint, {
            input: parsedInput,
          });
          console.log(JSON.stringify(result, null, 2));
        }
      )
    );

  const ops = modules
    .command("ops")
    .description("Compatibility alias for module tools");
  ops
    .command("list")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .action(async (opts: { apiUrl?: string; token?: string }) => {
      const result = await callCoreApi(opts, "GET", "/api/tools/contracts");
      console.log(JSON.stringify(result, null, 2));
    });
  ops
    .command("invoke")
    .requiredOption("--operation <id>", "Tool ID (e.g. contacts_list)")
    .option("--input <json>", "JSON input object", "{}")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .action(
      async (opts: {
        operation: string;
        input?: string;
        apiUrl?: string;
        token?: string;
      }) => {
        const parsedInput = JSON.parse(opts.input ?? "{}");
        const result = await callCoreApi(
          opts,
          "POST",
          `/api/tools/${encodeURIComponent(opts.operation)}/invoke`,
          { input: parsedInput }
        );
        console.log(JSON.stringify(result, null, 2));
      }
    );
}
