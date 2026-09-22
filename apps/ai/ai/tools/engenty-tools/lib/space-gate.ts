/**
 * "Is this operation in the run's space?" (PLAN-spaces.md Phase C3a + C3b).
 *
 * **Why the gate is here and not on the agent's tool list.** The plan's sketch
 * put this on `assembleDynamicAgent`'s `allowedToolIds` — which is right for an
 * agent that carries module tools directly, and does nothing at all for the
 * copilot: its `toolIds` are the six catalog meta-tools, and every module
 * operation it ever runs arrives through `engenty_tool_execute` by id. Narrowing
 * a list that does not contain module tools would have looked like enforcement
 * and enforced nothing, so the check lives on the call itself.
 *
 * Core remains authoritative — it re-checks capabilities on every invoke. This
 * gate exists because "the copilot in Marketing offered to list Company's
 * offers and only failed at the HTTP boundary" is a broken product even when it
 * is a safe one, and because the model needs a reason it can act on rather than
 * a 403 it will retry.
 *
 * Platform tools (no `moduleId`, or `core`) are never gated: memory, artifacts,
 * the catalog itself and the workspace are the agent's own faculties, not a
 * module a space mounts.
 *
 * C3b adds CONNECTORS, which are mounted one provider-account at a time while
 * their operations live in a shared module — so they are checked before the
 * module and instead of it. Delegation (the other C3b narrowing) is enforced
 * where the delegation tools are built, not here: a child run is a principal,
 * and the only safe answer for an unmounted engenty is that its tool never
 * exists.
 */

/** The subset of {@link EngentyToolsRunContext.space} this gate reads. */
export interface SpaceGateSurface {
  /**
   * Agent type keys mounted in this Space. Optional only for older/manual
   * carriers; a resolved run built by `toolsSpaceFromResolution` always sets it.
   * Consumers must treat a missing set on a resolved Space as empty, never as
   * tenant-global.
   */
  agentIds?: ReadonlySet<string>;
  /** Tool prefixes of EVERY connector — how a connector op is recognised. */
  allConnectorPrefixes: ReadonlySet<string>;
  /**
   * Whose browser this run may reach for, and whether unattended
   * (PLAN-user-browser.md §2.2). The acting person: the chat user, or the
   * routine's author for a fire. Null when the run acts for nobody — no
   * browser, no `browser_*` tools.
   */
  browser?: { unattended: boolean; userId: string } | null;
  /** Tool prefixes of the connectors this space mounts. */
  connectorPrefixes: ReadonlySet<string>;
  moduleIds: ReadonlySet<string>;
  readOnlyModuleIds: ReadonlySet<string>;
  spaceId: string;
  /** Hired engenties that report to nobody here — they carry the hiring set. */
  topLevelAgentIds?: ReadonlySet<string>;
}

export interface SpaceGateResult {
  error:
    | "connector_not_in_space"
    | "module_not_in_space"
    | "space_context_unresolved"
    | "space_read_only";
  message: string;
  ok: false;
}

/**
 * A run that claimed a Space but could not resolve its surface.
 *
 * Distinct from a missing `space` (intentional tenant-global). Unresolved is a
 * refusal for module/connector work, never an invitation to widen.
 */
export interface UnresolvedSpaceGate {
  claimed_space_id: string;
  kind: "unresolved";
  reason: "forbidden" | "not_found" | "unavailable";
  /**
   * Never present. Existing `.spaceId` readers must see unresolved as "no
   * resolved Space", not as a claim they can forward to core.
   */
  spaceId?: undefined;
}

export type SpaceGateContext =
  | SpaceGateSurface
  | UnresolvedSpaceGate
  | GlobalConnectorGate;

/**
 * Copilot (or any agent) outside a space: modules stay tenant-global, but
 * connectors are only the agent's grants plus all-spaces accounts (intersected
 * with a non-empty preferred plugin list). Distinct from a missing `space`
 * (legacy "allow every connector") so live chat and assemble can agree.
 */
export interface GlobalConnectorGate {
  /**
   * Never present. Existing `.spaceId` / mount-set readers must see global as
   * "no resolved Space".
   */
  agentIds?: undefined;
  allConnectorPrefixes: ReadonlySet<string>;
  connectorPrefixes: ReadonlySet<string>;
  kind: "global";
  moduleIds?: undefined;
  readOnlyModuleIds?: undefined;
  spaceId?: undefined;
  topLevelAgentIds?: undefined;
}

