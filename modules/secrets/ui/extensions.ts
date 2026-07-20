/**
 * Phase 2 — contributed tabs into host detail surfaces.
 *
 * BLOCKED ON PLAN R1: the `UiTabContribution` registry (PLAN-tab-contributions.md)
 * is not built yet, lives in the PUBLIC repo (engenty/engenty), and its first
 * surface is `projects.detail` only — there is no `contacts.detail` surface.
 *
 * Once that lands, register here:
 *   engenty.UI.registerTab({
 *     id: "secrets",
 *     surface: "contacts.detail",          // client/org-contact detail
 *     labelKey: "secrets:tab.client_secrets",
 *     component: ClientSecretsTab,          // ./components/client-secrets-tab
 *   });
 *   engenty.UI.registerTab({
 *     id: "secrets",
 *     surface: "projects.detail",
 *     labelKey: "secrets:tab.project_secrets",
 *     component: ProjectSecretsTab,
 *   });
 *
 * Interim fallback (plan §9-R1 option c): a deep-link button on the contact page
 * to `/mdl/secrets?owner_scope=client&owner_id=<contactId>` instead of an
 * embedded tab.
 */
export {};
