/**
 * The ONE approval store (D2): `core.approval_requests` + `core.approval_grants`
 * and the policy around them, shared between apps/core and modules.
 *
 * This lived in apps/core, which modules cannot import — so every module that
 * needed durable approvals grew its own store (tasks columns, connections
 * table, goal grants). Moving the client here is what lets those stores fold
 * into this one instead of multiplying.
 */
export {
  type AgentGoalGrantRow,
  grantCapabilityForGoal,
  listGoalGrantCapabilities,
  revokeGoalGrants,
} from "./goal-capability-grants.js";
export {
  type ApprovalDecision,
  type ApprovalRequest,
  createApprovalService,
} from "./service.js";
export {
  type ApprovalGrantRow,
  type ApprovalGrantScope,
  type ApprovalRequestRow,
  type ApprovalRequestStatus,
  consumeApprovalGrant,
  decideApprovalRequest,
  findPendingApprovalRequest,
  getApprovalRequest,
  insertApprovalGrant,
  insertApprovalRequest,
  listApprovalRequestsForModule,
  listGrantOperationIdsForSubjects,
  listGrantsForSubject,
  listPendingApprovalRequests,
  revokeApprovalGrant,
  revokeApprovalGrantsForSubject,
} from "./store.js";
export { createFakeApprovalDb } from "./test-fixtures.js";
