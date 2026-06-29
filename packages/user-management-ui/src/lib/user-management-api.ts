import { requestApiJson } from "@engenty/api-client";
import { getSupabaseAuthClient } from "@engenty/auth-ui";
import type {
  InviteUserInput,
  UpdateUserProfileInput,
  UserRecord,
} from "./schemas.js";

interface CoreUsersResponse {
  users: Array<{
    id: string;
    tenant_id: string;
    email: string;
    display_name: string | null;
    role: "admin" | "member";
    phone: string | null;
    initials: string | null;
  }>;
}

function mapCoreUser(user: CoreUsersResponse["users"][number]): UserRecord {
  return {
    id: user.id,
    display_name: user.display_name ?? "",
    role: user.role,
    email: user.email,
    phone: user.phone,
    initials: user.initials,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return await requestApiJson<T>(path, init);
}

export async function listUsers(): Promise<UserRecord[]> {
  const response = await request<CoreUsersResponse["users"]>("/api/users");
  return response.map(mapCoreUser);
}

export async function getUser(
  userId: string,
  signal?: AbortSignal
): Promise<UserRecord | null> {
  try {
    const response = await request<CoreUsersResponse["users"][number]>(
      `/api/users/${encodeURIComponent(userId)}`,
      { signal }
    );
    return response ? mapCoreUser(response) : null;
  } catch {
    return null;
  }
}

export async function isCurrentUserAdmin() {
  const supabase = getSupabaseAuthClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (!userId) {
    return false;
  }
  const users = await listUsers();
  const current = users.find((entry) => entry.id === userId);
  return current?.role === "admin";
}

export async function inviteUser(input: InviteUserInput) {
  await request<CoreUsersResponse["users"][number]>("/api/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      display_name: input.display_name,
      role: input.role,
      phone: input.phone || null,
    }),
  });
}

export async function updateUserProfile(
  userId: string,
  input: UpdateUserProfileInput
) {
  await request<CoreUsersResponse["users"][number]>(
    `/api/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        display_name: input.display_name,
        initials: input.initials,
        phone: input.phone,
        role: input.role,
      }),
    }
  );
}

/** Admin-only: set another tenant user's password (self-service uses Supabase client). */
export async function updateTenantUserPassword(
  userId: string,
  newPassword: string
) {
  await request<CoreUsersResponse["users"][number]>(
    `/api/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ password: newPassword }),
    }
  );
}

export async function deleteUsers(userIds: string[]) {
  for (const userId of userIds) {
    await request<{ deleted: boolean }>(`/api/users/${userId}`, {
      method: "DELETE",
    });
  }
}
