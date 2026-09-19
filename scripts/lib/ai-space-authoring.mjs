/**
 * Space-aware module AI authoring checks for `pnpm ai:check`.
 *
 * Missing `spacePolicy` on Space-placed operations reuses the Package 4
 * reporter algorithm (`spacePlacedOperationsMissingPolicy`). OPEN modules
 * fail CI; Package 10 / CLOSED module ids are listed as in-flight only.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isClosedPath, tryReadClosedPrefixes } from "./closed-prefixes.mjs";

const SKIP_DIRS = new Set(["dist", "node_modules", ".turbo", ".git"]);

/** Package 10 CLOSED AI surfaces — missing policy is noted, not a CI failure. */
export const PACKAGE_10_IN_FLIGHT_MODULE_IDS = new Set([
  "engenty-apps",
  "engenty-remote",
  "inbox",
  "invoices",
  "knowledge-base",
  "offers",
  "team-chat",
  "time-tracking",
]);

/**
 * Explicit record-scope assertions (not prose grep). Each row is the intended
 * kind for that module AI surface; scanned operations must include it.
 */
export const MODULE_AI_RECORD_SCOPE_ASSERTIONS = [
  {
    kind: "space_owned",
    moduleId: "projects",
    source: "skill:projects-management",
  },
  {
    kind: "space_owned",
    moduleId: "projects",
    source: "skill:projects-task-management",
  },
  { kind: "space_owned", moduleId: "tasks", source: "agent:tasks.assist" },
  { kind: "space_owned", moduleId: "tasks", source: "skill:task-workflow" },
  {
    kind: "tenant_shared",
    moduleId: "contacts",
    source: "agent:contacts.manager",
  },
  {
    kind: "tenant_shared",
    moduleId: "contacts",
    source: "skill:contacts-search-and-retrieve",
  },
  {
    kind: "tenant_shared",
    moduleId: "contacts",
    source: "skill:contacts-content-management",
  },
  {
    kind: "tenant_shared",
    moduleId: "company-profile",
    source: "agent:company-profile.manager",
  },
  {
    kind: "tenant_shared",
    moduleId: "team",
    source: "skill:team-content-management",
  },
  { kind: "space_owned", moduleId: "files", source: "operations" },
  { kind: "account_mounted", moduleId: "connections", source: "operations" },
];

const CATALOG_TOOL_IDS = new Set([
  "engenty_tools_discover",
  "engenty_tools_modules",
  "engenty_tools_search",
]);

const CATALOG_OUTPUT_IS_DATA = [
  /\bcatalog output(?:s)?\s+(?:is|are)\s+(?:app\s+)?(?:data|records)\b/i,
  /\bcatalog results?\s+(?:is|are)\s+(?:app\s+)?(?:data|records)\b/i,
  /\bthese are (?:app\s+)?(?:data|records)\b/i,
  /\breturns? (?:the )?(?:app\s+)?(?:data|records)\b/i,
  /\boutput(?:s)?\s+(?:is|are|as)\s+(?:app\s+)?(?:data|records)\b/i,
];

const LIST_CREATE_ID_RE = /(?:^|_)(?:list|create)$/;

export function isOpenAuthoringModule(moduleId, relDir, closedPrefixes) {
  if (PACKAGE_10_IN_FLIGHT_MODULE_IDS.has(moduleId)) {
    return false;
  }
  return !isClosedPath(relDir, closedPrefixes);
}

/**
 * Same filter as `spacePlacedOperationsMissingPolicy` in plugin-sdk.
 * Keep this copy aligned — the unit test compares both on collected ops.
 */
export function spacePlacedOperationsMissingPolicy(operations, allowlist = []) {
  const allowed = new Set(allowlist.map((entry) => entry.operationId));
  return operations
    .filter(
      (operation) =>
        (operation.pluginPlacement ?? "space") === "space" &&
        !operation.spacePolicy &&
        !allowed.has(operation.operationId)
    )
    .map((operation) => ({
      moduleId: operation.moduleId,
      operationId: operation.operationId,
    }));
}

export function searchOperationId(moduleId, entityName) {
  return `${snake(moduleId)}_${snake(entityName)}_search`;
}

