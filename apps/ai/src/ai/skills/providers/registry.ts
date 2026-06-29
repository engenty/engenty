// In-process registry of available skill-registry providers. Defaults to a
// single skills.sh provider; additional providers can be registered at startup.

import { createSkillsShProvider } from "./skills-sh-provider.js";
import type { SkillRegistryProvider } from "./types.js";

export interface SkillRegistryProviderDescriptor {
  id: string;
  label: string;
}

export class SkillRegistryProviderRegistry {
  private readonly providers = new Map<string, SkillRegistryProvider>();

  register(provider: SkillRegistryProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): SkillRegistryProvider | undefined {
    return this.providers.get(id);
  }

  list(): SkillRegistryProviderDescriptor[] {
    return [...this.providers.values()].map((provider) => ({
      id: provider.id,
      label: provider.label,
    }));
  }
}

export function createDefaultSkillRegistryProviderRegistry(): SkillRegistryProviderRegistry {
  const registry = new SkillRegistryProviderRegistry();
  registry.register(createSkillsShProvider());
  return registry;
}
