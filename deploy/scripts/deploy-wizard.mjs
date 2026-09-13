#!/usr/bin/env node
/**
 * deploy-wizard.mjs — interactive Engenty → Coolify deployment stepper.
 *
 * Guides you from credentials to a live instance, encoding the gotchas that
 * bite otherwise: exposed Supabase schemas, the custom access-token hook,
 * base directory = /deploy, the Traefik network pin, VITE_* build args, and
 * the API IP-allowlist. Talks to the Supabase Management API and the Coolify
 * API directly. Pure Node built-ins — no install step.
 *
 *   pnpm engenty deploy            # run the wizard
 *   pnpm engenty deploy --dry-run  # never write/POST, just show
 *   node deploy/scripts/deploy-wizard.mjs --help   # the script itself, plain Node
 *
 * Nothing is written or POSTed without a confirmation step. Secrets are masked
 * on screen and never echoed.
 */

// biome-ignore-all lint/performance/useTopLevelRegex: one-shot CLI — regex hoisting is noise here
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: interactive keypress state machines read clearest inline

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { emitKeypressEvents } from "node:readline";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// ANSI / TUI toolkit
// ─────────────────────────────────────────────────────────────────────────────

const NO_COLOR =
  process.env.NO_COLOR != null ||
  !process.stdout.isTTY ||
  process.argv.includes("--no-color");

const E = (n) => (NO_COLOR ? "" : `\x1b[${n}m`);
const c = {
  reset: E(0),
  bold: E(1),
  dim: E(2),
  italic: E(3),
  underline: E(4),
  red: E(31),
  green: E(32),
  yellow: E(33),
  blue: E(34),
  magenta: E(35),
  cyan: E(36),
  gray: E(90),
  brightCyan: E(96),
  brightGreen: E(92),
  brightYellow: E(93),
  brightWhite: E(97),
  bgBlue: E(44),
  bgCyan: E(46),
};
const paint = (s, ...codes) => `${codes.join("")}${s}${c.reset}`;

const out = (s = "") => process.stdout.write(`${s}\n`);
const write = (s) => process.stdout.write(s);
const clear = () => !NO_COLOR && write("\x1b[2J\x1b[3J\x1b[H");
const hideCursor = () => !NO_COLOR && write("\x1b[?25l");
const showCursor = () => !NO_COLOR && write("\x1b[?25h");

const ICON = {
  done: paint("✔", c.brightGreen),
  current: paint("◆", c.brightCyan),
  pending: paint("○", c.gray),
  ok: paint("✔", c.brightGreen),
  warn: paint("▲", c.brightYellow),
  err: paint("✖", c.red),
  info: paint("ℹ", c.cyan),
  arrow: paint("›", c.brightCyan),
  bullet: paint("•", c.gray),
};

const SW = () => Math.max(60, Math.min(process.stdout.columns || 80, 100));

function rule(char = "─", color = c.gray) {
  out(paint(char.repeat(SW()), color));
}

function banner() {
  const title = "ENGENTY  DEPLOY  WIZARD";
  const pad = Math.floor((SW() - title.length) / 2);
  const bar = "═".repeat(SW() - 4);
  const left = " ".repeat(pad - 2);
  const right = " ".repeat(SW() - title.length - pad - 2);
  out();
  out(paint(`  ╔${bar}╗`, c.cyan));
  out(
    `${paint("  ║", c.cyan)}${left}${paint(title, c.bold, c.brightCyan)}${right}${paint("║", c.cyan)}`
  );
  out(paint(`  ╚${bar}╝`, c.cyan));
  out(
    paint("  Supabase + Coolify, one guided flow · ⌃C to quit anytime", c.dim)
  );
  out();
}

function stepIcon(i, current) {
  if (i < current) {
    return ICON.done;
  }
  if (i === current) {
    return ICON.current;
  }
  return ICON.pending;
}

function stepLabel(title, i, current) {
  if (i === current) {
    return paint(title, c.bold, c.brightWhite);
  }
  if (i < current) {
    return paint(title, c.gray);
  }
  return paint(title, c.dim);
}

function stepper(steps, current) {
  const parts = steps.map(
    (s, i) => `${stepIcon(i, current)} ${stepLabel(s.title, i, current)}`
  );
  out(`  ${parts.join(paint("  →  ", c.gray))}`);
  rule();
  out();
}

function h1(title) {
  out(`  ${ICON.arrow} ${paint(title, c.bold, c.brightCyan)}`);
  out();
}
function note(s) {
  out(`    ${paint(s, c.dim)}`);
}
function okLine(s) {
  out(`    ${ICON.ok} ${s}`);
}
function warnLine(s) {
  out(`    ${ICON.warn} ${paint(s, c.brightYellow)}`);
}
function errLine(s) {
  out(`    ${ICON.err} ${paint(s, c.red)}`);
}
function infoLine(s) {
  out(`    ${ICON.info} ${s}`);
}
function kv(k, v) {
  out(`      ${paint(k.padEnd(26), c.gray)} ${v}`);
}

function mask(v) {
  if (!v) {
    return paint("(unset)", c.dim);
  }
  if (v.length <= 8) {
    return paint("••••••", c.yellow);
  }
  return (
    paint(`${v.slice(0, 4)}…${v.slice(-4)}`, c.yellow) +
    paint(` (${v.length} chars)`, c.dim)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Input (text prompt, masked secret, arrow-key select, confirm, spinner)
// ─────────────────────────────────────────────────────────────────────────────

let stdinReady = false;
function ensureStdin() {
  if (!stdinReady) {
    emitKeypressEvents(process.stdin);
    stdinReady = true;
  }
}

function cleanupAndExit(code = 0) {
  showCursor();
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // raw mode may already be off
    }
  }
  process.stdin.pause();
  process.exit(code);
}
process.on("SIGINT", () => {
  out();
  out(paint("  Aborted — nothing further was changed.", c.yellow));
  cleanupAndExit(130);
});

// One raw-mode keypress → resolves { name, ctrl, sequence }
function readKey() {
  ensureStdin();
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    const onKey = (str, key) => {
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      resolve(key || { name: str, sequence: str });
    };
    process.stdin.on("keypress", onKey);
  });
}