export function isGlobalConnectorGate(
  space: SpaceGateContext | null | undefined
): space is GlobalConnectorGate {
  return space != null && "kind" in space && space.kind === "global";
}

export function isUnresolvedSpaceGate(
  space: SpaceGateContext | null | undefined
): space is UnresolvedSpaceGate {
  return space != null && "kind" in space && space.kind === "unresolved";
}

/**
 * The connector an operation belongs to, by tool prefix, or null.
 *
 * Prefix matching, because that is how the ids are minted:
 * `connectorOperationId` is `${toolPrefix}_${workflowId}`. Longest match wins so
 * a connector whose prefix is a prefix of another's (`g` vs `gmail`) cannot
 * swallow it — a rule that costs one sort and removes a whole class of
 * silent mis-attribution.
 */
function connectorPrefixFor(
  operationId: string,
  prefixes: ReadonlySet<string>
): string | null {
  let best: string | null = null;
  for (const prefix of prefixes) {
    if (
      operationId.startsWith(`${prefix}_`) &&
      (!best || prefix.length > best.length)
    ) {
      best = prefix;
    }
  }
  return best;
}

function checkConnectorAgainstPrefixes(
  operationId: string,
  space: Pick<SpaceGateSurface, "allConnectorPrefixes" | "connectorPrefixes">
): SpaceGateResult | null {
  const connectorPrefix = connectorPrefixFor(
    operationId,
    space.allConnectorPrefixes
  );
  if (!connectorPrefix) {
    return null;
  }
  if (space.connectorPrefixes.has(connectorPrefix)) {
    return null;
  }
  return {
    error: "connector_not_in_space",
    message:
      `The ${connectorPrefix} connection is not available here, so ${operationId} cannot run. ` +
      "It is not part of this agent's enabled plugins or this space. " +
      "Do not retry it. If you carry `space_setup`, offer to add it (`action='add'`, accounts: [{ id, access }]) — the user may add an account they own themselves; otherwise say an admin can add it in the space's setup.",
    ok: false,
  };
}

/** Modules that are not module mounts — see the note on platform tools above. */
function isPlatformModule(moduleId: string | undefined): boolean {
  return !moduleId || moduleId === "core" || moduleId === "engenty-core";
}

/** The connections module and its per-provider siblings (`connections-google`). */
function isConnectionsModule(moduleId: string): boolean {
  return moduleId === "connections" || moduleId.startsWith("connections-");
}

/**
 * Whether the catalog should SHOW this module's tools in the run's space.
 *
 * Discovery is filtered as well as execution, and the two are deliberately not
 * the same strength: this hides what the space does not mount, while
 * {@link checkOperationAgainstSpace} refuses it. Hiding alone would be
 * decoration — a model that already knows an operation id from its own history
 * can call it without ever asking the catalog. Refusing alone would be
 * correct and awful: the copilot would spend a turn proposing Company's offers
 * tools inside Marketing and only discover the answer by being told no.
 *
 * A read-only mount stays VISIBLE — reading is exactly what it grants.
 */
export function isModuleVisibleInSpace(
  moduleId: string | undefined,
  space?: SpaceGateContext | null
): boolean {
  if (isUnresolvedSpaceGate(space)) {
    return isPlatformModule(moduleId);
  }
  if (isGlobalConnectorGate(space) || !space || isPlatformModule(moduleId)) {
    return true;
  }
  return space.moduleIds.has(moduleId as string);
}

/**
 * Whether a single tool CONTRACT should appear in catalog results.
 *
 * Delegates to {@link checkOperationAgainstSpace} rather than re-deriving the
 * rule, so what discovery shows and what execution allows cannot drift — the
 * failure mode that would produce is a model confidently calling something the
 * catalog just offered it. `readOnly: true` is passed because a read-only
 * mount stays visible; the write refusal happens at execution, where the
 * operation's own contract is known.
 */
export function isToolVisibleInSpace(
  entry: { moduleId?: string; operationId: string },
  space?: SpaceGateContext | null
): boolean {
  return (
    checkOperationAgainstSpace({
      operationId: entry.operationId,
      readOnly: true,
      space,
      ...(entry.moduleId ? { moduleId: entry.moduleId } : {}),
    }) === null
  );
}

