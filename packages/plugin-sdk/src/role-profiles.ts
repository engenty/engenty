/**
 * Role profiles: named, versioned bundles of capability strings. Roles are
 * defined in CODE (core built-ins + module contributions) and ASSIGNED in the
 * DB (to users or agents, always within one tenant). Enforcement points keep
 * seeing plain capability strings — this registry only maps a role id to the
 * capabilities it grants.
 */
export interface RoleProfile {
  /** Capability strings that `evaluatePolicy`/capability matchers understand. */
  capabilities: string[];
  description?: string;
  /** Namespaced like capabilities, e.g. "invoices.clerk", "tenant.member". */
  id: string;
  /**
   * Built-in role; cannot be unassigned from base roles or deleted per tenant.
   * Only system profiles may carry wildcard capabilities.
   */
  system?: boolean;
  title: string;
}

/**
 * Process-wide registry of role profiles contributed by core and by plugins.
 * Keyed by role id; a second plugin registering the same id throws (ids are a
 * shared namespace, first writer wins). Removal is per-plugin so a plugin
 * unload cleanly drops its profiles.
 */
export class RoleProfileRegistry {
  private readonly profiles = new Map<
    string,
    { profile: RoleProfile; pluginId: string }
  >();

  register(pluginId: string, profile: RoleProfile): void {
    const existing = this.profiles.get(profile.id);
    if (existing && existing.pluginId !== pluginId) {
      throw new Error(
        `role profile "${profile.id}" already registered by ${existing.pluginId}`
      );
    }
    this.profiles.set(profile.id, { profile, pluginId });
  }

  get(id: string): RoleProfile | undefined {
    return this.profiles.get(id)?.profile;
  }

  /** Owning plugin id for a role profile (undefined if not registered). */
  pluginIdFor(id: string): string | undefined {
    return this.profiles.get(id)?.pluginId;
  }

  list(): RoleProfile[] {
    return [...this.profiles.values()].map((entry) => entry.profile);
  }

  /** List profiles with their owning plugin id (for admin/diagnostics). */
  listWithSource(): Array<{ profile: RoleProfile; pluginId: string }> {
    return [...this.profiles.values()];
  }

  removeByPlugin(pluginId: string): void {
    for (const [id, entry] of this.profiles) {
      if (entry.pluginId === pluginId) {
        this.profiles.delete(id);
      }
    }
  }
}
