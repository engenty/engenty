export {
  type CreateFakeSupabaseOptions,
  createFakeSupabase,
  type FakeCall,
  type FakeQueryBuilder,
  type FakeQueryError,
  type FakeQueryResult,
  type FakeRpcHandler,
  type FakeSupabase,
} from "./fake-supabase.js";
export {
  makeAuth,
  TEST_SCOPE_ID,
  TEST_TENANT_ID,
  TEST_USER_ID,
} from "./identity.js";
export { makeMockApi } from "./mock-plugin-api.js";
