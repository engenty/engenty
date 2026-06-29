import { describe, expect, it } from "vitest";
import { partitionCatalogByCoreModule } from "./workspace-catalog-partition";

describe("partitionCatalogByCoreModule", () => {
  it("keeps core module items at root and groups the rest by module_id", () => {
    const { folders, root } = partitionCatalogByCoreModule([
      { id: "m1", module_id: "contacts", name: "B" },
      { id: "c1", module_id: "engenty", name: "Copilot" },
      { id: "m2", module_id: "contacts", name: "A" },
      { id: "d1", module_id: "dashboard", name: "Widget" },
    ]);

    expect(root.map((r) => r.id)).toEqual(["c1", "d1"]);
    expect(folders).toHaveLength(1);
    expect(folders[0]?.moduleId).toBe("contacts");
    expect(folders[0]?.items.map((i) => i.id)).toEqual(["m2", "m1"]);
  });
});