function snake(value) {
  return value
    .replace(/-/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

export function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return {};
  }
  const fields = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      break;
    }
    const colon = line.indexOf(":");
    if (colon < 0) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    fields[key] = value;
  }
  return fields;
}

export function catalogDescriptionCallsOutputData(description) {
  if (!description) {
    return false;
  }
  return CATALOG_OUTPUT_IS_DATA.some((pattern) => pattern.test(description));
}

export function checkAiSpaceAuthoring(root) {
  const closedPrefixes = tryReadClosedPrefixes(root);
  const modules = listModules(root);
  const operations = collectModuleOperations(root, modules);
  const allowlist = readMissingPolicyAllowlist(root);
  const errors = [];
  const inFlight = [];

  for (const entry of allowlist) {
    if (!(entry.owner && entry.removalTask && entry.operationId)) {
      errors.push(
        `packages/plugin-sdk/src/space-policy.ts: MISSING_SPACE_POLICY_ALLOWLIST entry ${JSON.stringify(entry)} needs operationId, owner, and removalTask`
      );
    }
  }

  const missing = spacePlacedOperationsMissingPolicy(operations, allowlist);
  for (const row of missing) {
    const mod = modules.get(row.moduleId);
    const relDir = mod?.relDir ?? `modules/${row.moduleId}`;
    const message = `${relDir}: Space-placed operation "${row.operationId}" lacks explicit spacePolicy`;
    if (isOpenAuthoringModule(row.moduleId, relDir, closedPrefixes)) {
      errors.push(message);
    } else {
      inFlight.push(message);
    }
  }

  errors.push(
    ...preferredSkillErrors(root, modules, closedPrefixes),
    ...catalogDescriptionErrors(root),
    ...spaceOwnedListCreateErrors(root, operations, modules, closedPrefixes),
    ...recordScopeAssertionErrors(root, operations, modules, closedPrefixes)
  );

  return { errors, inFlight, operations };
}

function listModules(root) {
  const modules = new Map();
  const base = join(root, "modules");
  if (!existsSync(base)) {
    return modules;
  }
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const dir = join(base, entry.name);
    const manifestPath = join(dir, "engenty.plugin.json");
    let placement;
    let id = entry.name;
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (typeof manifest.id === "string" && manifest.id) {
          id = manifest.id;
        }
        if (typeof manifest.placement === "string") {
          placement = manifest.placement;
        }
      } catch {
        // Invalid JSON is someone else's check.
      }
    }
    modules.set(id, {
      dir,
      id,
      pluginPlacement: placement,
      relDir: `modules/${entry.name}`,
    });
  }
  return modules;
}

