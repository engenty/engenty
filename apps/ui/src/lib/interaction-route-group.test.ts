import { describe, expect, it } from "vitest";
import {
  deviceClassFromWidth,
  looksLikeUserContent,
  routeGroupFromPath,
} from "./interaction-route-group";

describe("routeGroupFromPath", () => {
  it("strips space keys, UUIDs, and numeric ids", () => {
    expect(routeGroupFromPath("/s/company/projects/abc")).toBe(
      "/s/:space/projects/abc"
    );
    expect(
      routeGroupFromPath(
        "/mdl/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6?q=secret"
      )
    ).toBe("/mdl/tasks/:id");
    expect(routeGroupFromPath("/mdl/contacts/42")).toBe("/mdl/contacts/:id");
  });

  it("does not keep query strings or user content", () => {
    expect(routeGroupFromPath("/search?q=matthias@example.com")).toBe(
      "/search"
    );
    expect(looksLikeUserContent("/s/:space")).toBe(false);
    expect(looksLikeUserContent("user@host")).toBe(true);
  });
});

describe("deviceClassFromWidth", () => {
  it("maps viewport width to a coarse class", () => {
    expect(deviceClassFromWidth(390)).toBe("phone");
    expect(deviceClassFromWidth(800)).toBe("tablet");
    expect(deviceClassFromWidth(1440)).toBe("desktop");
  });
});
