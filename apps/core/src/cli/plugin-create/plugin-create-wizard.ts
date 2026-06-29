import {
  cancel,
  confirm,
  intro,
  isCancel,
  outro,
  select,
  text,
} from "@clack/prompts";
import type { PluginCreateAnswers } from "./plugin-create-types.js";
import {
  isValidKebabPluginSlug,
  slugFromDisplayName,
  validateNewPluginSlug,
} from "./plugin-create-validate.js";

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function defaultAnswersFromSlug(
  slug: string
): Omit<PluginCreateAnswers, "slug"> {
  return {
    description: "Scaffolded Engenty module.",
    displayName: titleCaseFromSlug(slug),
    includeUi: true,
    serverRoutes: true,
    uiLoad: "workspace",
  };
}

export async function runPluginCreateWizard(params: {
  existingSlugs: readonly string[];
  initialSlug?: string;
}): Promise<PluginCreateAnswers | "cancelled"> {
  intro("Create Engenty module plugin");

  const slugHint = params.initialSlug?.trim() ?? "";

  const displayName = await text({
    initialValue: slugHint ? titleCaseFromSlug(slugHint) : undefined,
    message: "Display name",
    validate(value) {
      return value.trim().length > 0 ? undefined : "Display name is required.";
    },
  });

  if (isCancel(displayName)) {
    cancel("Cancelled.");
    return "cancelled";
  }

  const displayNameTrimmed = displayName.trim();
  const suggestedSlug = slugHint || slugFromDisplayName(displayNameTrimmed);

  const slugRaw = await text({
    initialValue: suggestedSlug,
    message: "Plugin id (kebab-case, becomes modules/<id>/)",
    validate(value) {
      return validateNewPluginSlug({
        existingSlugs: params.existingSlugs,
        slug: value.trim(),
      });
    },
  });

  if (isCancel(slugRaw)) {
    cancel("Cancelled.");
    return "cancelled";
  }

  const slug = slugRaw.trim();

  const description = await text({
    message: "Short description",
  });

  if (isCancel(description)) {
    cancel("Cancelled.");
    return "cancelled";
  }

  const includeUi = await confirm({
    initialValue: true,
    message: "Include UI (routes, plugin, locales)?",
  });

  if (isCancel(includeUi)) {
    cancel("Cancelled.");
    return "cancelled";
  }

  let uiLoad: PluginCreateAnswers["uiLoad"] = "workspace";
  if (includeUi) {
    const load = await select({
      initialValue: "workspace",
      message:
        "How should the UI bundle load? Workspace: Vite resolves source from the monorepo (fast local dev, run generate:plugins). Runtime: ship built assets from dist/ (closer to production bundles).",
      options: [
        {
          hint: "Recommended for modules/*",
          label: "Workspace (source-linked)",
          value: "workspace" as const,
        },
        {
          hint: "Built dist/ui/plugin.js",
          label: "Runtime (prebuilt bundle)",
          value: "runtime" as const,
        },
      ],
    });

    if (isCancel(load)) {
      cancel("Cancelled.");
      return "cancelled";
    }
    uiLoad = load;
  }

  const serverRoutes = await confirm({
    initialValue: true,
    message: "Include backend (HTTP routes)?",
  });

  if (isCancel(serverRoutes)) {
    cancel("Cancelled.");
    return "cancelled";
  }

  const answers: PluginCreateAnswers = {
    description: description.trim() || defaultAnswersFromSlug(slug).description,
    displayName: displayNameTrimmed,
    includeUi,
    serverRoutes,
    slug,
    uiLoad,
  };

  outro(`Ready to scaffold modules/${slug}/`);
  return answers;
}

export function resolveNonInteractivePluginCreate(params: {
  description?: string;
  displayName?: string;
  existingSlugs: readonly string[];
  initialSlug?: string;
  noServerRoutes?: boolean;
  noUi?: boolean;
  uiLoad?: string;
}): { error?: string; value?: PluginCreateAnswers } {
  const slugCandidate = (params.initialSlug ?? "").trim();
  if (!isValidKebabPluginSlug(slugCandidate)) {
    return {
      error:
        "Provide a kebab-case plugin id via the [name] argument or --id <slug>.",
    };
  }
  const conflict = validateNewPluginSlug({
    existingSlugs: params.existingSlugs,
    slug: slugCandidate,
  });
  if (conflict) {
    return { error: conflict };
  }

  const defaults = defaultAnswersFromSlug(slugCandidate);
  const includeUi = params.noUi ? false : defaults.includeUi;
  const serverRoutes = params.noServerRoutes ? false : defaults.serverRoutes;
  let uiLoad = defaults.uiLoad;
  if (params.uiLoad === "runtime" || params.uiLoad === "workspace") {
    uiLoad = params.uiLoad;
  } else if (params.uiLoad) {
    return {
      error: 'Invalid --ui-load (use "workspace" or "runtime").',
    };
  }

  return {
    value: {
      description: (params.description ?? defaults.description).trim(),
      displayName: (params.displayName?.trim() || defaults.displayName).trim(),
      includeUi,
      serverRoutes,
      slug: slugCandidate,
      uiLoad: includeUi ? uiLoad : "workspace",
    },
  };
}
