import { describe, expect, it } from "vitest";
import {
  artifactAncestors,
  artifactsInFolder,
  buildArtifactBreadcrumbs,
} from "./artifact-tree";

const rows = [
  { id: "root-page", title: "Loose page", type: "markdown" },
  { id: "aktien", title: "Aktien", type: "folder" },
  {
    id: "aapl",
    parentId: "aktien",
    title: "Aktienkurse - AAPL",
    type: "table",
  },
  {
    id: "nested",
    parentId: "aktien",
    title: "Q3",
    type: "folder",
  },
  {
    id: "deep",
    parentId: "nested",
    title: "Notes",
    type: "markdown",
  },
];

describe("artifactAncestors", () => {
  it("returns the folder chain root-first", () => {
    expect(artifactAncestors("deep", rows).map((row) => row.title)).toEqual([
      "Aktien",
      "Q3",
    ]);
  });

  it("is empty at the Artifacts root", () => {
    expect(artifactAncestors("aktien", rows)).toEqual([]);
  });

  it("stops on a missing parent instead of inventing a crumb", () => {
    expect(
      artifactAncestors("x", [
        { id: "x", parentId: "gone", title: "Orphan", type: "markdown" },
      ])
    ).toEqual([]);
  });
});

describe("artifactsInFolder", () => {
  it("lists direct children with folders first", () => {
    expect(artifactsInFolder("aktien", rows).map((row) => row.title)).toEqual([
      "Q3",
      "Aktienkurse - AAPL",
    ]);
  });
});

describe("buildArtifactBreadcrumbs", () => {
  it("keeps Artifacts after Data so the shell icon does not eat the section", () => {
    expect(
      buildArtifactBreadcrumbs({
        artifactId: "aktien",
        hrefFor: (id) => `/s/me/data?artifact=${id}`,
        rows,
        rootHref: "/s/me/data",
        rootLabel: "Data",
        sectionHref: "/s/me/data",
        sectionLabel: "Artifacts",
        title: "Aktien",
      })
    ).toEqual([
      { label: "Data", to: "/s/me/data" },
      { compactKept: true, label: "Artifacts", to: "/s/me/data" },
      { label: "Aktien" },
    ]);
  });

  it("prefixes Data then Artifacts and links every ancestor", () => {
    expect(
      buildArtifactBreadcrumbs({
        artifactId: "deep",
        hrefFor: (id) => `/s/me/data?artifact=${id}`,
        rows,
        rootHref: "/s/me/data",
        rootLabel: "Data",
        sectionHref: "/s/me/data",
        sectionLabel: "Artifacts",
        title: "Notes",
      })
    ).toEqual([
      { label: "Data", to: "/s/me/data" },
      { compactKept: true, label: "Artifacts", to: "/s/me/data" },
      { label: "Aktien", to: "/s/me/data?artifact=aktien" },
      { label: "Q3", to: "/s/me/data?artifact=nested" },
      { label: "Notes" },
    ]);
  });
});
