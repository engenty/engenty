/**
 * @vitest-environment happy-dom
 */

import {
  PageHeaderProvider,
  usePageConfig,
  usePageHeader,
} from "@engenty/ui-plugin-sdk";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ObjectPaneBody } from "./object-pane-body.js";
import {
  clearObjectWidgetsForTests,
  registerObjectWidget,
} from "./object-widget-registry.js";

const REF = { entity: "offer", id: "offer-1", module: "offers" };

/** A module page: it announces breadcrumbs and topbar actions like any other. */
function PanelPage() {
  usePageConfig({
    actions: <button type="button">Speichern</button>,
    breadcrumbs: [{ label: "Angebote" }],
  });
  return <p>offer body</p>;
}

function HostBreadcrumbs() {
  const { breadcrumbs } = usePageHeader();
  return <span data-testid="host-crumbs">{breadcrumbs.length}</span>;
}

afterEach(() => {
  clearObjectWidgetsForTests();
  vi.restoreAllMocks();
});

it("keeps an embedded page's actions in the pane and its breadcrumbs out of the host", async () => {
  registerObjectWidget({
    card: () => null,
    entity: "offer",
    id: "offers.offer",
    module: "offers",
    panel: PanelPage,
  });

  render(
    <MemoryRouter>
      <PageHeaderProvider>
        <HostBreadcrumbs />
        <ObjectPaneBody objectRef={REF} />
      </PageHeaderProvider>
    </MemoryRouter>
  );

  expect(await screen.findByText("offer body")).toBeTruthy();
  expect(screen.getByText("Speichern")).toBeTruthy();
  expect(screen.getByTestId("host-crumbs").textContent).toBe("0");
});
