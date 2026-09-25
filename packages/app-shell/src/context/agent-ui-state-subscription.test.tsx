/** @vitest-environment happy-dom */
import { render, waitFor } from "@testing-library/react";
import { memo } from "react";
import { describe, expect, it } from "vitest";
import {
  AgentUiStateProvider,
  useAgentUiFrontendTools,
  useAgentUiStateSnapshot,
  useAgentUiStateSnapshotGetter,
  useRegisterAgentUiSlice,
} from "./agent-ui-state-context";
import type { AgentUiStateSlice } from "./agent-ui-state-slices";

const base = {
  route: {
    module_id: "engenty-copilot",
    pathname: "/",
    route_key: "chat",
  },
  shell: {
    copilot_open: false,
    dock_mode: "sidebar",
  },
};

describe("agent UI context split", () => {
  it("does not re-render tools or snapshot-getter consumers when a page slice changes", async () => {
    const getterRenders = { count: 0 };
    const toolsRenders = { count: 0 };
    const snapshotRenders = { count: 0 };

    const GetterProbe = memo(function GetterProbe() {
      getterRenders.count += 1;
      useAgentUiStateSnapshotGetter();
      return null;
    });

    const ToolsProbe = memo(function ToolsProbe() {
      toolsRenders.count += 1;
      useAgentUiFrontendTools();
      return null;
    });

    const SnapshotProbe = memo(function SnapshotProbe() {
      snapshotRenders.count += 1;
      useAgentUiStateSnapshot();
      return null;
    });

    function SliceWriter({ slice }: { slice: AgentUiStateSlice | null }) {
      useRegisterAgentUiSlice("page", slice);
      return null;
    }

    function Tree({ slice }: { slice: AgentUiStateSlice | null }) {
      return (
        <AgentUiStateProvider base={base}>
          <GetterProbe />
          <ToolsProbe />
          <SnapshotProbe />
          <SliceWriter slice={slice} />
        </AgentUiStateProvider>
      );
    }

    const view = render(<Tree slice={null} />);
    const getterAfterMount = getterRenders.count;
    const toolsAfterMount = toolsRenders.count;
    const snapshotAfterMount = snapshotRenders.count;

    view.rerender(<Tree slice={{ page: { title: "Matthias" } }} />);

    await waitFor(() => {
      expect(snapshotRenders.count).toBeGreaterThan(snapshotAfterMount);
    });
    expect(getterRenders.count).toBe(getterAfterMount);
    expect(toolsRenders.count).toBe(toolsAfterMount);
  });
});
