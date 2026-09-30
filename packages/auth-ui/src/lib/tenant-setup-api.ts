/**
 * What the tenant setup does to the outside world, for a person who is
 * already signed in: the copilot's look and conversation, the first space
 * (its name, tile and privacy), the engenty hired into it, how its computer
 * and engenties behave, its first apps, and
 * the tenant's language. Every call carries
 * the shared client's token. The preview page runs the same screens on
 * `createPreviewTenantSetupApi`, from memory.
 */
import type { AgentEngentyKind } from "@engenty/ai-core/browser";
import { getCurrentAccessToken } from "./api-client";
import {
  addSpaceApps,
  ensureFirstSpace,
  type FirstEngentyChoice,
  hireFirstEngenty,
  markTenantSetupDone,
  openCopilot,
  readSetupCatalog,
  readWorkspaceContext,
  type SetupCatalog,
  type SetupSpaceMount,
  type SpaceVisibility,
  type SpaceWorkRules,
  saveCopilotLook,
  saveSpaceWorkRules,
  saveTenantLanguage,
} from "./initial-setup-workspace";

export interface SetupSpace {
  id: string;
  key: string;
  name: string;
}

export interface TenantSetupContext {
  /** The signed-in person's name, for the copilot's hello. */
  personName: string;
  tenant: { id: string; name: string };
  userId: string;
}

export interface TenantSetupApi {
  /** Mounts the picked apps (and what they need) into the space. */
  addApps: (params: {
    modules: readonly string[];
    space: SetupSpace;
  }) => Promise<void>;
  /** Names the first space, gives it its tile and who may open it. */
  ensureFirstSpace: (params: {
    baseline: readonly SetupSpaceMount[];
    color: string;
    icon: string | null;
    name: string;
    userId: string;
    visibility: SpaceVisibility;
  }) => Promise<SetupSpace>;
  /** Makes the wizard's language the tenant's and marks the setup done. */
  finish: (language: string) => Promise<void>;
  hireEngenty: (params: {
    choice: FirstEngentyChoice;
    language: string;
    space: SetupSpace;
  }) => Promise<{ id: string; name: string }>;
  openCopilot: (language: string) => Promise<{ created: boolean }>;
  readCatalog: () => Promise<SetupCatalog>;
  readContext: () => Promise<TenantSetupContext>;
  saveCopilotLook: (look: AgentEngentyKind) => Promise<void>;
  /** The space computer's internet access and when engenties ask. */
  saveWorkRules: (params: {
    rules: SpaceWorkRules;
    space: SetupSpace;
  }) => Promise<void>;
}

async function token(): Promise<string> {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) {
    throw new Error("Your session ended. Sign in again to continue.");
  }
  return accessToken;
}

export const LIVE_TENANT_SETUP_API: TenantSetupApi = {
  addApps: async ({ modules, space }) =>
    addSpaceApps({ accessToken: await token(), modules, spaceId: space.id }),
  ensureFirstSpace: async (params) =>
    ensureFirstSpace({ accessToken: await token(), ...params }),
  hireEngenty: async (params) =>
    hireFirstEngenty({ accessToken: await token(), ...params }),
  openCopilot: async (language) =>
    openCopilot({ accessToken: await token(), language }),
  readCatalog: async () => readSetupCatalog(await token()),
  saveCopilotLook: async (look) =>
    saveCopilotLook({ accessToken: await token(), look }),
  finish: async (language) => {
    const accessToken = await token();
    await saveTenantLanguage({ accessToken, language });
    await markTenantSetupDone({ accessToken });
  },
  saveWorkRules: async ({ rules, space }) =>
    saveSpaceWorkRules({
      accessToken: await token(),
      rules,
      spaceId: space.id,
    }),
  readContext: async () => {
    const context = await readWorkspaceContext(await token());
    if (!context.currentTenant) {
      throw new Error("Your account belongs to no team yet.");
    }
    return {
      personName: context.displayName ?? "",
      tenant: {
        id: context.currentTenant.id,
        name: context.currentTenant.name,
      },
      userId: context.userId,
    };
  },
};
