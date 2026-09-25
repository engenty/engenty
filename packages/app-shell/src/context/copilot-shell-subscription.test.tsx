/** @vitest-environment happy-dom */
import { render } from "@testing-library/react";
import { memo } from "react";
import { describe, expect, it, vi } from "vitest";
import { COPILOT_LAYOUT_NOOP } from "../types/copilot-shell";
import {
  CopilotPathProvider,
  CopilotShellProvider,
  useCopilotChromeHidden,
  useCopilotLayout,
  useCopilotPathname,
} from "./copilot-shell-context";

vi.mock("../hooks/use-media-query", () => ({
  useMediaQuery: () => false,
}));

describe("copilot shell context split", () => {
  it("does not re-render a layout consumer when only the path changes", () => {
    const layoutRenders = { count: 0 };
    const pathRenders = { count: 0 };

    const LayoutProbe = memo(function LayoutProbe() {
      layoutRenders.count += 1;
      useCopilotLayout();
      return null;
    });

    const PathProbe = memo(function PathProbe() {
      pathRenders.count += 1;
      useCopilotPathname();
      useCopilotChromeHidden();
      return null;
    });

    function Tree({ pathname }: { pathname: string }) {
      return (
        <CopilotShellProvider copilotLayout={COPILOT_LAYOUT_NOOP}>
          <CopilotPathProvider chromeHidden={false} pathname={pathname}>
            <LayoutProbe />
            <PathProbe />
          </CopilotPathProvider>
        </CopilotShellProvider>
      );
    }

    const view = render(<Tree pathname="/s/acme" />);
    const layoutAfterMount = layoutRenders.count;
    const pathAfterMount = pathRenders.count;

    view.rerender(<Tree pathname="/s/matthias" />);

    expect(layoutRenders.count).toBe(layoutAfterMount);
    expect(pathRenders.count).toBe(pathAfterMount + 1);
  });
});
