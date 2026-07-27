/**
 * Core users DAL - facade for backward compatibility.
 * Implementation lives in dal/core-users/ (types, auth, crud, setup, workspace, memberships).
 */
export {
  type CoreUser,
  type CoreUsersDal,
  createCoreUsersDal,
  type GlobalRole,
  type InviteUserInput,
  type TenantRole,
  type WorkspaceContextResult,
} from "./core-users/index.js";
