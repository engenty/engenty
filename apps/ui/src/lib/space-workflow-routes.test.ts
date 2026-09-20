import { matchPath } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  SPACE_WORKFLOW_ROUTE_PATTERN,
  SPACE_WORKFLOW_RUN_ROUTE_PATTERN,
} from "./space-routes";

/** The patterns as they sit under `/s/:spaceKey` in AuthenticatedRoutes. */
const PAGE_ZERO = `/s/:spaceKey/${SPACE_WORKFLOW_ROUTE_PATTERN}`;
const RUN = `/s/:spaceKey/${SPACE_WORKFLOW_RUN_ROUTE_PATTERN}`;

describe("space workflow routes", () => {
  it("resolves page 0 for a stored uuid and for a module id", () => {
    expect(
      matchPath(
        PAGE_ZERO,
        "/s/company/workflows/6f1d2c3e-0000-4000-8000-000000000001"
      )?.params
    ).toEqual({
      spaceKey: "company",
      workflowId: "6f1d2c3e-0000-4000-8000-000000000001",
    });
    expect(
      matchPath(PAGE_ZERO, "/s/company/workflows/offers.create")?.params
    ).toEqual({ spaceKey: "company", workflowId: "offers.create" });
  });

  it("resolves a run by its run id", () => {
    expect(
      matchPath(RUN, "/s/company/workflows/offers.create/runs/run-7")?.params
    ).toEqual({
      runId: "run-7",
      spaceKey: "company",
      workflowId: "offers.create",
    });
  });

  it("keeps page 0 and the run page apart", () => {
    expect(
      matchPath(PAGE_ZERO, "/s/company/workflows/offers.create/runs/run-7")
    ).toBeNull();
    expect(matchPath(RUN, "/s/company/workflows/offers.create")).toBeNull();
  });
});
