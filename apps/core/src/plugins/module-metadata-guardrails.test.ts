import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENGENTY_HOST_MANDATORY_PLUGINS } from "./mandatory-plugins.js";
import { loadPluginManifest } from "./manifest.js";

function resolveModulesDir() {
  const candidates = [
    path.resolve(process.cwd(), "modules"),
    path.resolve(process.cwd(), "../../modules"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("modules directory not found");
  }
  return found;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
    string,
    unknown
  >;
}

/**
 * First-party `modules/*` slugs covered by manifest and source-shape guardrails.
 *
 * Discovered from disk (every `modules/<slug>` carrying a `package.json` +
 * `engenty.plugin.json`) rather than hand-maintained: a migrated module is held
 * to the contract automatically, with no frozen list to edit in lock-step.
 */
function discoverGuardedModuleSlugs(): string[] {
  const modulesDir = resolveModulesDir();
  return fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(path.join(modulesDir, entry.name, "package.json")) &&
        fs.existsSync(path.join(modulesDir, entry.name, "engenty.plugin.json"))
    )
    .map((entry) => entry.name)
    .sort();
}

const FIRST_PARTY_GUARDED_MODULE_SLUGS = discoverGuardedModuleSlugs();

const OPERATION_SLICE_NO_DIRECT_GATEWAY_MODULES: string[] = [];

const GATEWAY_METHODS_EXTRACTED_LAYOUT_MODULES: string[] = [];

const PLUGIN_FACTORY_ENTRY_MODULES = ["engenty-copilot"];

const DIRECT_GATEWAY_INVOCATION_ALLOWLIST: Record<string, string> = {};

const UI_PLUGIN_MODULES = ["engenty-copilot"];

const MANDATORY_PLATFORM_CAPABILITIES: Record<string, string[]> = {
  ...Object.fromEntries(
    ENGENTY_HOST_MANDATORY_PLUGINS.map((declaration) => [
      declaration.pluginId,
      [...declaration.capabilities],
    ])
  ),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.every((item) => typeof item === "string") ? value : null;
}

function listModuleManifests(modulesDir: string) {
  return FIRST_PARTY_GUARDED_MODULE_SLUGS.map((moduleName) => ({
    moduleName,
    manifest: readJson(
      path.join(modulesDir, moduleName, "engenty.plugin.json")
    ),
  }));
}

function listRuntimeTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRuntimeTypeScriptFiles(entryPath));
      continue;
    }
    if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