/**
 * The line a catalog result carries when a space narrowed it, or null outside
 * any space.
 *
 * Filtering silently is worse than not filtering. Observed on the first live
 * run: asked for offers in a space that does not mount them, the copilot
 * searched, got only the mounted module back, and told the user "the offers
 * module has no read tool registered" — a confident, wrong diagnosis it had no
 * way to avoid, because nothing in the result said anything had been removed.
 * A model that is told WHY the list is short reports the real reason.
 */
export function spaceScopeNote(space?: SpaceGateContext | null): string | null {
  if (isUnresolvedSpaceGate(space)) {
    return (
      "Space context could not be resolved for this run, so module and connector " +
      "results are withheld. Do not perform module work; report that the space is " +
      "unavailable. Platform tools and open-ended chat remain usable."
    );
  }
  if (isGlobalConnectorGate(space)) {
    return (
      "This run is not in a space. Connector tools are limited to accounts enabled " +
      "on this agent and accounts shared with every space. Apps are otherwise unrestricted."
    );
  }
  if (!space) {
    return null;
  }
  return (
    "These results are limited to the apps mounted in the space this chat is in" +
    (space.moduleIds.size > 0
      ? ` (${[...space.moduleIds].sort().join(", ")}). `
      : ". ") +
    "Anything outside that list is not missing from Engenty — it is not part of this space. " +
    "Say that, rather than concluding the app has no tools."
  );
}

/**
 * Refuse an operation the run's space does not carry, or a write into a space
 * that mounted its module read-only. Returns null when the call may proceed.
 *
 * The messages name the space and tell the model what to do instead, because a
 * bare refusal is the input most likely to produce a retry loop: "not
 * available" reads as transient, "this space does not have that module" reads
 * as a fact about the world.
 */
export function checkOperationAgainstSpace(input: {
  moduleId?: string;
  operationId: string;
  readOnly: boolean;
  space?: SpaceGateContext | null;
}): SpaceGateResult | null {
  const space = input.space;
  if (isUnresolvedSpaceGate(space)) {
    if (isPlatformModule(input.moduleId)) {
      return null;
    }
    return {
      error: "space_context_unresolved",
      message:
        `This run claimed a Space (${space.reason}) but could not resolve it, so ${input.operationId} cannot run. ` +
        "Module and connector tools are refused until the Space is available. " +
        "This is not a missing app and not a transient catalog miss — do not retry the module call. " +
        "Tell the user the Space context is unresolved. Platform tools and open-ended chat still work.",
      ok: false,
    };
  }
  if (isGlobalConnectorGate(space)) {
    return checkConnectorAgainstPrefixes(input.operationId, space);
  }
  if (!space) {
    return null;
  }
  // Connectors are checked BEFORE the module, and instead of it: every
  // connector operation belongs to a connections-* module, so the module check
  // alone would either allow the whole provider (all of Google because Gmail
  // is mounted) or refuse a mounted connector because its module was not
  // separately mounted. The per-connector mount is the finer-grained truth.
  const connectorRefusal = checkConnectorAgainstPrefixes(
    input.operationId,
    space
  );
  if (
    connectorRefusal ||
    connectorPrefixFor(input.operationId, space.allConnectorPrefixes)
  ) {
    return connectorRefusal;
  }
  if (isPlatformModule(input.moduleId)) {
    return null;
  }
  const moduleId = input.moduleId as string;
  // The connections module's OWN operations (the catalog, the account list)
  // are the plumbing for using a connector, not a connector. A space that
  // mounts Gmail but not the connections module would otherwise be able to
  // call Gmail and unable to ask which account to call it with.
  if (isConnectionsModule(moduleId) && space.connectorPrefixes.size > 0) {
    return null;
  }
  if (!space.moduleIds.has(moduleId)) {
    return {
      error: "module_not_in_space",
      message:
        `The ${moduleId} app is not available in this space, so ${input.operationId} cannot run here. ` +
        "This is a property of the space, not a temporary failure — do not retry it. " +
        "Tell the user the app is not part of this space. If they want it here and you carry `space_setup`, offer to add it (`action='add'`, modules: [{ id, access }]) — one call adds the app and any account it needs; otherwise say an admin can add it in the space's setup.",
      ok: false,
    };
  }
  if (!input.readOnly && space.readOnlyModuleIds.has(moduleId)) {
    return {
      error: "space_read_only",
      message:
        `This space mounts ${moduleId} read-only, so ${input.operationId} cannot change its data here. ` +
        "Reading it is fine. Do not retry the write; report that this space grants read-only access to that app.",
      ok: false,
    };
  }
  return null;
}