export function collectModuleOperations(root, modules = listModules(root)) {
  const operations = [];
  const seen = new Set();
  const add = (operation) => {
    const key = `${operation.moduleId}:${operation.operationId}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    operations.push(operation);
  };

  for (const mod of modules.values()) {
    const namedPolicies = collectModuleNamedPolicies(mod);
    for (const file of walkTsFiles(mod.dir)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      for (const objectText of callObjectLiterals(
        source,
        "registerOperation"
      )) {
        const parsed = parseRegisteredOperation(
          objectText,
          mod,
          namedPolicies,
          source
        );
        if (parsed) {
          add(parsed);
        }
      }
      for (const synthesized of collectSynthesizedSearchOps(
        source,
        mod,
        namedPolicies
      )) {
        add(synthesized);
      }
    }
  }
  return operations;
}

function parseRegisteredOperation(objectText, mod, namedPolicies, fileSource) {
  const idMatch = objectText.match(/operationId\s*:\s*["']([^"']+)["']/);
  if (!idMatch) {
    return;
  }
  const policy = readSpacePolicy(objectText, namedPolicies);
  return {
    fileSource,
    hasRecord: policy?.hasRecord === true,
    inputSchemaExpr: readInputSchemaExpr(objectText),
    moduleId: readStringField(objectText, "moduleId") ?? mod.id,
    objectText,
    operationId: idMatch[1],
    pluginPlacement: mod.pluginPlacement,
    spacePolicy: policy ? { kind: policy.kind ?? "unresolved" } : undefined,
  };
}

function collectSynthesizedSearchOps(source, mod, namedPolicies) {
  const ops = [];
  for (const objectText of labeledObjectLiterals(source, "operation")) {
    const entity = readStringField(objectText, "entityName");
    if (!entity) {
      continue;
    }
    if (/\bskipAutoTool\s*:\s*true\b/.test(objectText)) {
      continue;
    }
    const policy = readSpacePolicy(objectText, namedPolicies);
    ops.push({
      fileSource: source,
      hasRecord: policy?.hasRecord === true,
      inputSchemaExpr: undefined,
      moduleId: mod.id,
      objectText,
      operationId: searchOperationId(mod.id, entity),
      pluginPlacement: mod.pluginPlacement,
      spacePolicy: policy ? { kind: policy.kind ?? "unresolved" } : undefined,
      synthesized: true,
    });
  }
  for (const objectText of callObjectLiterals(
    source,
    "registerSearchIndexProvider",
    1
  )) {
    if (/\bskipAutoTool\s*:\s*true\b/.test(objectText)) {
      continue;
    }
    const entity = readStringField(objectText, "entityName");
    const moduleId = readStringField(objectText, "moduleId") ?? mod.id;
    if (!entity) {
      continue;
    }
    const policy = readSpacePolicy(objectText, namedPolicies);
    ops.push({
      fileSource: source,
      hasRecord: policy?.hasRecord === true,
      inputSchemaExpr: undefined,
      moduleId,
      objectText,
      operationId: searchOperationId(moduleId, entity),
      pluginPlacement: mod.pluginPlacement,
      spacePolicy: policy ? { kind: policy.kind ?? "unresolved" } : undefined,
      synthesized: true,
    });
  }
  return ops;
}

function collectModuleNamedPolicies(mod) {
  const map = new Map();
  for (const file of walkTsFiles(mod.dir)) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const [name, policy] of collectNamedPolicies(source)) {
      map.set(name, policy);
    }
  }
  return map;
}

/**
 * Modules whose skills any agent may prefer. `engenty-specialists` holds the
 * Space playbooks the copilot and every hired engenty share (routines,
 * space-data, hire-agent, …): seeded by name into every tenant, never
 * mount-gated, so preferring one is not preferring a foreign module's skill.
 */
const SHARED_SKILL_MODULE_IDS = new Set(["engenty-specialists"]);

function preferredSkillErrors(root, modules, closedPrefixes) {
  const errors = [];
  const skillsByModule = collectSkillNamesByModule(root, modules);
  const shared = new Set();
  for (const moduleId of SHARED_SKILL_MODULE_IDS) {
    for (const name of skillsByModule.get(moduleId) ?? []) {
      shared.add(name);
    }
  }
  for (const mod of modules.values()) {
    const owned = new Set([...(skillsByModule.get(mod.id) ?? []), ...shared]);
    const agentsDir = join(mod.dir, "ai", "agents");
    if (!existsSync(agentsDir)) {
      continue;
    }
    for (const manifestPath of findFiles(agentsDir, "agent.json")) {
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        continue;
      }
      const preferred = Array.isArray(manifest.skills) ? manifest.skills : [];
      for (const skill of preferred) {
        if (typeof skill !== "string" || owned.has(skill)) {
          continue;
        }
        const rel = posixRel(root, manifestPath);
        const message = `${rel}: preferred skill "${skill}" is not owned by module "${mod.id}" (associate it with this module or mount it on the Space, do not prefer a foreign skill)`;
        if (isOpenAuthoringModule(mod.id, mod.relDir, closedPrefixes)) {
          errors.push(message);
        }
      }
    }
    const aiDir = join(mod.dir, "ai");
    if (!existsSync(aiDir)) {
      continue;
    }
    for (const file of walkTsFiles(aiDir)) {
      if (file.endsWith(".test.ts")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      const hintRe = /useSkillHint\(\s*["']([^"']+)["']\s*\)/g;
      let match = hintRe.exec(source);
      while (match) {
        const skill = match[1];
        if (!owned.has(skill)) {
          const rel = posixRel(root, file);
          const message = `${rel}: useSkillHint("${skill}") is not owned by module "${mod.id}"`;
          if (isOpenAuthoringModule(mod.id, mod.relDir, closedPrefixes)) {
            errors.push(message);
          }
        }
        match = hintRe.exec(source);
      }
    }
  }
  return errors;
}

function catalogDescriptionErrors(root) {
  const errors = [];
  const files = [
    ...walkTsFiles(join(root, "apps", "ai", "ai", "tools")),
    ...walkTsFiles(join(root, "packages", "ai-core", "ai", "tools")),
  ];
  const modulesDir = join(root, "modules");
  if (existsSync(modulesDir)) {
    for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...walkTsFiles(join(modulesDir, entry.name, "ai", "tools")));
    }
  }
  for (const file of files) {
    if (!existsSync(file) || file.endsWith(".test.ts")) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    const descriptions = extractToolDescriptions(source);
    for (const item of descriptions) {
      const isCatalog =
        CATALOG_TOOL_IDS.has(item.id) ||
        (/\bcatalog\b/i.test(item.description) &&
          /\b(discover|search|modules)\b/i.test(item.description));
      if (!isCatalog) {
        continue;
      }
      if (catalogDescriptionCallsOutputData(item.description)) {
        errors.push(
          `${posixRel(root, file)}: tool "${item.id || "description"}" calls catalog output "data"`
        );
      }
    }
  }
  return errors;
}

function spaceOwnedListCreateErrors(root, operations, modules, closedPrefixes) {
  const errors = [];
  for (const operation of operations) {
    if (operation.spacePolicy?.kind !== "space_owned") {
      continue;
    }
    if (operation.hasRecord || !LIST_CREATE_ID_RE.test(operation.operationId)) {
      continue;
    }
    const mod = modules.get(operation.moduleId);
    const relDir = mod?.relDir ?? `modules/${operation.moduleId}`;
    if (!isOpenAuthoringModule(operation.moduleId, relDir, closedPrefixes)) {
      continue;
    }
    if (operation.synthesized) {
      continue;
    }
    const accepts = schemaAcceptsOrDerivesSpace(operation, mod);
    if (!accepts) {
      errors.push(
        `${relDir}: space_owned list/create "${operation.operationId}" schema cannot accept or derive a Space (needs space_id or a parent record policy)`
      );
    }
  }
  return errors;
}

function recordScopeAssertionErrors(root, operations, modules, closedPrefixes) {
  const errors = [];
  const kindsByModule = new Map();
  for (const operation of operations) {
    const kind = operation.spacePolicy?.kind;
    if (!kind || kind === "unresolved") {
      continue;
    }
    const set = kindsByModule.get(operation.moduleId) ?? new Set();
    set.add(kind);
    kindsByModule.set(operation.moduleId, set);
  }

  for (const assertion of MODULE_AI_RECORD_SCOPE_ASSERTIONS) {
    const mod = modules.get(assertion.moduleId);
    if (!mod) {
      continue;
    }
    if (!isOpenAuthoringModule(mod.id, mod.relDir, closedPrefixes)) {
      continue;
    }
    const sourceError = assertionSourceMissing(mod, assertion.source);
    if (sourceError) {
      errors.push(`${mod.relDir}: ${sourceError}`);
    }
    const kinds = kindsByModule.get(assertion.moduleId);
    if (kinds && kinds.size > 0 && !kinds.has(assertion.kind)) {
      errors.push(
        `${mod.relDir}: ${assertion.source} asserts record_scope ${assertion.kind} but declared operations have ${[...kinds].join(", ")}`
      );
    }
    const fmError = frontmatterRecordScopeMismatch(root, mod, assertion);
    if (fmError) {
      errors.push(fmError);
    }
  }
  return errors;
}

function assertionSourceMissing(mod, source) {
  if (source === "operations") {
    return;
  }
  const aiDir = join(mod.dir, "ai");
  if (!existsSync(aiDir)) {
    return;
  }
  if (source.startsWith("skill:")) {
    const name = source.slice("skill:".length);
    const skillPath = join(mod.dir, "ai", "skills", name, "SKILL.md");
    if (!existsSync(skillPath)) {
      return `assertion ${source} has no SKILL.md`;
    }
    return;
  }
  if (source.startsWith("agent:")) {
    const id = source.slice("agent:".length);
    const agentPath = join(mod.dir, "ai", "agents", id, "agent.json");
    if (!existsSync(agentPath)) {
      return `assertion ${source} has no agent.json`;
    }
  }
}

function frontmatterRecordScopeMismatch(root, mod, assertion) {
  if (assertion.source === "operations") {
    return;
  }
  let file;
  if (assertion.source.startsWith("skill:")) {
    file = join(
      mod.dir,
      "ai",
      "skills",
      assertion.source.slice("skill:".length),
      "SKILL.md"
    );
  } else if (assertion.source.startsWith("agent:")) {
    file = join(
      mod.dir,
      "ai",
      "agents",
      assertion.source.slice("agent:".length),
      "AGENTS.md"
    );
  }
  if (!(file && existsSync(file))) {
    return;
  }
  const fm = parseFrontmatter(readFileSync(file, "utf8"));
  if (!fm.record_scope) {
    return;
  }
  if (fm.record_scope !== assertion.kind) {
    return `${posixRel(root, file)}: frontmatter record_scope "${fm.record_scope}" contradicts asserted ${assertion.kind}`;
  }
}

function schemaAcceptsOrDerivesSpace(operation, mod) {
  const blob = [
    operation.objectText ?? "",
    operation.inputSchemaExpr ?? "",
  ].join("\n");
  if (/\bspace_id\b/.test(blob)) {
    return true;
  }
  const ident = rootSchemaIdent(operation.inputSchemaExpr);
  if (!(ident && mod)) {
    return false;
  }
  const queue = [ident];
  const seen = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const file of walkTsFiles(mod.dir)) {
      if (file.endsWith(".test.ts")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      const chunk = schemaIdentDeclChunk(source, current);
      if (!chunk) {
        continue;
      }
      if (/\bspace_id\b/.test(chunk)) {
        return true;
      }
      for (const parent of schemaCompositionParents(chunk)) {
        queue.push(parent);
      }
    }
  }
  return false;
}

function rootSchemaIdent(expr) {
  if (!expr) {
    return;
  }
  const match = expr.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1];
}

function schemaIdentDeclChunk(source, ident) {
  const decl = new RegExp(
    `(?:export\\s+)?(?:const|let|var)\\s+${ident}\\b[\\s\\S]{0,2500}`,
    "m"
  );
  return source.match(decl)?.[0];
}

/** Parent schema idents from `.extend` / `.omit` / … composition. */
function schemaCompositionParents(chunk) {
  const parents = [];
  const re =
    /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(?:extend|omit|pick|partial|merge|and|or|unwrap)\s*\(/g;
  let match = re.exec(chunk);
  while (match) {
    parents.push(match[1]);
    match = re.exec(chunk);
  }
  return parents;
}

function collectSkillNamesByModule(root, modules) {
  const byModule = new Map();
  for (const mod of modules.values()) {
    const names = new Set();
    const skillsDir = join(mod.dir, "ai", "skills");
    if (existsSync(skillsDir)) {
      for (const skillPath of findFiles(skillsDir, "SKILL.md")) {
        const dirName = skillPath.split(sep).at(-2);
        if (dirName) {
          names.add(dirName);
        }
        const fm = parseFrontmatter(readFileSync(skillPath, "utf8"));
        if (fm.name) {
          names.add(fm.name);
        }
      }
    }
    byModule.set(mod.id, names);
  }
  return byModule;
}

/** Policy kinds a named const may declare — mirrors plugin-sdk spacePolicy. */
const NAMED_POLICY_KINDS = new Set([
  "platform",
  "tenant_shared",
  "space_owned",
  "account_mounted",
  "user_owned",
]);

/**
 * Resolve `const FOO = { kind: "space_owned", … }` and wrappers that embed
 * `spacePolicy: { … }`. Without the bare-object path, references like
 * `spacePolicy: SPACE_OWNED_COLLECTION` stay unresolved and OPEN authoring
 * checks only see inline policies (e.g. files_account_bind).
 */
function collectNamedPolicies(source) {
  const map = new Map();
  const constRe = /(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g;
  let match = constRe.exec(source);
  while (match) {
    const braceStart = match.index + match[0].length - 1;
    const close = matchBrace(source, braceStart);
    if (close >= 0) {
      const objectBody = source.slice(braceStart, close + 1);
      const bare = readBarePolicyObject(objectBody);
      if (bare?.kind) {
        map.set(match[1], bare);
      } else {
        const wrapped = readSpacePolicy(
          source.slice(match.index, close + 1),
          new Map()
        );
        if (wrapped?.kind) {
          map.set(match[1], wrapped);
        }
      }
    }
    match = constRe.exec(source);
  }
  const fnRe =
    /(?:export\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
  match = fnRe.exec(source);
  while (match) {
    const close = matchBrace(source, match.index + match[0].length - 1);
    if (close >= 0) {
      const body = source.slice(match.index, close + 1);
      const parsed = readSpacePolicy(body, new Map());
      if (parsed?.kind) {
        map.set(match[1], parsed);
      }
    }
    match = fnRe.exec(source);
  }
  return map;
}

function readBarePolicyObject(objectBody) {
  const kind = objectBody.match(/\bkind\s*:\s*["']([^"']+)["']/)?.[1];
  if (!(kind && NAMED_POLICY_KINDS.has(kind))) {
    return;
  }
  return {
    hasRecord: /\brecord\s*:/.test(objectBody),
    kind,
  };
}

function readSpacePolicy(objectText, namedPolicies) {
  const idx = objectText.search(/spacePolicy\s*:/);
  if (idx < 0) {
    return;
  }
  let i = objectText.indexOf(":", idx) + 1;
  while (i < objectText.length && /\s/.test(objectText[i])) {
    i += 1;
  }
  if (objectText[i] === "{") {
    const close = matchBrace(objectText, i);
    const body =
      close >= 0 ? objectText.slice(i, close + 1) : objectText.slice(i);
    return {
      hasRecord: /\brecord\s*:/.test(body),
      kind: body.match(/\bkind\s*:\s*["']([^"']+)["']/)?.[1],
    };
  }
  const identMatch = objectText.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  if (!identMatch) {
    return { hasRecord: false, kind: undefined };
  }
  const named = namedPolicies.get(identMatch[1]);
  if (named) {
    return named;
  }
  return {
    hasRecord: /Record/i.test(identMatch[1]),
    kind: undefined,
  };
}

function readInputSchemaExpr(objectText) {
  const idx = objectText.search(/inputSchema\s*:/);
  if (idx < 0) {
    return;
  }
  let i = objectText.indexOf(":", idx) + 1;
  while (i < objectText.length && /\s/.test(objectText[i])) {
    i += 1;
  }
  const start = i;
  let depth = 0;
  while (i < objectText.length) {
    const c = objectText[i];
    if (c === "(" || c === "{" || c === "[") {
      depth += 1;
    } else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) {
        break;
      }
      depth -= 1;
    } else if (c === "," && depth === 0) {
      break;
    }
    i += 1;
  }
  return objectText.slice(start, i).trim();
}

function readStringField(objectText, field) {
  const match = objectText.match(
    new RegExp(`${field}\\s*:\\s*["']([^"']+)["']`)
  );
  return match?.[1];
}

function extractToolDescriptions(source) {
  const items = [];
  const idMatch = source.match(
    /(?:id:\s*["']([^"']+)["']|TOOL_ID\s*=\s*["']([^"']+)["'])/
  );
  const toolId = idMatch?.[1] ?? idMatch?.[2] ?? "";
  const descRe = /description\s*:\s*(["'`])([\s\S]*?)\1/g;
  let match = descRe.exec(source);
  while (match) {
    items.push({ description: match[2], id: toolId });
    match = descRe.exec(source);
  }
  return items;
}