// Free-text prompt (cooked-ish, built on keypress so it composes with the rest).
function ask(label, { def = "", validate, hint } = {}) {
  ensureStdin();
  return new Promise((resolve) => {
    let buf = "";
    const render = () => {
      write("\r\x1b[K");
      const shown =
        `    ${paint("?", c.brightCyan)} ${paint(label, c.bold)}` +
        (def ? paint(` (${def})`, c.dim) : "") +
        paint(" › ", c.gray) +
        buf;
      write(shown);
    };
    if (hint) {
      note(hint);
    }
    render();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    const done = (val) => {
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      write("\n");
      resolve(val);
    };
    const onKey = (str, key) => {
      if (!key) {
        return;
      }
      if (key.ctrl && key.name === "c") {
        write("\n");
        cleanupAndExit(130);
      } else if (key.name === "return" || key.name === "enter") {
        const val = buf.trim() || def;
        if (validate) {
          const msg = validate(val);
          if (msg) {
            write("\n");
            errLine(msg);
            render();
            return;
          }
        }
        done(val);
      } else if (key.name === "backspace") {
        buf = buf.slice(0, -1);
        render();
      } else if (
        str &&
        !key.ctrl &&
        !key.meta &&
        str.length === 1 &&
        str >= " "
      ) {
        buf += str;
        render();
      }
    };
    process.stdin.on("keypress", onKey);
  });
}

// Masked secret prompt — echoes dots, never the value.
function secret(label, { optional = false, hint } = {}) {
  ensureStdin();
  return new Promise((resolve) => {
    let buf = "";
    const render = () => {
      write("\r\x1b[K");
      write(
        `    ${paint("?", c.brightCyan)} ${paint(label, c.bold)}` +
          (optional ? paint(" (optional)", c.dim) : "") +
          paint(" › ", c.gray) +
          paint("•".repeat(buf.length), c.yellow)
      );
    };
    if (hint) {
      note(hint);
    }
    render();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    const done = () => {
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      write("\n");
      resolve(buf);
    };
    const onKey = (str, key) => {
      if (!key) {
        return;
      }
      if (key.ctrl && key.name === "c") {
        write("\n");
        cleanupAndExit(130);
      } else if (key.name === "return" || key.name === "enter") {
        done();
      } else if (key.name === "backspace") {
        buf = buf.slice(0, -1);
        render();
      } else if (
        str &&
        !key.ctrl &&
        !key.meta &&
        str.length === 1 &&
        str >= " "
      ) {
        buf += str;
        render();
      }
    };
    process.stdin.on("keypress", onKey);
  });
}

// Arrow-key single-select menu.
function select(label, options, { footer } = {}) {
  ensureStdin();
  let idx = 0;
  const render = (first) => {
    if (!first) {
      write(`\x1b[${options.length + (footer ? 2 : 1)}A`);
    }
    write("\r\x1b[K");
    out(`    ${paint("?", c.brightCyan)} ${paint(label, c.bold)}`);
    for (let i = 0; i < options.length; i++) {
      write("\r\x1b[K");
      const o = options[i];
      const lbl = typeof o === "string" ? o : o.label;
      const sub =
        typeof o === "object" && o.hint ? paint(`  ${o.hint}`, c.dim) : "";
      if (i === idx) {
        out(
          `      ${paint("❯", c.brightCyan)} ${paint(lbl, c.brightWhite, c.bold)}${sub}`
        );
      } else {
        out(`        ${paint(lbl, c.gray)}${sub}`);
      }
    }
    if (footer) {
      write("\r\x1b[K");
      out(`      ${paint(footer, c.dim)}`);
    }
  };
  render(true);
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    const onKey = (_str, key) => {
      if (!key) {
        return;
      }
      if (key.ctrl && key.name === "c") {
        cleanupAndExit(130);
      } else if (key.name === "up" || key.name === "k") {
        idx = (idx - 1 + options.length) % options.length;
        render(false);
      } else if (key.name === "down" || key.name === "j") {
        idx = (idx + 1) % options.length;
        render(false);
      } else if (key.name === "return" || key.name === "enter") {
        process.stdin.removeListener("keypress", onKey);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        const o = options[idx];
        resolve(
          typeof o === "string"
            ? { value: o, index: idx }
            : { value: o.value, index: idx }
        );
      }
    };
    process.stdin.on("keypress", onKey);
  });
}

async function confirm(label, def = true) {
  const yes = { label: "Yes", value: true };
  const no = { label: "No", value: false };
  const r = await select(label, def ? [yes, no] : [no, yes]);
  return r.value;
}

async function pause(label = "Press Enter to continue") {
  note(label);
  const k = await readKey();
  if (k?.ctrl && k.name === "c") {
    cleanupAndExit(130);
  }
}

// Spinner around an async task.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
async function spin(label, task) {
  if (NO_COLOR) {
    write(`    … ${label}`);
    try {
      const r = await task();
      out(`\r    ${ICON.ok} ${label}`);
      return r;
    } catch (e) {
      out(`\r    ${ICON.err} ${label}`);
      throw e;
    }
  }
  let i = 0;
  hideCursor();
  const t = setInterval(() => {
    write(`\r    ${paint(FRAMES[i++ % FRAMES.length], c.brightCyan)} ${label}`);
  }, 80);
  try {
    const r = await task();
    clearInterval(t);
    showCursor();
    out(`\r\x1b[K    ${ICON.ok} ${label}`);
    return r;
  } catch (e) {
    clearInterval(t);
    showCursor();
    out(`\r\x1b[K    ${ICON.err} ${label}`);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────────

function req(
  url,
  { method = "GET", headers = {}, body, timeout = 20_000 } = {}
) {
  const u = new URL(url);
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const r = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + (u.search ?? ""),
        method,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...headers,
        },
        timeout,
      },
      (res) => {
        let raw = "";
        res.on("data", (d) => (raw += d));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            // non-JSON response body
          }
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error(`timeout after ${timeout}ms`)));
    if (body) {
      r.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    r.end();
  });
}

