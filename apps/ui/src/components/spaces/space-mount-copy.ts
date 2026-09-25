import type { SpaceResourceKind } from "@engenty/ui-plugin-sdk";

/** Shared by the create flow copy and each per-kind editor. */
export const SPACE_MOUNT_KIND_COPY: Record<
  SpaceResourceKind,
  { hintKey: string; titleKey: string }
> = {
  agent: {
    hintKey: "spaces.setup.agentsHint",
    titleKey: "spaces.setup.agentsTitle",
  },
  plugin: {
    hintKey: "spaces.setup.pluginsHint",
    titleKey: "spaces.setup.pluginsTitle",
  },
  module: {
    hintKey: "spaces.setup.appsHint",
    titleKey: "spaces.setup.appsTitle",
  },
  skill: {
    hintKey: "spaces.setup.skillsHint",
    titleKey: "spaces.setup.skillsTitle",
  },
};
