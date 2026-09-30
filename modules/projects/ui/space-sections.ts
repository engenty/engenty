/**
 * Pinned projects on the space's Work sidebar and home, through the host's
 * `registerSpaceSection`. Only the projects of the space being viewed are
 * listed; a pin on a project elsewhere shows up in that project's own space.
 */
import { useQuery } from "@engenty/query-client";
import { DockProjectsIcon } from "@engenty/ui-icons";
import type {
  EngentyPluginContext,
  UiSpaceSectionContext,
  UiSpaceSectionItems,
} from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useProjectPins } from "./lib/project-pins.js";
import { projectsListOptions } from "./queries.js";

/** The list route's page maximum. */
const PAGE_SIZE = 200;

function usePinnedProjectItems({
  spaceId,
}: UiSpaceSectionContext): UiSpaceSectionItems {
  const pins = useProjectPins();
  const hasPins = pins.projectIds.length > 0;
  const projects = useQuery({
    ...projectsListOptions({ pageSize: PAGE_SIZE, space_id: spaceId }),
    enabled: hasPins,
  });

  const items = useMemo(() => {
    const byId = new Map(
      (projects.data?.data ?? []).map((project) => [project.id, project])
    );
    // Pin order, not list order: the newest pin goes last, like Favoriten.
    return pins.projectIds.flatMap((id) => {
      const project = byId.get(id);
      return project
        ? [
            {
              description: project.client_name,
              icon: DockProjectsIcon,
              id: project.id,
              label: project.title,
              path: project.id,
            },
          ]
        : [];
    });
  }, [pins.projectIds, projects.data]);

  return {
    isPending: pins.isPending || (hasPins && projects.isPending),
    items,
  };
}

export function registerProjectsSpaceSections(engenty: EngentyPluginContext) {
  engenty.UI.registerSpaceSection({
    id: "pinned",
    label: "Projects",
    labelKey: "projects:pins.section",
    order: 10,
    slots: ["space.sidebar", "space.home.aside"],
    useItems: usePinnedProjectItems,
  });
}
