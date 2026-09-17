export { AuthRedirect } from "./components/auth-redirect";
export {
  getApiBaseUrl,
  getCurrentAccessToken,
  getCurrentUserId,
} from "./lib/api-client";
export { useCoreAuthSession } from "./lib/auth-session";
export {
  clearImpersonationState,
  getImpersonationState,
  IMPERSONATION_STORAGE_KEY,
  type ImpersonationState,
  type ImpersonationUserLabel,
  isImpersonating,
  signOutClearingImpersonation,
  startImpersonation,
  stopImpersonation,
} from "./lib/impersonation";
export {
  ensureCurrentWorkspaceUser,
  initializeWorkspaceAdmin,
  isInitialSetupRequired,
} from "./lib/initial-setup";
export {
  EngentyServiceAvailabilityError,
  evaluateInitialSetupGate,
  gateFailureToNavigationState,
  type InitialSetupGateFailure,
  type InitialSetupGateReady,
  type InitialSetupGateResult,
  isEngentyServiceAvailabilityError,
  type ServiceUnavailableNavigationState,
} from "./lib/initial-setup-gate";
export {
  getOptionalSupabaseAuthClient,
  getSupabaseAuthClient,
} from "./lib/supabase-auth-client";
export {
  claimsMatchWorkspaceTenant,
  readSupabaseAccessTokenClaims,
  refreshSupabaseAuthSession,
  type SupabaseAccessTokenClaims,
} from "./lib/supabase-session-claims";
export { AgentLoginPage } from "./routes/agent-login-page";
export { CallbackPage } from "./routes/callback-page";
export { DevLoginPage } from "./routes/dev-login-page";
export { InitialSetupPage } from "./routes/initial-setup-page";
export { LoginPage } from "./routes/login-page";
export { OAuthConsentPage } from "./routes/oauth-consent-page";
export { ServiceUnavailablePage } from "./routes/service-unavailable-page";
