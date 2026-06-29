import type { ContextGraphSourceRegistration } from "@engenty/plugin-sdk";

export interface ContextGraphSourceRegistry {
  get(id: string): ContextGraphSourceRegistration | undefined;
  list(): ContextGraphSourceRegistration[];
  register(source: ContextGraphSourceRegistration): void;
}

export function createContextGraphSourceRegistry(): ContextGraphSourceRegistry {
  const sources = new Map<string, ContextGraphSourceRegistration>();
  return {
    register(source) {
      sources.set(source.id, source);
    },
    get(id) {
      return sources.get(id);
    },
    list() {
      return [...sources.values()];
    },
  };
}
