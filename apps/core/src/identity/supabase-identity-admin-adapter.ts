import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateUserInput,
  IdentityAdminService,
  UpdateUserInput,
} from "./identity-admin-service.js";

export function createSupabaseIdentityAdminAdapter(
  client: SupabaseClient
): IdentityAdminService {
  return {
    async createUser(input: CreateUserInput) {
      const { data, error } = await client.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: input.user_metadata ?? {
          ...(input.display_name ? { full_name: input.display_name } : {}),
        },
        app_metadata: input.app_metadata,
      });
      if (error || !data.user) {
        throw error ?? new Error("Failed to create auth user.");
      }
      return { id: data.user.id };
    },

    async deleteUser(id: string) {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) {
        throw error;
      }
    },

    async updateUser(id: string, input: UpdateUserInput) {
      const updates: Record<string, unknown> = {};
      if (input.email !== undefined) {
        updates.email = input.email;
      }
      if (input.password !== undefined) {
        updates.password = input.password;
      }
      if (input.display_name !== undefined) {
        updates.user_metadata = { full_name: input.display_name };
      }
      if (input.user_metadata !== undefined) {
        updates.user_metadata = {
          ...(updates.user_metadata as Record<string, unknown>),
          ...input.user_metadata,
        };
      }
      if (input.app_metadata !== undefined) {
        updates.app_metadata = input.app_metadata;
      }
      if (Object.keys(updates).length === 0) {
        return;
      }
      const { error } = await client.auth.admin.updateUserById(id, updates);
      if (error) {
        throw error;
      }
    },

    async updateUserPassword(id: string, newPassword: string) {
      const { error } = await client.auth.admin.updateUserById(id, {
        password: newPassword,
      });
      if (error) {
        throw error;
      }
    },

    async getUserById(id: string) {
      const { data, error } = await client.auth.admin.getUserById(id);
      if (error || !data?.user) {
        return null;
      }
      const u = data.user;
      return {
        id: u.id,
        email: u.email ?? "",
        user_metadata: u.user_metadata as Record<string, unknown> | undefined,
      };
    },

    async listUserIdentities(userId: string) {
      const { data, error } = await client.auth.admin.getUserById(userId);
      if (error || !data?.user) {
        return [];
      }
      const identities =
        (
          data.user as {
            identities?: Array<{
              provider?: string;
              identity_data?: Record<string, unknown>;
            }>;
          }
        ).identities ?? [];
      return identities.map((i) => ({
        provider: i.provider ?? "email",
        identity_data: i.identity_data,
      }));
    },
  };
}
