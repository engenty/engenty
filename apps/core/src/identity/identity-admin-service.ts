/**
 * Identity admin service contract. Isolates auth.admin lifecycle operations.
 *
 * @see docs/dev/backend-abstraction.md
 */
export interface CreateUserInput {
  app_metadata?: Record<string, unknown>;
  display_name?: string;
  email: string;
  password?: string;
  user_metadata?: Record<string, unknown>;
}

export interface UpdateUserInput {
  app_metadata?: Record<string, unknown>;
  display_name?: string;
  email?: string;
  password?: string;
  user_metadata?: Record<string, unknown>;
}

export interface AuthUser {
  email: string;
  id: string;
  user_metadata?: Record<string, unknown>;
}

export interface IdentityProvider {
  identity_data?: Record<string, unknown>;
  provider: string;
}

export interface IdentityAdminService {
  createUser(input: CreateUserInput): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
  getUserById(id: string): Promise<AuthUser | null>;
  listUserIdentities(userId: string): Promise<IdentityProvider[]>;
  updateUser(id: string, input: UpdateUserInput): Promise<void>;
  updateUserPassword(id: string, newPassword: string): Promise<void>;
}
