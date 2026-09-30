import { describe, expect, it } from "vitest";
import { viewPathMatches } from "./view-pane-routes.js";

const Page = () => null;
const routes = [
  { component: Page, path: "/mdl/contacts/import" },
  { component: Page, path: "/mdl/knowledge-base/:id" },
];

describe("viewPathMatches", () => {
  it("matches a Space mirror with a query string", () => {
    expect(
      viewPathMatches("/s/engrd/contacts/import?file=a&name=b.csv", routes)
    ).toBe(true);
  });
  it("matches the canonical path", () => {
    expect(viewPathMatches("/mdl/contacts/import", routes)).toBe(true);
  });
  it("uses the module's URL alias in the Space mirror", () => {
    expect(viewPathMatches("/s/engrd/kb/123", routes)).toBe(true);
  });
  it("rejects a page no module registers", () => {
    expect(viewPathMatches("/s/engrd/contacts/nope", routes)).toBe(false);
  });
});
