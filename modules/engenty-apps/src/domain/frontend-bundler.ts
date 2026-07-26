import { createRequire } from "node:module";
import { build, formatMessages, type Loader, type Plugin } from "esbuild";

/**
 * Bundles an App's frontend sources into one self-contained HTML document.
 *
 * Why this runs here and not in the guest VM: the agentOS build VM installs
 * with `--omit=optional` and fails the build if any `.node` file survives in
 * node_modules. Rollup 4 ships its platform build as both — so Vite cannot run
 * there, and agentOS itself vendors esbuild-wasm for the same reason. The
 * frontend never reaches the app host anyway; only the backend does.
 *
 * Why bundling untrusted source in a trusted process is safe: esbuild parses
 * and emits, it never evaluates app code, and there is no tenant `package.json`
 * to install from. The import allow-list is the whole dependency surface.
 */

const NAMESPACE = "engenty-app";
const BRIDGE_SPECIFIER = "engenty:bridge";
const BRIDGE_NAMESPACE = "engenty-bridge";

/** The App's entire dependency surface. Widen on evidence, not in advance. */
const ALLOWED_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-dev-runtime",
  "react/jsx-runtime",
]);

/** Tried in order when a relative import omits its extension. */
const RESOLVE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".css", ".json"];

const BUNDLE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

/** A built document larger than this is a mistake, not a feature. */
const MAX_DOCUMENT_BYTES = 2_000_000;

const hostRequire = createRequire(import.meta.url);

export class FrontendBuildError extends Error {
  readonly buildLog: string;

  constructor(buildLog: string) {
    super("frontend build failed");
    this.name = "FrontendBuildError";
    this.buildLog = buildLog;
  }
}

/**
 * True when `entry` names sources to bundle rather than a ready-made document.
 * Inferring the mode from the entry — rather than a manifest flag — makes it
 * impossible for the two to disagree.
 */
export function isBundledEntry(entry: string): boolean {
  const dot = entry.lastIndexOf(".");
  return dot === -1 ? false : BUNDLE_EXTENSIONS.has(entry.slice(dot));
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

function resolveInFiles(
  specifier: string,
  importer: string | undefined,
  files: Record<string, string>
): string | null {
  const base =
    importer && specifier.startsWith(".")
      ? importer.split("/").slice(0, -1).join("/")
      : "";
  const joined = normalizePath(base ? `${base}/${specifier}` : specifier);
  for (const extension of RESOLVE_EXTENSIONS) {
    const candidate = `${joined}${extension}`;
    if (typeof files[candidate] === "string") {
      return candidate;
    }
  }
  for (const extension of RESOLVE_EXTENSIONS.slice(1)) {
    const candidate = `${joined}/index${extension}`;
    if (typeof files[candidate] === "string") {
      return candidate;
    }
  }
  return null;
}

function loaderFor(path: string): Loader {
  if (path.endsWith(".tsx")) {
    return "tsx";
  }
  if (path.endsWith(".ts")) {
    return "ts";
  }
  if (path.endsWith(".jsx")) {
    return "jsx";
  }
  if (path.endsWith(".css")) {
    return "css";
  }
  if (path.endsWith(".json")) {
    return "json";
  }
  return "js";
}

/**
 * One audited implementation of the postMessage bridge, injected as a virtual
 * module. Every App used to re-type this, and every copy was a chance to get
 * the JSON-RPC correlation subtly wrong.
 */
const BRIDGE_SOURCE = `
const pending = new Map();
const sessionListeners = new Set();
let nextId = 1;
let sessionData = null;

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.jsonrpc !== "2.0") return;
  if (msg.id !== undefined && pending.has(msg.id)) {
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message || "app bridge call failed"));
    else entry.resolve(msg.result);
    return;
  }
  if (msg.method === "ui/notifications/tool-result") {
    const result = msg.params && msg.params.result;
    sessionData = (result && result.structuredContent) || {};
    for (const listener of sessionListeners) {
      try { listener(sessionData); } catch (error) { console.error(error); }
    }
  }
});

export function call(name, args) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    parent.postMessage(
      { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args || {} } },
      "*",
    );
  });
}

export function engenty(operationId, input) {
  return call("engenty_call", { operation_id: operationId, input: input || {} });
}

export function action(id, input) {
  return call("app_action", { action: id, input: input || {} });
}

// The store operations answer with an envelope — { key, value, updated_at } for
// a read, { entries: [...] } for a list. Unwrapping here is the whole point of
// the bridge: otherwise every App re-learns the envelope, and an App that
// forgets silently reads an object where it expected its value.
const unwrapValue = (result) =>
  result && typeof result === "object" && "value" in result
    ? result.value
    : undefined;
const unwrapEntries = (result) =>
  result && Array.isArray(result.entries) ? result.entries : [];

export const data = {
  get: (key) => call("data_get", { key }).then(unwrapValue),
  set: (key, value) => call("data_set", { key, value }),
  list: (prefix) =>
    call("data_list", prefix === undefined ? {} : { prefix }).then(
      unwrapEntries,
    ),
  delete: (key) => call("data_delete", { key }),
};

export const config = {
  get: (key) => call("config_get", { key }).then(unwrapValue),
  set: (key, value) => call("config_set", { key, value }),
  list: (prefix) =>
    call("config_list", prefix === undefined ? {} : { prefix }).then(
      unwrapEntries,
    ),
  delete: (key) => call("config_delete", { key }),
};

export function notify(text) {
  parent.postMessage(
    { jsonrpc: "2.0", method: "ui/notifications/message", params: { text: String(text) } },
    "*",
  );
}

export function openLink(url) {
  parent.postMessage({ jsonrpc: "2.0", method: "ui/open-link", params: { url } }, "*");
}

export function onSession(listener) {
  sessionListeners.add(listener);
  if (sessionData) listener(sessionData);
  return () => sessionListeners.delete(listener);
}

parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized" }, "*");
`;

function appFilesPlugin(files: Record<string, string>): Plugin {
  return {
    name: "engenty-app-files",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^engenty:bridge$/ }, () => ({
        namespace: BRIDGE_NAMESPACE,
        path: BRIDGE_SPECIFIER,
      }));

      pluginBuild.onLoad({ filter: /.*/, namespace: BRIDGE_NAMESPACE }, () => ({
        contents: BRIDGE_SOURCE,
        loader: "js" as Loader,
      }));

      pluginBuild.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") {
          const resolved = resolveInFiles(args.path, undefined, files);
          if (resolved) {
            return { namespace: NAMESPACE, path: resolved };
          }
          return {
            errors: [
              {
                text: `entry file "${args.path}" is not among the app's files`,
              },
            ],
          };
        }
        // Only the App's own sources are held to the allow-list. Once inside an
        // allowed package, its internals resolve normally — react-dom reaches
        // for `scheduler`, and that is react-dom's business, not the App's.
        const fromApp =
          args.namespace === NAMESPACE || args.namespace === BRIDGE_NAMESPACE;
        if (!fromApp) {
          return;
        }
        if (args.path.startsWith(".")) {
          const resolved = resolveInFiles(args.path, args.importer, files);
          if (resolved) {
            return { namespace: NAMESPACE, path: resolved };
          }
          return {
            errors: [
              {
                text: `cannot find "${args.path}" imported from "${args.importer}"`,
              },
            ],
          };
        }
        if (!ALLOWED_PACKAGES.has(args.path)) {
          return {
            errors: [
              {
                text: `import "${args.path}" is not available to Apps. Available: ${[
                  ...ALLOWED_PACKAGES,
                ]
                  .sort()
                  .join(", ")}, ${BRIDGE_SPECIFIER}`,
              },
            ],
          };
        }
        return { path: hostRequire.resolve(args.path) };
      });

      pluginBuild.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => ({
        contents: files[args.path],
        loader: loaderFor(args.path),
      }));
    },
  };
}