function callObjectLiterals(source, callee, argIndex = 0) {
  const objects = [];
  const needle = `${callee}(`;
  let from = 0;
  while (from < source.length) {
    const idx = source.indexOf(needle, from);
    if (idx < 0) {
      break;
    }
    let i = idx + needle.length;
    let arg = 0;
    while (i < source.length && /\s/.test(source[i])) {
      i += 1;
    }
    while (arg < argIndex && i < source.length) {
      if (source[i] === "{") {
        const close = matchBrace(source, i);
        i = close < 0 ? source.length : close + 1;
      } else {
        while (i < source.length && source[i] !== "," && source[i] !== ")") {
          i += 1;
        }
      }
      if (source[i] === ",") {
        i += 1;
        arg += 1;
        while (i < source.length && /\s/.test(source[i])) {
          i += 1;
        }
      } else {
        break;
      }
    }
    if (source[i] === "{") {
      const close = matchBrace(source, i);
      if (close >= 0) {
        objects.push(source.slice(i, close + 1));
        from = close + 1;
        continue;
      }
    }
    from = idx + needle.length;
  }
  return objects;
}

function labeledObjectLiterals(source, label) {
  const objects = [];
  const needle = `${label}:`;
  let from = 0;
  while (from < source.length) {
    const idx = source.indexOf(needle, from);
    if (idx < 0) {
      break;
    }
    let i = idx + needle.length;
    while (i < source.length && /\s/.test(source[i])) {
      i += 1;
    }
    if (source[i] === "{") {
      const close = matchBrace(source, i);
      if (close >= 0) {
        objects.push(source.slice(i, close + 1));
        from = close + 1;
        continue;
      }
    }
    from = idx + needle.length;
  }
  return objects;
}

