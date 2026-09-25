/** @vitest-environment happy-dom */
import {
  useWorkspaceSpace,
  useWorkspaceTenant,
  WorkspaceProvider,
} from "@engenty/ui-plugin-sdk";
import { render } from "@testing-library/react";
import { memo } from "react";
import { describe, expect, it } from "vitest";

const tenantA = { id: "t1", name: "Acme", slug: "acme" };
const spaceA = { id: "s1", key: "acme", name: "Acme" };
const spaceB = { id: "s2", key: "matthias", name: "Matthias" };

describe("workspace context split", () => {
  it("does not re-render a tenant-only consumer when the space changes", () => {
    const tenantRenders = { count: 0 };
    const spaceRenders = { count: 0 };

    const TenantProbe = memo(function TenantProbe() {
      tenantRenders.count += 1;
      useWorkspaceTenant();
      return null;
    });

    const SpaceProbe = memo(function SpaceProbe() {
      spaceRenders.count += 1;
      useWorkspaceSpace();
      return null;
    });

    function Tree({ space }: { space: typeof spaceA }) {
      return (
        <WorkspaceProvider
          currentSpace={space}
          currentTenant={tenantA}
          currentUserId="u1"
          isTenantAdmin
        >
          <TenantProbe />
          <SpaceProbe />
        </WorkspaceProvider>
      );
    }

    const view = render(<Tree space={spaceA} />);
    expect(tenantRenders.count).toBe(1);
    expect(spaceRenders.count).toBe(1);

    view.rerender(<Tree space={spaceB} />);

    expect(tenantRenders.count).toBe(1);
    expect(spaceRenders.count).toBe(2);
  });
});