/**
 * Minimal, deliberately opinion-free base. Apps bring their own look; this
 * only keeps an unstyled app from rendering as unreadable black-on-white in a
 * dark host.
 */
const BASE_CSS =
  "*,*::before,*::after{box-sizing:border-box}" +
  "body{margin:0;padding:16px;" +
  'font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
  "color:#18181b;background:#fff}" +
  "@media (prefers-color-scheme:dark){body{color:#fafafa;background:#18181b}}";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BundleFrontendInput {
  entry: string;
  files: Record<string, string>;
  title: string;
}

export async function bundleFrontend(
  input: BundleFrontendInput
): Promise<{ html: string }> {
  let outputFiles: { path: string; text: string }[];
  try {
    const result = await build({
      bundle: true,
      // React's CJS entry branches on this; without it the dev build ships,
      // roughly doubling the bundle and emitting console warnings.
      define: { "process.env.NODE_ENV": '"production"' },
      entryPoints: [input.entry],
      format: "iife",
      jsx: "automatic",
      loader: {
        ".gif": "dataurl",
        ".jpg": "dataurl",
        ".png": "dataurl",
        ".svg": "dataurl",
        ".webp": "dataurl",
      },
      logLevel: "silent",
      minify: true,
      outdir: "/engenty-app",
      plugins: [appFilesPlugin(input.files)],
      target: ["es2022"],
      write: false,
    });
    outputFiles = result.outputFiles.map((file) => ({
      path: file.path,
      text: file.text,
    }));
  } catch (error) {
    const errors = (error as { errors?: Parameters<typeof formatMessages>[0] })
      .errors;
    if (!errors) {
      throw error;
    }
    const formatted = await formatMessages(errors, {
      color: false,
      kind: "error",
      terminalWidth: 100,
    });
    throw new FrontendBuildError(formatted.join("\n").trim());
  }

  const script = outputFiles
    .filter((file) => file.path.endsWith(".js"))
    .map((file) => file.text)
    .join("\n");
  const styles = outputFiles
    .filter((file) => file.path.endsWith(".css"))
    .map((file) => file.text)
    .join("\n");

  // A `</script` inside a string literal would close the tag and drop the rest
  // of the bundle into the document as markup. Same for `</style` in CSS.
  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.title)}</title>`,
    `<style>${BASE_CSS}${styles.replace(/<\/style/gi, "<\\/style")}</style>`,
    "</head>",
    "<body>",
    '<div id="root"></div>',
    `<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`,
    "</body>",
    "</html>",
  ].join("");

  if (Buffer.byteLength(html) > MAX_DOCUMENT_BYTES) {
    throw new FrontendBuildError(
      `built document is ${Buffer.byteLength(html)} bytes, over the ${MAX_DOCUMENT_BYTES} byte limit`
    );
  }

  return { html };
}
