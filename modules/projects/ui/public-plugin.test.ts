import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { projectsPublicUiPlugin } from "./public-plugin";

describe("projectsPublicUiPlugin", () => {
  it("registers portal routes and the projects namespace as public contributions", () => {
    const registerNamespace = vi.fn();
    const registerRoute = vi.fn();

    projectsPublicUiPlugin({
      UI: {
        registerRoute,
      },
      i18n: {
        registerNamespace,
      },
      plugins: {
        expose: vi.fn(),
      },
    } as unknown as EngentyPluginContext);

    expect(registerNamespace).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "projects",
        pluginId: "projects",
      })
    );
    expect(registerRoute).toHaveBeenCalledTimes(3);
    expect(registerRoute.mock.calls.map(([route]) => route.path)).toEqual([
      "/portal/:projectId",
      "/portal/:projectId/tasks/new",
      "/portal/:projectId/tasks/:taskId",
    ]);
    expect(registerRoute.mock.calls.map(([route]) => route.scope)).toEqual([
      "public",
      "public",
      "public",
    ]);
  });
});
