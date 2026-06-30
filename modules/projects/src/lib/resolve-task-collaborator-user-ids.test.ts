import { describe, expect, it, vi } from "vitest";
import { resolveTaskCollaboratorUserIds } from "./resolve-task-collaborator-user-ids.js";

function makeSupabase(
  profiles: { id: string; user_id: string | null }[],
  userIds: string[]
) {
  const profilesTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: profiles, error: null })),
      })),
    })),
  };
  const usersTable = {
    select: vi.fn(() => ({
      in: vi.fn(async () => ({
        data: userIds.map((id) => ({ id })),
        error: null,
      })),
    })),
  };
  return {
    schema: vi.fn((name: string) => ({
      from: vi.fn((table: string) => {
        if (name === "module_team" && table === "profiles") {
          return profilesTable;
        }
        if (name === "core" && table === "users") {
          return usersTable;
        }
        throw new Error(`unexpected table ${name}.${table}`);
      }),
    })),
  };
}

describe("resolveTaskCollaboratorUserIds", () => {
  it("maps team-member profile ids to linked auth user ids", async () => {
    const supabase = makeSupabase(
      [{ id: "profile-lukas", user_id: "auth-lukas" }],
      ["auth-lukas"]
    );
    await expect(
      resolveTaskCollaboratorUserIds(supabase as never, "tenant-1", "scope-1", [
        "profile-lukas",
      ])
    ).resolves.toEqual(["auth-lukas"]);
  });

  it("passes through auth user ids", async () => {
    const supabase = makeSupabase(
      [{ id: "profile-lukas", user_id: "auth-lukas" }],
      ["auth-lukas"]
    );
    await expect(
      resolveTaskCollaboratorUserIds(supabase as never, "tenant-1", "scope-1", [
        "auth-lukas",
      ])
    ).resolves.toEqual(["auth-lukas"]);
  });

  it("rejects team members without a linked login", async () => {
    const supabase = makeSupabase([{ id: "profile-ext", user_id: null }], []);
    await expect(
      resolveTaskCollaboratorUserIds(supabase as never, "tenant-1", "scope-1", [
        "profile-ext",
      ])
    ).rejects.toThrow("task_collaborator_requires_linked_user");
  });
});