describe("module metadata guardrails", () => {
  it("discovers at least the known first-party modules to guard", () => {
    // Guarded set is derived from disk; assert discovery is wired (non-empty)
    // so an empty/incorrect modules path can never silently skip every check.
    expect(FIRST_PARTY_GUARDED_MODULE_SLUGS.length).toBeGreaterThan(0);
  });

  it("requires valid engenty.plugin.json metadata for every guarded first-party module", () => {
    const modulesDir = resolveModulesDir();
    const missing: string[] = [];

    for (const moduleName of FIRST_PARTY_GUARDED_MODULE_SLUGS) {
      const moduleDir = path.join(modulesDir, moduleName);
      const packagePath = path.join(moduleDir, "package.json");
      const rootIndexPath = path.join(moduleDir, "index.ts");
      const bridgeManifestPath = path.join(moduleDir, "app.plugin.json");
      const targetManifestPath = path.join(moduleDir, "engenty.plugin.json");

      if (!(fs.existsSync(packagePath) && fs.existsSync(targetManifestPath))) {
        missing.push(`${moduleName}: package/engenty.plugin files`);
        continue;
      }

      if (fs.existsSync(bridgeManifestPath)) {
        missing.push(`${moduleName}: remove app.plugin.json bridge`);
        continue;
      }
      if (fs.existsSync(rootIndexPath)) {
        missing.push(`${moduleName}: remove root index.ts runtime bridge`);
      }

      const pkg = readJson(packagePath);
      const engenty = isRecord(pkg.engenty) ? pkg.engenty : null;

      const manifestLoad = loadPluginManifest(moduleDir);
      if (!manifestLoad.ok) {
        missing.push(
          `${moduleName}: engenty.plugin.json (${manifestLoad.error})`
        );
        continue;
      }
      const effective = manifestLoad.manifest;

      if (effective.id !== moduleName) {
        missing.push(`${moduleName}: manifest id alignment`);
      }

      const serverEntry =
        typeof effective.server?.entry === "string"
          ? effective.server.entry.trim()
          : "";
      const packageEntries = readStringArray(engenty?.extensions);
      if (!serverEntry) {
        missing.push(`${moduleName}: explicit server entry metadata`);
      }
      if (serverEntry !== "./src/plugin.ts") {
        missing.push(`${moduleName}: server entry must be ./src/plugin.ts`);
      }
      if (packageEntries && packageEntries.length > 0) {
        missing.push(
          `${moduleName}: package.json plugin entries are not supported (use engenty.plugin.json server.entry)`
        );
      }

      const ui = isRecord(effective.ui) ? effective.ui : null;
      const uiEntry = typeof ui?.entry === "string" ? ui.entry.trim() : "";
      const uiExport = typeof ui?.export === "string" ? ui.export.trim() : "";
      const uiLoad = ui?.load === "workspace" ? "workspace" : "runtime";
      const uiTailwindSources = readStringArray(ui?.tailwindSources);
      const uiStaticAssets = readStringArray(ui?.staticAssets);
      const capabilities = effective.capabilities ?? {};
      const uiCap = capabilities.ui ?? false;

      if (
        uiCap &&
        !(
          uiEntry &&
          uiExport &&
          (uiLoad === "runtime" ||
            (uiTailwindSources && uiTailwindSources.length > 0)) &&
          (uiLoad === "workspace" ||
            (uiStaticAssets && uiStaticAssets.length > 0))
        )
      ) {
        missing.push(`${moduleName}: explicit UI entry metadata`);
      }

      const provides = effective.provides;
      if (!Array.isArray(provides) || provides.length === 0) {
        missing.push(`${moduleName}: explicit dependency metadata`);
      } else if (
        (effective.requires !== undefined &&
          !Array.isArray(effective.requires)) ||
        (effective.optional !== undefined && !Array.isArray(effective.optional))
      ) {
        missing.push(`${moduleName}: explicit dependency metadata`);
      }

      const operations = capabilities.operations ?? false;
      const ai = capabilities.ai ?? false;
      const frontendTools = capabilities.frontendTools ?? false;
      if (
        !(
          typeof operations === "boolean" &&
          typeof uiCap === "boolean" &&
          typeof ai === "boolean" &&
          typeof frontendTools === "boolean"
        )
      ) {
        missing.push(`${moduleName}: explicit capability metadata`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("requires migrationsDir metadata when a module ships migrations", () => {
    const modulesDir = resolveModulesDir();
    const missing: string[] = [];

    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const moduleDir = path.join(modulesDir, entry.name);
      const packagePath = path.join(moduleDir, "package.json");
      const migrationsDir = path.join(moduleDir, "supabase", "migrations");
      if (!(fs.existsSync(packagePath) && fs.existsSync(migrationsDir))) {
        continue;
      }
      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"));
      if (migrationFiles.length === 0) {
        continue;
      }
      const pkg = readJson(packagePath);
      const engenty = pkg.engenty as { migrationsDir?: unknown } | undefined;
      if (engenty?.migrationsDir !== "./supabase/migrations") {
        missing.push(entry.name);
      }
    }

    expect(missing).toEqual([]);
  });

  it("keeps first-party manifest dependency semantics resolvable", () => {
    const modulesDir = resolveModulesDir();
    const packagesDir = path.resolve(modulesDir, "../packages");
    const manifests = listModuleManifests(modulesDir);
    const provided = new Set<string>();
    const offenders: string[] = [];

    // Package plugins (tenant-settings, user-settings, …) are valid require
    // targets for modules even though they live outside modules/*.
    if (fs.existsSync(packagesDir)) {
      for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const packageDir = path.join(packagesDir, entry.name);
        const manifestPath = path.join(packageDir, "engenty.plugin.json");
        if (!fs.existsSync(manifestPath)) {
          continue;
        }
        // loadPluginManifest expects the plugin root directory, not the file.
        const loaded = loadPluginManifest(packageDir);
        if (!loaded.ok) {
          continue;
        }
        for (const capability of loaded.manifest.provides ?? []) {
          provided.add(capability);
        }
        provided.add(loaded.manifest.id);
        provided.add(`module.${loaded.manifest.id}`);
      }
    }

    for (const { manifest, moduleName } of manifests) {
      const provides = readStringArray(manifest.provides) ?? [];
      for (const capability of provides) {
        provided.add(capability);
      }

      if (!provides.includes(`module.${moduleName}`)) {
        offenders.push(
          `${moduleName}: provides must include module.${moduleName}`
        );
      }

      const uniqueProvides = new Set(provides);
      if (uniqueProvides.size !== provides.length) {
        offenders.push(`${moduleName}: duplicate provides entries`);
      }
    }

    for (const { manifest, moduleName } of manifests) {
      for (const field of ["requires", "optional"] as const) {
        const dependencies = readStringArray(manifest[field]) ?? [];
        const uniqueDependencies = new Set(dependencies);
        if (uniqueDependencies.size !== dependencies.length) {
          offenders.push(`${moduleName}: duplicate ${field} entries`);
        }

        for (const dependency of dependencies) {
          if (
            dependency === moduleName ||
            dependency === `module.${moduleName}`
          ) {
            offenders.push(`${moduleName}: ${field} contains self-dependency`);
          }
          // `optional` is "wire up if present" — a soft, capability-based
          // plugin integration that legitimately resolves to nothing when the
          // target module isn't in the current stack. Only `requires` (a hard
          // dependency) must resolve against a first-party provider.
          if (field === "requires" && !provided.has(dependency)) {
            offenders.push(
              `${moduleName}: ${field} references unknown ${dependency}`
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps module operation capabilities declared by a first-party manifest", () => {
    const modulesDir = resolveModulesDir();
    const manifests = listModuleManifests(modulesDir);
    const provided = new Set<string>();
    const offenders: string[] = [];

    for (const { manifest } of manifests) {
      for (const capability of readStringArray(manifest.provides) ?? []) {
        provided.add(capability);
      }
    }

    for (const moduleName of FIRST_PARTY_GUARDED_MODULE_SLUGS) {
      const moduleSrcDir = path.join(modulesDir, moduleName, "src");
      if (!fs.existsSync(moduleSrcDir)) {
        continue;
      }

      for (const filePath of listRuntimeTypeScriptFiles(moduleSrcDir)) {
        const source = fs.readFileSync(filePath, "utf8");
        for (const match of source.matchAll(
          /"module\.[a-z0-9.-]+\.(read|write)"/g
        )) {
          const capability = match[0].slice(1, -1);
          if (!provided.has(capability)) {
            offenders.push(
              `${path.relative(modulesDir, filePath)}: ${capability} is not provided by any first-party manifest`
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps mandatory platform service capabilities explicit", () => {
    const modulesDir = resolveModulesDir();
    const packagesDir = path.resolve(modulesDir, "../packages");
    const offenders: string[] = [];

    for (const [pluginId, requiredProvides] of Object.entries(
      MANDATORY_PLATFORM_CAPABILITIES
    )) {
      const moduleManifestPath = path.join(
        modulesDir,
        pluginId,
        "engenty.plugin.json"
      );
      const packageManifestPath = path.join(
        packagesDir,
        pluginId,
        "engenty.plugin.json"
      );
      const manifestPath = fs.existsSync(moduleManifestPath)
        ? moduleManifestPath
        : packageManifestPath;
      if (!fs.existsSync(manifestPath)) {
        offenders.push(`${pluginId}: missing engenty.plugin.json`);
        continue;
      }
      const manifest = readJson(manifestPath);
      const provides = readStringArray(manifest.provides) ?? [];
      for (const capability of requiredProvides) {
        if (!provides.includes(capability)) {
          offenders.push(`${pluginId}: missing ${capability}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps mandatory host plugin declarations discoverable", () => {
    const modulesDir = resolveModulesDir();
    const packagesDir = path.resolve(modulesDir, "../packages");
    const moduleNames = new Set(
      listModuleManifests(modulesDir).map(({ moduleName }) => moduleName)
    );
    const packageNames = new Set(
      fs.existsSync(packagesDir)
        ? fs
            .readdirSync(packagesDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        : []
    );

    for (const declaration of ENGENTY_HOST_MANDATORY_PLUGINS) {
      const moduleBacked = moduleNames.has(declaration.pluginId);
      const packageBacked = packageNames.has(declaration.pluginId);
      expect(
        moduleBacked || packageBacked,
        `${declaration.pluginId} must exist under modules/* or packages/*`
      ).toBe(true);
      expect(declaration.hostHealthRelevant).toBe(true);
      expect(declaration.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("keeps first-party server plugins on EngentyPluginFactory (src/plugin.ts)", () => {
    const modulesDir = resolveModulesDir();
    const offenders: string[] = [];

    for (const moduleName of PLUGIN_FACTORY_ENTRY_MODULES) {
      const entryPath = path.join(modulesDir, moduleName, "src", "plugin.ts");
      const source = fs.existsSync(entryPath)
        ? fs.readFileSync(entryPath, "utf8")
        : "";

      if (!source) {
        offenders.push(`${moduleName}: missing src/plugin.ts`);
        continue;
      }
      if (!source.includes("EngentyPluginFactory")) {
        offenders.push(`${moduleName}: missing EngentyPluginFactory type`);
      }
      if (
        source.includes("register(api") ||
        source.includes("activate(api") ||
        source.includes("PluginApi")
      ) {
        offenders.push(`${moduleName}: unsupported PluginApi entry shape`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps direct gateway invocation uses explicitly allowlisted", () => {
    const modulesDir = resolveModulesDir();
    const allowed = new Set(Object.keys(DIRECT_GATEWAY_INVOCATION_ALLOWLIST));
    const offenders: string[] = [];
    const observed = new Set<string>();

    for (const moduleName of FIRST_PARTY_GUARDED_MODULE_SLUGS) {
      const moduleDir = path.join(modulesDir, moduleName);
      for (const filePath of listRuntimeTypeScriptFiles(moduleDir)) {
        const source = fs.readFileSync(filePath, "utf8");
        if (
          !(
            source.includes("callGatewayMethod(") ||
            source.includes(".callGatewayMethod") ||
            source.includes("callGatewayMethod?.(")
          )
        ) {
          continue;
        }

        const relativePath = path.relative(modulesDir, filePath);
        observed.add(relativePath);
        if (!allowed.has(relativePath)) {
          offenders.push(`${relativePath}: direct gateway invocation`);
        }
      }
    }

    for (const allowedPath of allowed) {
      if (!observed.has(allowedPath)) {
        offenders.push(`${allowedPath}: allowlist entry no longer needed`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps UI plugins on conventional ui/plugin.ts default exports", () => {
    const modulesDir = resolveModulesDir();
    const offenders: string[] = [];

    for (const moduleName of UI_PLUGIN_MODULES) {
      const moduleDir = path.join(modulesDir, moduleName);
      const pluginPath = path.join(moduleDir, "ui", "plugin.ts");
      const packagePath = path.join(moduleDir, "package.json");
      const targetManifestPath = path.join(moduleDir, "engenty.plugin.json");

      if (!fs.existsSync(pluginPath)) {
        offenders.push(`${moduleName}: missing ui/plugin.ts`);
        continue;
      }
      const pluginSource = fs.readFileSync(pluginPath, "utf8");
      if (!pluginSource.includes("export default function plugin(")) {
        offenders.push(
          `${moduleName}: ui/plugin.ts must default-export plugin`
        );
      }

      const targetManifest = readJson(targetManifestPath);
      const manifestUi = isRecord(targetManifest.ui) ? targetManifest.ui : null;
      const uiEntry =
        typeof manifestUi?.entry === "string" ? manifestUi.entry : "";
      const uiExport =
        typeof manifestUi?.export === "string" ? manifestUi.export : "";
      if (uiEntry) {
        offenders.push(`${moduleName}: manifest ui.entry is conventional`);
      }
      if (uiExport) {
        offenders.push(`${moduleName}: manifest ui.export is conventional`);
      }

      const pkg = readJson(packagePath);
      const exports = isRecord(pkg.exports) ? pkg.exports : null;
      const packagePluginExport = isRecord(exports?.["./ui/plugin"])
        ? exports["./ui/plugin"]
        : null;
      if (!packagePluginExport) {
        offenders.push(`${moduleName}: missing ./ui/plugin package export`);
        continue;
      }
      if (packagePluginExport.default !== "./dist/ui/plugin.js") {
        offenders.push(
          `${moduleName}: package export must point at dist/ui/plugin.js`
        );
      }
      if (packagePluginExport.types !== "./dist/ui/plugin.d.ts") {
        offenders.push(
          `${moduleName}: package types must point at dist/ui/plugin.d.ts`
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps registerOperation slices off direct api.registerGatewayMethod calls", () => {
    const modulesDir = resolveModulesDir();
    const offenders: string[] = [];

    for (const moduleName of OPERATION_SLICE_NO_DIRECT_GATEWAY_MODULES) {
      const scanDirs = [path.join(modulesDir, moduleName, "src")];
      if (moduleName === "knowledge-base") {
        scanDirs.push(path.join(modulesDir, moduleName, "ai"));
      }
      for (const scanDir of scanDirs) {
        for (const filePath of listRuntimeTypeScriptFiles(scanDir)) {
          const source = fs.readFileSync(filePath, "utf8");
          if (source.includes("api.registerGatewayMethod(")) {
            offenders.push(path.relative(modulesDir, filePath));
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps modules off direct automation hook emits", () => {
    const modulesDir = resolveModulesDir();
    const offenders: string[] = [];

    for (const moduleName of FIRST_PARTY_GUARDED_MODULE_SLUGS) {
      const moduleDir = path.join(modulesDir, moduleName);
      for (const filePath of listRuntimeTypeScriptFiles(moduleDir)) {
        const source = fs.readFileSync(filePath, "utf8");
        if (
          source.includes("emitAutomationHook(") ||
          source.includes("AUTOMATION_HOOK_")
        ) {
          offenders.push(path.relative(modulesDir, filePath));
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps registerOperation declarations out of src/api/index.ts when gateway-methods.ts exists", () => {
    const modulesDir = resolveModulesDir();
    const offenders: string[] = [];

    for (const moduleName of GATEWAY_METHODS_EXTRACTED_LAYOUT_MODULES) {
      const apiDir = path.join(modulesDir, moduleName, "src", "api");
      const indexPath = path.join(apiDir, "index.ts");
      const gatewayMethodsPath = path.join(apiDir, "gateway-methods.ts");
      const gatewayMethodsIndexPath = path.join(
        apiDir,
        "gateway-methods",
        "index.ts"
      );
      if (
        !(
          fs.existsSync(gatewayMethodsPath) ||
          fs.existsSync(gatewayMethodsIndexPath)
        )
      ) {
        offenders.push(
          `${moduleName}: missing src/api/gateway-methods.ts or src/api/gateway-methods/index.ts`
        );
        continue;
      }
      if (
        fs.existsSync(indexPath) &&
        fs
          .readFileSync(indexPath, "utf8")
          .includes("api.server.registerOperation(")
      ) {
        offenders.push(`${moduleName}: registerOperation in src/api/index.ts`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
