/**
 * Platform role bindings for tests. Resolvers read a process snapshot and throw
 * when a role is unbound, so a test that resolves a model binds every role to a
 * recognisable `test/<role>` id for its duration.
 */
import {
  AI_PLATFORM_ROLES,
  bindingsFromList,
  setPlatformBindings,
} from "@engenty/ai-core";
import { afterEach, beforeEach } from "vitest";

export function testModelId(role: string): string {
  return `test/${role}`;
}

export function bindTestModels(): void {
  setPlatformBindings(
    bindingsFromList(
      AI_PLATFORM_ROLES.map(({ role }) => ({
        gateway: "vercel",
        modelId: testModelId(role),
        role,
      }))
    )
  );
}

/** Bind every role before each test of the calling suite; unbind after. */
export function bindTestModelsPerTest(): void {
  beforeEach(bindTestModels);
  afterEach(() => setPlatformBindings(undefined));
}
