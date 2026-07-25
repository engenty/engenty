import { afterEach, describe, expect, it } from "vitest";
import { makeMockApi } from "./api/test-helpers.js";
import registerEngentyAppsPlugin from "./plugin.js";

/**
 * The kill switch has to actually stop things. A flag that is only read by a
 * settings page is not a kill switch, and this repo's feature flags are
 * UI-visibility only — no module reads one in an operation handler and
 * PluginServerApi has no request-time resolver. So the deployment switch is
 * env-level and it works by not registering the surface at all.
 */

const previous = process.env.ENGENTY_APPS_ENABLED;

afterEach(() => {
  if (previous === undefined) {
    process.env.ENGENTY_APPS_ENABLED = undefined;
  } else {
    process.env.ENGENTY_APPS_ENABLED = previous;
  }
});

function runPlugin() {
  const { api, httpRoutes, serverOperations } = makeMockApi();
  registerEngentyAppsPlugin({
    events: { modules: { emit: () => {}, on: () => {} } },
    server: {
      ...(api as unknown as Record<string, unknown>),
      getDatabaseAdapter: () => ({}),
    },
  } as never);
  return { httpRoutes, serverOperations };
}

describe("engenty-apps plugin", () => {
  it("registers its operations when enabled", () => {
    process.env.ENGENTY_APPS_ENABLED = "true";
    const { serverOperations } = runPlugin();
    expect(serverOperations.length).toBeGreaterThan(0);
  });

  it("registers nothing when the deployment kill switch is off", () => {
    process.env.ENGENTY_APPS_ENABLED = "false";
    const { httpRoutes, serverOperations } = runPlugin();
    expect(serverOperations).toHaveLength(0);
    expect(httpRoutes).toHaveLength(0);
  });

  it("treats the switch as opt-out, not opt-in", () => {
    // Unset must NOT disable the module: licensing already gates who gets it,
    // and a silently-inert module is the worst of both worlds.
    process.env.ENGENTY_APPS_ENABLED = undefined;
    const { serverOperations } = runPlugin();
    expect(serverOperations.length).toBeGreaterThan(0);
  });
});
