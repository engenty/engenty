import fs from "node:fs";
import path from "node:path";
import type { PluginCreateAnswers } from "./plugin-create-types.js";

export interface ScaffoldFile {
  content: string;
  relativePath: string;
}

export function slugToPascalCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function slugToCamelCase(slug: string): string {
  const pascal = slugToPascalCase(slug);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function normalizePluginCreateAnswers(
  input: PluginCreateAnswers
): PluginCreateAnswers {
  return {
    ...input,
    slug: input.slug.trim(),
    displayName: input.displayName.trim(),
    description: input.description.trim(),
    uiLoad: input.includeUi ? input.uiLoad : "workspace",
  };
}

export function collectPluginScaffoldFiles(
  answers: PluginCreateAnswers
): ScaffoldFile[] {
  const a = normalizePluginCreateAnswers(answers);
  const { slug, displayName, description } = a;
  const pascal = slugToPascalCase(slug);
  const camel = slugToCamelCase(slug);
  const pkg = `@engenty/${slug}`;
  const registerPluginFn = `register${pascal}Plugin`;
  const registerApiFn = `register${pascal}Api`;
  const registerUiFn = `register${pascal}UiPlugin`;
  const pageComponent = `${pascal}Page`;
  const queriesFileBase = `${slug}-queries`;

  const files: ScaffoldFile[] = [];

  const manifest: Record<string, unknown> = {
    id: slug,
    name: displayName,
    description,
    version: "0.0.1",
    kind: "module",
    provides: [`module.${slug}`, `module.${slug}.read`],
  };

  if (a.includeUi) {
    (manifest.provides as string[]).push(`ui.route.module.${slug}`);
    if (a.uiLoad !== "workspace") {
      manifest.ui = {
        entry: "./dist/ui/plugin.js",
        export: "default",
        staticAssets: [`./ui/${slug}.css`],
      };
    }
  }

  files.push({
    relativePath: "engenty.plugin.json",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });

  const tsupEntries = ["src/plugin.ts"];
  if (a.serverRoutes) {
    tsupEntries.push("src/api/index.ts");
  }
  if (a.includeUi) {
    tsupEntries.push("ui/plugin.ts");
    if (a.serverRoutes) {
      tsupEntries.push("ui/api.ts");
    }
  }

  const exports: Record<string, Record<string, string>> = {
    ".": {
      types: "./dist/src/plugin.d.ts",
      default: "./dist/src/plugin.js",
    },
  };
  if (a.includeUi) {
    exports["./ui/plugin"] = {
      types: "./dist/ui/plugin.d.ts",
      default: "./dist/ui/plugin.js",
    };
    if (a.serverRoutes) {
      exports["./ui/api"] = {
        types: "./dist/ui/api.d.ts",
        default: "./dist/ui/api.js",
      };
    }
  }

  const dependencies: Record<string, string> = {
    "@engenty/plugin-sdk": "workspace:*",
  };
  const devDependencies: Record<string, string> = {
    "@types/node": "^24.12.0",
    typescript: "^5.9.3",
    tsup: "^8.5.1",
    vitest: "^4.1.0",
  };

  if (a.includeUi) {
    dependencies["@engenty/i18n"] = "workspace:*";
    dependencies["@engenty/ui-core"] = "workspace:*";
    dependencies["@engenty/ui-icons"] = "workspace:*";
    dependencies["@engenty/ui-plugin-sdk"] = "workspace:*";
    dependencies.react = "^19.2.4";
    dependencies["react-dom"] = "^19.2.4";
    dependencies["react-router-dom"] = "^7.13.1";
    devDependencies["@types/react"] = "^19.2.14";
    devDependencies["@types/react-dom"] = "^19.2.3";
    if (a.serverRoutes) {
      dependencies["@engenty/api-client"] = "workspace:*";
      dependencies["@engenty/query-client"] = "workspace:*";
    }
  }
  if (a.serverRoutes) {
    dependencies["@hono/zod-openapi"] = "^1.2.2";
  }

  const packageJson = {
    name: pkg,
    version: "0.0.1",
    description,
    private: true,
    type: "module",
    main: "./dist/src/plugin.js",
    types: "./dist/src/plugin.d.ts",
    exports,
    scripts: {
      build: `tsup ${tsupEntries.join(" ")} --format esm --dts --clean`,
      dev: `tsup ${tsupEntries.join(" ")} --format esm --dts --watch`,
      test: "vitest run --config vitest.config.ts",
      lint: "biome check .",
    },
    dependencies,
    devDependencies,
  };

  files.push({
    relativePath: "package.json",
    content: `${JSON.stringify(packageJson, null, 2)}\n`,
  });

  files.push({
    relativePath: "tsconfig.json",
    content: `${JSON.stringify(
      {
        extends: "../../tsconfig.base.json",
        compilerOptions: {
          moduleResolution: "NodeNext",
          module: "NodeNext",
          outDir: "dist",
          ...(a.includeUi ? { jsx: "react-jsx" as const } : {}),
        },
        include: ["src", ...(a.includeUi ? (["ui"] as const) : [])],
      },
      null,
      2
    )}\n`,
  });

  files.push({
    relativePath: "vitest.config.ts",
    content: `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: true,
  },
});
`,
  });

  const pluginBody = a.serverRoutes
    ? `import { ${registerApiFn} } from "./api/index.js";

const ${registerPluginFn}: EngentyPluginFactory = (engenty) => {
  ${registerApiFn}(engenty.server);
};
`
    : `const ${registerPluginFn}: EngentyPluginFactory = () => {};
`;

  files.push({
    relativePath: "src/plugin.ts",
    content: `import type { EngentyPluginFactory } from "@engenty/plugin-sdk";

${pluginBody}
export default ${registerPluginFn};
`,
  });

  if (a.serverRoutes) {
    files.push({
      relativePath: "src/api/index.ts",
      content: `import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";

const scaffoldResponseSchema = z.object({
  hello_message: z.string(),
  plugin_id: z.string(),
});

export function ${registerApiFn}(
  server: Pick<PluginServerApi, "registerHttpRoute">
) {
  server.registerHttpRoute({
    method: "get",
    path: "/api/${slug}",
    operation: {
      moduleId: "${slug}",
      requiredCapabilities: ["module.${slug}.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "${displayName} scaffold endpoint",
    tags: ["${slug}"],
    responses: {
      200: {
        description: "Scaffold payload",
        schema: scaffoldResponseSchema,
      },
    },
    handler: async () => ({
      hello_message: "Hello from Engenty.",
      plugin_id: "${slug}",
    }),
  });
}
`,
    });

    files.push({
      relativePath: "src/plugin.test.ts",
      content: `import type { EngentyPluginApi, PluginHttpRoute } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import ${registerPluginFn} from "./plugin.js";

function makePluginApi() {
  const httpRoutes: PluginHttpRoute[] = [];

  const engenty = {
    server: {
      registerHttpRoute: (route: PluginHttpRoute) => {
        httpRoutes.push(route);
      },
    },
  } as unknown as EngentyPluginApi;

  return { engenty, httpRoutes };
}

describe("${registerPluginFn}", () => {
  it("exports a plugin factory function", () => {
    expect(typeof ${registerPluginFn}).toBe("function");
  });

  it("registers the scaffold HTTP route", () => {
    const { engenty, httpRoutes } = makePluginApi();

    ${registerPluginFn}(engenty);

    expect(httpRoutes.map((route) => route.path)).toContain("/api/${slug}");
  });
});
`,
    });
  } else {
    files.push({
      relativePath: "src/plugin.test.ts",
      content: `import { describe, expect, it } from "vitest";
import ${registerPluginFn} from "./plugin.js";

describe("${registerPluginFn}", () => {
  it("exports a plugin factory function", () => {
    expect(typeof ${registerPluginFn}).toBe("function");
  });
});
`,
    });
  }

  if (a.includeUi) {
    const menuLabel = displayName;
    const useQueryBlock = a.serverRoutes
      ? `import { useQuery } from "@engenty/query-client";
import { ${camel}GreetingOptions } from "../${queriesFileBase}.js";
`
      : "";
    const queryHookBlock = a.serverRoutes
      ? `const { data, error, isPending } = useQuery(${camel}GreetingOptions());
`
      : "";

    const dataSection = a.serverRoutes
      ? `{isPending ? (
            <p className="text-muted-foreground">{t("loading")}</p>
          ) : null}
          {error ? <p className="text-destructive">{t("error")}</p> : null}
          {data ? (
            <dl className="mt-[3.25rem] grid gap-2 border-t pt-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("apiLabel")}</dt>
                <dd className="font-medium">{data.hello_message}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("pluginIdLabel")}</dt>
                <dd className="font-medium">{data.plugin_id}</dd>
              </div>
            </dl>
          ) : null}`
      : `<p className="text-muted-foreground">{t("staticIntro")}</p>`;

    files.push({
      relativePath: `ui/pages/${slug}-page.tsx`,
      content: `import { useTranslation } from "@engenty/i18n/ui";
${useQueryBlock}import { Card, CardContent, CardHeader, CardTitle } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";

export function ${pageComponent}() {
  const { t } = useTranslation("${slug}");
  const { t: tc } = useTranslation("common");
${queryHookBlock}
  const breadcrumbs = useMemo(
    () => [{ label: tc("navigation.modules") }, { label: t("title") }],
    [t, tc]
  );

  usePageConfig({
    breadcrumbs,
  });

  return (
    <div className={"engenty-plugin-${slug} p-page"}>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-11 text-sm">
          <p className="max-w-3xl text-muted-foreground">{t("intro")}</p>
          ${dataSection}
        </CardContent>
      </Card>
    </div>
  );
}
`,
    });

    files.push({
      relativePath: "ui/plugin.ts",
      content: `import { DockPluginsIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import "./${slug}.css";
import { ${pageComponent} } from "./pages/${slug}-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "${slug}",
    namespace: "${slug}",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  engenty.UI.registerRoute({
    id: "${slug}.module.root",
    path: "/mdl/${slug}",
    component: ${pageComponent},
    order: 50,
  });

  engenty.UI.registerAdminMenuItem({
    id: "${slug}.module.menu",
    section: "modules",
    label: "${menuLabel}",
    labelKey: "${slug}:menu.label",
    to: "/mdl/${slug}",
    icon: DockPluginsIcon,
    order: 50,
  });
}
`,
    });

    files.push({
      relativePath: "ui/locales/en.json",
      content: `${JSON.stringify(
        {
          title: displayName,
          intro: a.serverRoutes
            ? "This page loads data from the module HTTP route."
            : "This page is a UI-only scaffold.",
          loading: "Loading…",
          error: "Could not load module data.",
          apiLabel: "API message",
          pluginIdLabel: "Plugin id",
          staticIntro:
            "Add server routes and an API client to load live data here.",
          menu: { label: menuLabel },
        },
        null,
        2
      )}\n`,
    });

    files.push({
      relativePath: "ui/locales/de.json",
      content: `${JSON.stringify(
        {
          title: displayName,
          intro: a.serverRoutes
            ? "Diese Seite lädt Daten über die Modul-HTTP-Route."
            : "Diese Seite ist eine reine UI-Vorlage.",
          loading: "Wird geladen…",
          error: "Moduldaten konnten nicht geladen werden.",
          apiLabel: "API-Nachricht",
          pluginIdLabel: "Plugin-ID",
          staticIntro:
            "Füge Server-Routen und einen API-Client hinzu, um hier Live-Daten zu laden.",
          menu: { label: menuLabel },
        },
        null,
        2
      )}\n`,
    });

    if (a.serverRoutes) {
      files.push({
        relativePath: `ui/${queriesFileBase}.ts`,
        content: `import { queryOptions } from "@engenty/query-client";
import { get${pascal}Message } from "./api.js";

export const ${camel}Keys = {
  all: ["${slug}"] as const,
  greeting: () => [...${camel}Keys.all, "greeting"] as const,
};

export function ${camel}GreetingOptions() {
  return queryOptions({
    queryKey: ${camel}Keys.greeting(),
    queryFn: ({ signal }) => get${pascal}Message(signal),
  });
}
`,
      });

      files.push({
        relativePath: "ui/api.ts",
        content: `import { requestApiJson } from "@engenty/api-client";

export interface ${pascal}Payload {
  hello_message: string;
  plugin_id: string;
}

export function get${pascal}Message(signal?: AbortSignal) {
  return requestApiJson<${pascal}Payload>("/api/${slug}", { signal });
}
`,
      });
    }

    files.push({
      relativePath: `ui/${slug}.css`,
      content: `@layer engenty.plugins {
  .engenty-plugin-${slug} {
    display: block;
  }

  .engenty-plugin-${slug} .p-11 {
    padding: 2.75rem;
  }

  .engenty-plugin-${slug} .mt-\\[3\\.25rem\\] {
    margin-top: 3.25rem;
  }
}
`,
    });
  }

  return files;
}

export function writePluginScaffold(params: {
  moduleRootDir: string;
  files: readonly ScaffoldFile[];
}): void {
  for (const file of params.files) {
    const abs = path.join(params.moduleRootDir, file.relativePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content, "utf8");
  }
}