function matchBrace(src, start) {
  let depth = 0;
  let i = start;
  let mode = "code";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
      }
      i += 1;
      continue;
    }
    if (mode === "block") {
      if (c === "*" && n === "/") {
        mode = "code";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === "sq" || mode === "dq") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === (mode === "sq" ? "'" : '"')) {
        mode = "code";
      }
      i += 1;
      continue;
    }
    if (mode === "tq") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        mode = "code";
      }
      i += 1;
      continue;
    }
    if (c === "/" && n === "/") {
      mode = "line";
      i += 2;
      continue;
    }
    if (c === "/" && n === "*") {
      mode = "block";
      i += 2;
      continue;
    }
    if (c === "'") {
      mode = "sq";
      i += 1;
      continue;
    }
    if (c === '"') {
      mode = "dq";
      i += 1;
      continue;
    }
    if (c === "`") {
      mode = "tq";
      i += 1;
      continue;
    }
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
    i += 1;
  }
  return -1;
}

export function readMissingPolicyAllowlist(root) {
  const file = join(root, "packages", "plugin-sdk", "src", "space-policy.ts");
  if (!existsSync(file)) {
    return [];
  }
  const src = readFileSync(file, "utf8");
  const start = src.indexOf("MISSING_SPACE_POLICY_ALLOWLIST");
  if (start < 0) {
    return [];
  }
  const eq = src.indexOf("=", start);
  const open = src.indexOf("[", eq);
  if (open < 0) {
    return [];
  }
  let depth = 0;
  let i = open;
  while (i < src.length) {
    if (src[i] === "[") {
      depth += 1;
    } else if (src[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
    i += 1;
  }
  const body = src.slice(open, i + 1);
  const entries = [];
  const objRe = /\{[\s\S]*?\}/g;
  let match = objRe.exec(body);
  while (match) {
    const operationId = match[0].match(
      /operationId\s*:\s*["']([^"']+)["']/
    )?.[1];
    const owner = match[0].match(/owner\s*:\s*["']([^"']+)["']/)?.[1];
    const removalTask = match[0].match(
      /removalTask\s*:\s*["']([^"']+)["']/
    )?.[1];
    if (operationId || owner || removalTask) {
      entries.push({ operationId, owner, removalTask });
    }
    match = objRe.exec(body);
  }
  return entries;
}

function walkTsFiles(dir, acc = []) {
  if (!existsSync(dir)) {
    return acc;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, acc);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

function findFiles(dir, filename, acc = []) {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(full, filename, acc);
    } else if (entry.name === filename) {
      acc.push(full);
    }
  }
  return acc;
}

function posixRel(root, file) {
  return relative(root, file).split(sep).join("/");
}

export function formatAuthoringNotes(result) {
  const lines = [];
  if (result.inFlight.length > 0) {
    lines.push(
      "ai:check note — Package 10 CLOSED modules in-flight (not failing CI):"
    );
    for (const note of result.inFlight) {
      lines.push(`  ${note}`);
    }
  }
  return lines.join("\n");
}