const supaMgmt = (token, path, opts = {}) =>
  req(`https://api.supabase.com/v1${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });

const coolify = (base, token, path, opts = {}) =>
  req(`${base.replace(/\/$/, "")}/api/v1${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });

// ─────────────────────────────────────────────────────────────────────────────
// Repo helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(
  /\/$/,
  ""
);
const ENV_PATH = `${ROOT}/deploy/.env`;
const CONFIG_TOML = `${ROOT}/supabase/config.toml`;
const DRY = process.argv.includes("--dry-run");

function exposedSchemasFromConfig() {
  if (!existsSync(CONFIG_TOML)) {
    return null;
  }
  const toml = readFileSync(CONFIG_TOML, "utf8");
  // [api].schemas = [ ... ] — may span lines
  const m = toml.match(/\[api\][\s\S]*?schemas\s*=\s*\[([^\]]*)\]/);
  if (!m) {
    return null;
  }
  return m[1]
    .split(",")
    .map((s) => s.replace(/["'\s]/g, ""))
    .filter(Boolean);
}

/**
 * Which schemas this checkout needs exposed.
 *
 * Read from the committed migration sources first: supabase/config.toml is
 * generated by `engenty generate` and gitignored, so on the fresh clone most
 * people deploy from it is either absent or — worse — the 5-schema base
 * template, which silently under-exposes and leaves engenty-ai crash-looping.
 * config.toml stays as the fallback for an already-set-up workspace.
 */
async function resolveExposedSchemas() {
  try {
    const [{ resolveMigrationOwners }, { composeApiSchemasFromOwners }] =
      await Promise.all([
        import(
          new URL("../../scripts/lib/migration-owners.mjs", import.meta.url)
        ),
        import(new URL("../../scripts/supabase-sync-lib.mjs", import.meta.url)),
      ]);
    const schemas = composeApiSchemasFromOwners(resolveMigrationOwners(ROOT));
    if (schemas.length > 0) {
      return { schemas, source: "migration sources" };
    }
  } catch {
    // Fall through to config.toml — a partial checkout still deploys.
  }
  const fromConfig = exposedSchemasFromConfig();
  return fromConfig
    ? { schemas: fromConfig, source: "supabase/config.toml" }
    : { schemas: null, source: null };
}

function loadExistingEnv() {
  if (!existsSync(ENV_PATH)) {
    return {};
  }
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const genSecret = () => randomBytes(32).toString("hex");

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  existing: loadExistingEnv(),
  schemas: null,
  schemaSource: null,
  env: {},
  supa: {}, // { ref, mgmtToken, url, anon, service }
  cool: {}, // { base, token, serverUuid, projectUuid, appUuid, ... }
  // { supabase: "cloud" | "selfhosted", deploy: "coolify" | "compose" }
  target: {},
};

async function stepWelcome() {
  h1("Welcome");
  const resolved = await resolveExposedSchemas();
  state.schemas = resolved.schemas;
  state.schemaSource = resolved.source;
  note("This wizard points engenty at a database you already run, writes");
  note("deploy/.env, and brings the stack up — pausing before every change.");
  out();
  if (DRY) {
    warnLine(
      "DRY-RUN: no files written, no API writes. Everything is simulated."
    );
  }
  infoLine(`Repo root:      ${paint(ROOT, c.cyan)}`);
  infoLine(
    `Schemas found:  ${
      state.schemas
        ? paint(`${state.schemas.length} from ${state.schemaSource}`, c.cyan)
        : paint("could not read this checkout — will prompt", c.yellow)
    }`
  );
  infoLine(
    `Existing .env:  ${
      Object.keys(state.existing).length
        ? paint(
            `${Object.keys(state.existing).length} keys (used as defaults)`,
            c.cyan
          )
        : paint("none", c.dim)
    }`
  );
  out();
  if (!(await confirm("Ready to begin?"))) {
    cleanupAndExit(0);
  }
}

async function stepTarget() {
  h1("What are you deploying onto?");
  note("Both answers only change which questions come next — nothing is");
  note("written yet, and either combination ends in the same running stack.");
  out();

  const supabase = await select("Where does Supabase run?", [
    {
      label: "Supabase Cloud",
      value: "cloud",
      hint: "a project on supabase.com",
    },
    {
      label: "Self-hosted Supabase",
      value: "selfhosted",
      hint: "Coolify one-click, Dokploy, your own compose",
    },
  ]);
  state.target.supabase = supabase.value;

  out();
  const deploy = await select("How does engenty itself run?", [
    {
      label: "Coolify",
      value: "coolify",
      hint: "I create the app and deploy it for you",
    },
    {
      label: "Docker Compose on a VPS",
      value: "compose",
      hint: "I write the env and hand you the commands",
    },
  ]);
  state.target.deploy = deploy.value;

  out();
  if (state.target.supabase === "selfhosted") {
    note(
      "Self-hosted Supabase has no Management API, so two settings are yours"
    );
    note("to make. I print the exact values and then check they took.");
  }
}

async function stepCredentials() {
  h1("Credentials & basics");
  const ex = state.existing;

  state.env.PUBLIC_APP_URL = await ask(
    "Public app URL (https, no trailing slash)",
    {
      def: ex.PUBLIC_APP_URL || "",
      validate: (v) =>
        /^https?:\/\/[^/]+$/.test(v)
          ? null
          : "Enter a URL like https://app.example.com",
    }
  );

  out();
  if (state.target.supabase === "cloud") {
    note(
      "Supabase — the Management API token lets me read your keys and set the"
    );
    note(
      "exposed schemas + auth hook. Create one at supabase.com/dashboard/account/tokens"
    );
    state.supa.ref = await ask("Supabase project ref", {
      def: ex.SUPABASE_URL
        ? ex.SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0]
        : "",
      validate: (v) =>
        /^[a-z0-9]{20}$/.test(v)
          ? null
          : "A project ref is 20 lowercase alphanumerics",
    });
    state.supa.mgmtToken = await secret(
      "Supabase Management API token (sbp_…)",
      { optional: true }
    );
  } else {
    note("Supabase — the URL a browser will use, and the project's two keys.");
    note("Find them in your Supabase stack's own env or dashboard.");
    state.supa.url = await ask("Supabase URL", {
      def: ex.VITE_SUPABASE_URL || ex.SUPABASE_URL || "",
      validate: (v) =>
        /^https?:\/\/[^/]+$/.test(v)
          ? null
          : "Enter a URL like https://supabase.example.com",
    });
    state.supa.anon = await secret("Supabase anon / publishable key", {});
    state.supa.service = await secret("Supabase service_role / secret key", {});
    // Containers often reach Supabase by a name no browser can resolve. When
    // they differ, the browser keeps the URL above and the services get this
    // one; when they do not, one URL does both jobs.
    state.supa.internalUrl = await ask(
      "URL the engenty containers use (blank = the same)",
      {
        def: "",
        validate: (v) =>
          v === "" || /^https?:\/\/[^/]+$/.test(v)
            ? null
            : "Enter a URL like http://supabase-kong:8000, or leave blank",
      }
    );
    out();
    // The browser reaches Supabase at the URL above; the containers may not,
    // and the migrate service needs a Postgres connection either way.
    state.env.SUPABASE_DB_URL = await secret(
      "Postgres connection string (optional — enables migrate-on-deploy)",
      { optional: true }
    );
  }

  out();
  state.env.AI_GATEWAY_API_KEY = await secret("Vercel AI Gateway API key", {});
  // Optional second model gateway. Roles are bound per gateway in
  // Settings → AI models, so leaving this blank simply means every role
  // stays on Vercel.
  state.env.OPENROUTER_API_KEY = await secret("OpenRouter API key", {
    optional: true,
  });
  state.env.OPENAI_API_KEY = await secret("OpenAI API key", { optional: true });

  if (state.target.deploy === "coolify") {
    out();
    note(
      "Coolify — token needs write scope, and your caller IP must be on the"
    );
    note("API allow-list (Coolify → Settings → API).");
    state.cool.base = await ask("Coolify base URL", {
      def: "https://admin.example.com",
      validate: (v) =>
        /^https?:\/\//.test(v) ? null : "Enter the Coolify dashboard URL",
    });
    state.cool.token = await secret("Coolify API token", {});
  }
}

async function stepSupabaseCloud() {
  // Derive URL from ref; fetch keys via mgmt API when a token was given.
  state.supa.url = `https://${state.supa.ref}.supabase.co`;

  if (state.supa.mgmtToken) {
    const keys = await spin("Fetching project API keys", async () => {
      const r = await supaMgmt(
        state.supa.mgmtToken,
        `/projects/${state.supa.ref}/api-keys`
      );
      if (r.status === 401) {
        throw new Error("Management token rejected (401)");
      }
      if (r.status >= 300) {
        throw new Error(`api-keys HTTP ${r.status}: ${r.raw.slice(0, 120)}`);
      }
      return r.json || [];
    });
    const anon = keys.find((k) => k.name === "anon")?.api_key;
    const service = keys.find((k) => k.name === "service_role")?.api_key;
    state.supa.anon = anon || "";
    state.supa.service = service || "";
    okLine(
      `Keys retrieved (anon ${mask(anon)}, service_role ${mask(service)})`
    );
  } else {
    warnLine("No Management token — enter the keys manually.");
    state.supa.anon = await secret("Supabase anon (publishable) key", {});
    state.supa.service = await secret("Supabase service_role (secret) key", {});
  }

  // Exposed schemas
  out();
  const want = state.schemas;
  if (!want) {
    warnLine(
      "Could not read schemas from config.toml — skipping the exposed-schemas step."
    );
  } else if (state.supa.mgmtToken) {
    const current = await spin(
      "Reading exposed schemas (PostgREST)",
      async () => {
        const r = await supaMgmt(
          state.supa.mgmtToken,
          `/projects/${state.supa.ref}/postgrest`
        );
        if (r.status >= 300) {
          throw new Error(`postgrest HTTP ${r.status}`);
        }
        return (r.json?.db_schema || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    );
    const missing = want.filter((s) => !current.includes(s));
    if (missing.length === 0) {
      okLine(`All ${want.length} schemas already exposed.`);
    } else {
      warnLine(
        `${missing.length} schema(s) not exposed: ${paint(missing.join(", "), c.brightYellow)}`
      );
      note(
        "Without these, engenty-ai crash-loops: 'Could not query the database for the schema cache'."
      );
      if (DRY) {
        infoLine("DRY-RUN: would PATCH db_schema to include them.");
      } else if (await confirm("Expose all required schemas now?")) {
        await spin("Updating exposed schemas", async () => {
          const r = await supaMgmt(
            state.supa.mgmtToken,
            `/projects/${state.supa.ref}/postgrest`,
            {
              method: "PATCH",
              body: { db_schema: want.join(", ") },
            }
          );
          if (r.status >= 300) {
            throw new Error(
              `PATCH postgrest HTTP ${r.status}: ${r.raw.slice(0, 120)}`
            );
          }
        });
      }
    }
  } else {
    warnLine(
      "No Management token — do this manually: Supabase → Settings → API → Exposed schemas:"
    );
    note(want.join(", "));
  }

  // Custom access token hook
  out();
  if (state.supa.mgmtToken) {
    const hook = await spin("Reading auth hook status", async () => {
      const r = await supaMgmt(
        state.supa.mgmtToken,
        `/projects/${state.supa.ref}/config/auth`
      );
      if (r.status >= 300) {
        throw new Error(`config/auth HTTP ${r.status}`);
      }
      return r.json || {};
    });
    if (hook.hook_custom_access_token_enabled) {
      okLine("Custom access-token hook already enabled.");
    } else {
      warnLine("Custom access-token hook is disabled.");
      note(
        "Without it, JWTs lack tenant_id → realtime stays off and the client 429s on refresh."
      );
      if (DRY) {
        infoLine("DRY-RUN: would enable core.custom_access_token_hook.");
      } else if (await confirm("Enable core.custom_access_token_hook now?")) {
        await spin("Enabling custom access-token hook", async () => {
          const r = await supaMgmt(
            state.supa.mgmtToken,
            `/projects/${state.supa.ref}/config/auth`,
            {
              method: "PATCH",
              body: {
                hook_custom_access_token_enabled: true,
                hook_custom_access_token_uri:
                  "pg-functions://postgres/core/custom_access_token_hook",
              },
            }
          );
          if (r.status >= 300) {
            throw new Error(`PATCH config/auth HTTP ${r.status}`);
          }
        });
        note("Users must sign out/in once for the tenant_id claim to appear.");
      }
    }
  } else {
    warnLine(
      "No Management token — enable manually: Authentication → Hooks → Customize Access Token"
    );
    note("→ select core.custom_access_token_hook.");
  }
}

/**
 * Self-hosted Supabase has no Management API, so the two settings that live in
 * project config are the operator's to make. Print the exact values — the
 * schema list is long and mistyping it fails silently — then check them.
 */
async function stepSupabaseSelfHosted() {
  const want = state.schemas;

  infoLine("Two settings, on your Supabase stack, not on engenty:");
  out();
  out(`  ${paint("1. PostgREST — exposed schemas", c.bold)}`);
  if (want) {
    note("Set on the rest / postgrest service:");
    out(`      ${paint(`PGRST_DB_SCHEMAS=${want.join(",")}`, c.cyan)}`);
  } else {
    warnLine("Could not read this checkout's schema list.");
    note("Run `node scripts/supabase-schemas.mjs` in the repo and use that.");
  }
  note("Missing → engenty-ai crash-loops on the schema cache.");
  out();
  out(`  ${paint("2. GoTrue — custom access token hook", c.bold)}`);
  note("Set on the auth / gotrue service:");
  out(`      ${paint("GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true", c.cyan)}`);
  out(
    `      ${paint(
      "GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/core/custom_access_token_hook",
      c.cyan
    )}`
  );
  note("Missing → JWTs carry no tenant_id: logins 401 and realtime stays off.");
  out();
  note("Restart both services afterwards, then continue — I check below.");
  out();
  await pause("Enter when the two are set (or to check and see what is not)");
}

/**
 * Ask the database and PostgREST what they actually did, rather than trusting
 * the click. Both settings fail silently and late, which is the whole reason
 * this wizard exists.
 */
async function verifySupabaseWiring() {
  out();
  h1("Checking the database");

  let probes;
  try {
    probes = await import(
      new URL("../../scripts/lib/supabase-probes.mjs", import.meta.url)
    );
  } catch (err) {
    // Name the reason: a silently skipped check is the failure mode this
    // whole step exists to remove.
    warnLine(`Cannot run the checks — ${err.message}`);
    note("Verify by hand later with `pnpm engenty doctor`.");
    return;
  }

  if (state.schemas && state.supa.anon) {
    const schemaProbe = await spin("Reading exposed schemas", () =>
      probes.probeExposedSchemas({
        anonKey: state.supa.anon,
        required: state.schemas,
        url: state.supa.url,
      })
    );
    if (schemaProbe.ok) {
      okLine(`All ${state.schemas.length} required schemas are served.`);
    } else if (schemaProbe.error) {
      warnLine(`Exposed schemas — ${schemaProbe.error}`);
    } else {
      errLine(
        `Not exposed: ${paint(schemaProbe.missing.join(", "), c.brightYellow)}`
      );
    }
  }

  if (!state.supa.service) {
    return;
  }
  const selfCheck = await spin("Reading the access-token hook", () =>
    probes.probeDeploymentSelfCheck({
      serviceRoleKey: state.supa.service,
      url: state.supa.url,
    })
  );
  if (selfCheck.ok) {
    okLine("Hook function present and callable by auth.");
    note(
      `${selfCheck.checks.applied_migrations} migrations applied, latest ${selfCheck.checks.latest_migration}.`
    );
  } else if (selfCheck.rpcMissing) {
    warnLine("Migrations have not run on this database yet.");
    note(
      "Expected on a first install — the deploy applies them, then re-check with `pnpm engenty doctor`."
    );
  } else {
    errLine(`Access-token hook — ${selfCheck.error ?? "not ready"}`);
  }

  out();
  infoLine(
    "Re-run these checks any time with " +
      paint("pnpm engenty doctor", c.cyan) +
      "."
  );
}

async function stepSupabase() {
  h1("Supabase configuration");

  if (state.target.supabase === "cloud") {
    await stepSupabaseCloud();
  } else {
    await stepSupabaseSelfHosted();
  }

  await verifySupabaseWiring();

  out();
  infoLine(
    "Migrations: set " +
      paint("SUPABASE_DB_URL", c.cyan) +
      " and the engenty-migrate service applies them automatically each deploy."
  );
  if (state.target.supabase === "cloud") {
    note(
      "Manual fallback (if SUPABASE_DB_URL is unset): supabase link --project-ref " +
        state.supa.ref +
        " && bash deploy/scripts/migrate.sh"
    );
  }
}

function buildEnv() {
  const s = state;
  // What the browser uses, and what the containers use — the same string for
  // Supabase Cloud and for most self-hosted stacks.
  const browserUrl = s.supa.url;
  const url = s.supa.internalUrl || browserUrl;
  const e = {
    "# Generated by deploy/scripts/deploy-wizard.mjs": "",
    PUBLIC_APP_URL: s.env.PUBLIC_APP_URL,
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: s.supa.anon,
    SUPABASE_SERVICE_ROLE_KEY: s.supa.service,
    ENGENTY_SECURITY_JWT_SECRET:
      s.existing.ENGENTY_SECURITY_JWT_SECRET || genSecret(),
    AI_GATEWAY_API_KEY: s.env.AI_GATEWAY_API_KEY,
    OPENROUTER_API_KEY: s.env.OPENROUTER_API_KEY || "",
    OPENAI_API_KEY: s.env.OPENAI_API_KEY || "",
    ENGENTY_SANDBOX_HOST_DIR:
      s.existing.ENGENTY_SANDBOX_HOST_DIR || "/opt/engenty/sandboxes",
    TURBO_BUILD_CONCURRENCY: s.existing.TURBO_BUILD_CONCURRENCY || "4",
  };

  const dbUrl = s.env.SUPABASE_DB_URL || s.existing.SUPABASE_DB_URL || "";
  if (dbUrl) {
    e.SUPABASE_DB_URL = dbUrl;
  }

  // VITE_SUPABASE_* and ENGENTY_CORS_ORIGINS are written ONLY when they differ
  // from what the deployment already derives: the gateway serves the UI its
  // Supabase settings from SUPABASE_URL / SUPABASE_ANON_KEY, and the /ai
  // allow-list defaults to PUBLIC_APP_URL. Restating an identical value buys a
  // longer file and a second place to forget when one of them changes.
  const browserSupabaseUrl = s.env.VITE_SUPABASE_URL || browserUrl;
  if (browserSupabaseUrl !== url) {
    e.VITE_SUPABASE_URL = browserSupabaseUrl;
  }
  const browserAnonKey = s.env.VITE_SUPABASE_ANON_KEY || s.supa.anon;
  if (browserAnonKey !== s.supa.anon) {
    e.VITE_SUPABASE_ANON_KEY = browserAnonKey;
  }
  const corsOrigins = s.existing.ENGENTY_CORS_ORIGINS || "";
  if (corsOrigins && corsOrigins !== s.env.PUBLIC_APP_URL) {
    e.ENGENTY_CORS_ORIGINS = corsOrigins;
  }

  state.env = { ...state.env, ...e };
  return e;
}

function envToText(e) {
  const body = Object.entries(e)
    .map(([k, v]) => (v === "" && k.startsWith("#") ? k : `${k}=${v}`))
    .join("\n");
  return `${body}\n`;
}

async function stepEnv() {
  h1("Environment file  ·  deploy/.env");
  const e = buildEnv();

  note("Preview (secrets masked on screen — the file gets the real values):");
  out();
  const SECRET_KEYS = new Set([
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ENGENTY_SECURITY_JWT_SECRET",
    "AI_GATEWAY_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
  ]);
  for (const [k, v] of Object.entries(e)) {
    if (k.startsWith("#")) {
      out(`      ${paint(k, c.dim)}`);
      continue;
    }
    let display;
    if (SECRET_KEYS.has(k)) {
      display = mask(v);
    } else if (v) {
      display = paint(v, c.brightWhite);
    } else {
      display = paint("(empty)", c.dim);
    }
    kv(k, display);
  }
  out();
  const choice = await select("Write this to deploy/.env?", [
    {
      label: "Apply — write the file",
      value: "apply",
      hint: existsSync(ENV_PATH) ? "overwrites existing" : "",
    },
    { label: "Print only — show full text, don't write", value: "print" },
    { label: "Skip", value: "skip" },
  ]);
  if (choice.value === "print") {
    out();
    rule();
    write(envToText(e));
    rule();
    await pause();
  } else if (choice.value === "apply") {
    if (DRY) {
      warnLine("DRY-RUN: would write deploy/.env");
    } else {
      writeFileSync(ENV_PATH, envToText(e), "utf8");
      okLine(
        `Wrote ${paint("deploy/.env", c.cyan)} (${Object.keys(e).filter((k) => !k.startsWith("#")).length} keys)`
      );
    }
  } else {
    warnLine("Skipped — remember the Coolify env still needs these values.");
  }
}

async function stepCoolify() {
  h1("Coolify — project & application");

  // 0. API reachable?
  const ver = await spin("Checking Coolify API access", async () => {
    const r = await coolify(state.cool.base, state.cool.token, "/version");
    if (
      r.status === 403 ||
      (r.json && /not allowed/i.test(r.json.message || ""))
    ) {
      throw new Error(
        "403 — token or IP allow-list. Enable API + add your IP in Coolify → Settings → API."
      );
    }
    if (r.status >= 300) {
      throw new Error(`HTTP ${r.status}: ${r.raw.slice(0, 120)}`);
    }
    return r.raw.trim();
  });
  okLine(`Coolify ${paint(ver, c.cyan)}`);

  // 1. Server
  const servers = await spin("Listing servers", async () => {
    const r = await coolify(state.cool.base, state.cool.token, "/servers");
    if (r.status >= 300) {
      throw new Error(`servers HTTP ${r.status}`);
    }
    return r.json || [];
  });
  if (!servers.length) {
    throw new Error("No Coolify servers found.");
  }
  const srv =
    servers.length === 1
      ? { value: servers[0].uuid, index: 0 }
      : await select(
          "Deploy to which server?",
          servers.map((s) => ({
            label: `${s.name}`,
            hint: s.ip || "",
            value: s.uuid,
          }))
        );
  state.cool.serverUuid = srv.value;
  okLine(`Server: ${paint(servers[srv.index].name, c.cyan)}`);

  // 2. Project (find or create "engenty")
  const projects = await spin("Listing projects", async () => {
    const r = await coolify(state.cool.base, state.cool.token, "/projects");
    return r.json || [];
  });
  let proj = projects.find((p) => p.name === "engenty");
  if (proj) {
    okLine(`Reusing project ${paint("engenty", c.cyan)}`);
  } else if (DRY) {
    warnLine("DRY-RUN: would create project 'engenty'");
    proj = { uuid: "<dry-run>", name: "engenty" };
  } else if (await confirm("Create Coolify project 'engenty'?")) {
    proj = await spin("Creating project", async () => {
      const r = await coolify(state.cool.base, state.cool.token, "/projects", {
        method: "POST",
        body: { name: "engenty", description: "Engenty production stack" },
      });
      if (r.status >= 300) {
        throw new Error(`create project HTTP ${r.status}`);
      }
      return r.json;
    });
  } else {
    return;
  }
  state.cool.projectUuid = proj.uuid;

  // 3. Compose variant
  const variant = await select("Which compose file?", [
    {
      label: "Prebuilt images (CI → GHCR)",
      value: "prebuilt",
      hint: "fast pulls; needs the CI pipeline",
    },
    {
      label: "Build on the server",
      value: "build",
      hint: "simplest; slow first build",
    },
  ]);
  const composeFile =
    variant.value === "prebuilt"
      ? "docker-compose.prebuilt.yaml"
      : "docker-compose.yaml";

  // 4. Source (GitHub App)
  const apps = await spin("Listing GitHub App sources", async () => {
    const r = await coolify(state.cool.base, state.cool.token, "/github-apps");
    return (r.json || []).filter((a) => !a.is_public);
  });
  let ghAppUuid = null;
  if (apps.length) {
    const pick = await select(
      "GitHub App source for the private repo",
      apps.map((a) => ({
        label: a.name,
        hint: a.organization || "",
        value: a.uuid,
      }))
    );
    ghAppUuid = pick.value;
  } else {
    warnLine(
      "No private GitHub App configured in Coolify — connect one first, then re-run."
    );
    return;
  }
  const repo = await ask("Git repository (owner/name)", {
    def: "engenty/engenty-pro",
  });
  const branch = await ask("Branch", { def: "main" });

  // 5. Create the application
  out();
  infoLine("Application settings the wizard will set:");
  kv(
    "base directory",
    paint("/deploy", c.brightWhite) + paint("  (NOT repo root)", c.dim)
  );
  kv("compose file", paint(composeFile, c.brightWhite));
  kv("domain → engenty-edge", paint(state.env.PUBLIC_APP_URL, c.brightWhite));
  out();

  if (DRY) {
    warnLine(
      "DRY-RUN: would create the application, set env, domain, and network pin."
    );
    state.cool.appUuid = "<dry-run>";
  } else if (await confirm("Create the application now?")) {
    const app = await spin("Creating application", async () => {
      const r = await coolify(
        state.cool.base,
        state.cool.token,
        "/applications/private-github-app",
        {
          method: "POST",
          body: {
            project_uuid: state.cool.projectUuid,
            server_uuid: state.cool.serverUuid,
            environment_name: "production",
            github_app_uuid: ghAppUuid,
            git_repository: repo,
            git_branch: branch,
            build_pack: "dockercompose",
            base_directory: "/deploy",
            docker_compose_location: `/${composeFile}`,
            ports_exposes: "8787",
            name: "engenty-pro",
            instant_deploy: false,
          },
        }
      );
      if (r.status >= 300) {
        throw new Error(`create app HTTP ${r.status}: ${r.raw.slice(0, 160)}`);
      }
      return r.json;
    });
    state.cool.appUuid = app.uuid;
    okLine(`Application created (${paint(app.uuid, c.cyan)})`);

    // env vars
    await spin("Setting environment variables", async () => {
      const data = Object.entries(state.env)
        .filter(([k]) => !k.startsWith("#") && k !== "ENGENTY_SANDBOX_HOST_DIR")
        .map(([key, value]) => ({
          key,
          value: String(value),
          is_preview: false,
        }));
      const r = await coolify(
        state.cool.base,
        state.cool.token,
        `/applications/${app.uuid}/envs/bulk`,
        { method: "PATCH", body: { data } }
      );
      if (r.status >= 300) {
        throw new Error(`envs/bulk HTTP ${r.status}`);
      }
    });

    // domain + network pin note
    await spin("Setting domain on engenty-edge", async () => {
      const r = await coolify(
        state.cool.base,
        state.cool.token,
        `/applications/${app.uuid}`,
        {
          method: "PATCH",
          body: {
            docker_compose_domains: {
              "engenty-edge": {
                name: "engenty-edge",
                domain: state.env.PUBLIC_APP_URL,
              },
            },
          },
        }
      );
      if (r.status >= 300) {
        throw new Error(`set domain HTTP ${r.status}`);
      }
    });
    note(
      "The compose file pins traefik.docker.network=coolify — keep it, or you'll get 504s."
    );
  }
}

function stepServer() {
  h1("Run it on the server");

  const compose =
    "docker compose -f deploy/docker-compose.prebuilt.yaml --env-file deploy/.env";

  note("The images are public, so the VPS needs no registry login.");
  out();
  out(`  ${paint("1. Put the repo and deploy/.env on the server", c.bold)}`);
  out(
    `      ${paint("git clone https://github.com/engenty/engenty.git", c.cyan)}`
  );
  out(`      ${paint("cd engenty", c.cyan)}`);
  note("Copy the deploy/.env this wizard wrote next to it.");
  out();
  out(`  ${paint("2. Start the stack", c.bold)}`);
  out(`      ${paint(`${compose} pull`, c.cyan)}`);
  out(`      ${paint(`${compose} up -d`, c.cyan)}`);
  note(
    state.env.SUPABASE_DB_URL
      ? "engenty-migrate runs first and applies pending migrations."
      : "SUPABASE_DB_URL is unset, so migrations are skipped — apply them yourself."
  );
  out();
  out(`  ${paint("3. Terminate TLS in front of engenty-edge:8787", c.bold)}`);
  note("The stack serves plain HTTP on 8787 and expects a proxy above it.");
  note("Caddy, which gets a certificate on its own, is two lines:");
  out(
    `      ${paint(`${state.env.PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "app.example.com"} {`, c.cyan)}`
  );
  out(`      ${paint("  reverse_proxy 127.0.0.1:8787", c.cyan)}`);
  out(`      ${paint("}", c.cyan)}`);
  note(
    "Point the domain's DNS at this server first, or the certificate fails."
  );
  out();

  const pinned = `ENGENTY_IMAGE_TAG=v<x.y.z> ${compose} up -d`;
  infoLine("Images default to :latest. To pin a release:");
  out(`      ${paint(pinned, c.cyan)}`);
  out();
  infoLine("Updating later is the same two commands — pull, then up -d.");
}

async function stepDeploy() {
  h1("Deploy");
  if (!state.cool.appUuid || state.cool.appUuid === "<dry-run>") {
    warnLine(
      "No application created (dry-run or skipped) — nothing to deploy."
    );
    return;
  }
  if (!(await confirm("Trigger the first deployment now?"))) {
    note("Skipped. Trigger later from Coolify or:");
    note(
      `curl -X POST -H "Authorization: Bearer <token>" ${state.cool.base}/api/v1/deploy?uuid=${state.cool.appUuid}`
    );
    return;
  }
  const depUuid = await spin("Queuing deployment", async () => {
    const r = await coolify(
      state.cool.base,
      state.cool.token,
      `/deploy?uuid=${state.cool.appUuid}`,
      { method: "POST" }
    );
    if (r.status >= 300) {
      throw new Error(`deploy HTTP ${r.status}`);
    }
    return r.json?.deployments?.[0]?.deployment_uuid;
  });
  if (!depUuid) {
    warnLine(
      "Deployment queued but no id returned — watch it in the Coolify UI."
    );
    return;
  }
  okLine(`Queued ${paint(depUuid, c.cyan)}`);
  note("First build can take a while. Polling status…");
  let last = "";
  for (let i = 0; i < 120; i++) {
    const r = await coolify(
      state.cool.base,
      state.cool.token,
      `/deployments/${depUuid}`
    );
    const st = r.json?.status || "unknown";
    if (st !== last) {
      out(`      ${paint(new Date().toLocaleTimeString(), c.gray)}  ${st}`);
      last = st;
    }
    if (["finished", "failed", "cancelled-by-user"].includes(st)) {
      (st === "finished" ? okLine : errLine)(`Deployment ${st}`);
      break;
    }
    await new Promise((r2) => setTimeout(r2, 5000));
  }
}

async function stepVerify() {
  h1("Verify");
  const base = state.env.PUBLIC_APP_URL;
  if (!base) {
    return;
  }
  const checks = [
    ["UI (/)", "/"],
    ["API (/api/openapi.json)", "/api/openapi.json"],
    ["AI (/ai/health)", "/ai/health"],
  ];
  for (const [label, path] of checks) {
    try {
      const r = await spin(`GET ${label}`, () =>
        req(`${base}${path}`, { timeout: 15_000 })
      );
      if (r.status === 200) {
        okLine(`${label} → ${paint("200", c.brightGreen)}`);
      } else {
        warnLine(`${label} → ${r.status}`);
      }
    } catch (e) {
      errLine(`${label} → ${e.message}`);
    }
  }
}

function stepDone() {
  h1("Done");
  okLine("Wizard complete.");
  out();
  infoLine("Follow-ups it did NOT do (by design):");
  note(
    "• Migrations: set SUPABASE_DB_URL for auto-migrate on deploy, or apply once with " +
      "supabase link --project-ref " +
      (state.supa.ref || "<ref>") +
      " && bash deploy/scripts/migrate.sh"
  );
  note(
    "• Point DNS for " +
      (state.env.PUBLIC_APP_URL || "<domain>") +
      " at the server (for TLS)."
  );
  note(
    "• If prebuilt: docker login ghcr.io on the VPS (read:packages) so it can pull."
  );
  note(
    "• Scheduled triggers need ENGENTY_AI_SERVICE_SECRET (`engenty service-token create --name ai-service`)."
  );
  out();
  out(paint("  Happy shipping.", c.brightCyan));
  out();
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

// `when` is evaluated as the runner reaches each step, so the Target step's
// answers decide what follows — and the stepper only ever shows steps that
// will actually run.
const STEPS = [
  { title: "Welcome", run: stepWelcome, chrome: false },
  { title: "Target", run: stepTarget },
  { title: "Credentials", run: stepCredentials },
  { title: "Supabase", run: stepSupabase },
  { title: "Env", run: stepEnv },
  {
    title: "Coolify",
    run: stepCoolify,
    when: () => state.target.deploy !== "compose",
  },
  {
    title: "Server",
    run: stepServer,
    when: () => state.target.deploy === "compose",
  },
  {
    title: "Deploy",
    run: stepDeploy,
    when: () => state.target.deploy !== "compose",
  },
  { title: "Verify", run: stepVerify },
  { title: "Done", run: stepDone, chrome: false },
];

function isStepActive(step) {
  return step.when ? step.when() : true;
}

/** The chromed steps that will run, and where `step` sits among them. */
function chromedProgress(step) {
  const chromed = STEPS.filter((s) => s.chrome !== false && isStepActive(s));
  return { current: chromed.indexOf(step), steps: chromed };
}

function help() {
  banner();
  out(
    "  Usage: pnpm engenty deploy [--dry-run] [--no-color]   (or: node deploy/scripts/deploy-wizard.mjs [--help])"
  );
  out();
  out(
    "  --dry-run   Walk every step and prompt, but never write files or POST to APIs."
  );
  out("  --no-color  Plain output (also honours NO_COLOR).");
  out();
  out(paint(`  Steps: ${STEPS.map((s) => s.title).join(" → ")}`, c.dim));
  out(
    paint(
      "  Coolify/Server and Deploy depend on your answers in Target.",
      c.dim
    )
  );
  out();
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    help();
    return;
  }
  for (const step of STEPS) {
    if (!isStepActive(step)) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    for (;;) {
      clear();
      banner();
      if (step.chrome !== false) {
        const { current, steps } = chromedProgress(step);
        stepper(steps, current);
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        await step.run();
        break;
      } catch (e) {
        out();
        errLine(e.message || String(e));
        out();
        // eslint-disable-next-line no-await-in-loop
        const what = await select("That step hit an error.", [
          { label: "Retry", value: "retry" },
          { label: "Skip this step", value: "skip" },
          { label: "Quit", value: "quit" },
        ]);
        if (what.value === "retry") {
          continue;
        }
        if (what.value === "skip") {
          break;
        }
        cleanupAndExit(1);
      }
    }
    if (step.chrome !== false && step.title !== "Verify") {
      // brief pause between chromed steps so the user can read results
      // eslint-disable-next-line no-await-in-loop
      await pause("Enter for the next step");
    }
  }
  cleanupAndExit(0);
}

main().catch((e) => {
  errLine(e?.stack || String(e));
  cleanupAndExit(1);
});
