/**
 * What the server setup does to the outside world: the installation check,
 * the first administrator (the superadmin), and the AI key. It ends signed in
 * and hands over to the tenant setup (`tenant-setup-api.ts`). The wizard runs
 * on `LIVE_SERVER_SETUP_API`; the preview page (`/auth/setup-preview`) runs
 * the same screens on `createPreviewServerSetupApi`, from memory.
 */
import { createInitialAdmin } from "./initial-setup";
import {
  type AiProviderGateway,
  type AiProviderSaveResult,
  type AiProviderTestResult,
  probeAiServiceFromBrowser,
  readSetupChecks,
  type SetupCheck,
  saveAiProviderKey,
  testAiProviderKey,
} from "./initial-setup-checks";
import { readWorkspaceContext } from "./initial-setup-workspace";
import {
  createDetachedSupabaseAuthClient,
  getSupabaseAuthClient,
} from "./supabase-auth-client";

export interface AdminValues {
  email: string;
  name: string;
  password: string;
}

/** The administrator's detached session: what the AI step calls with. */
export interface SetupSession {
  accessToken: string;
  userId: string;
}

export interface ServerSetupApi {
  createAdmin: (values: AdminValues) => Promise<void>;
  /** Signs the SHARED client in — the tenant setup takes over from here. */
  finish: (values: AdminValues) => Promise<void>;
  readChecks: () => Promise<SetupCheck[]>;
  saveProviderKey: (params: {
    apiKey: string;
    envKey: string;
    session: SetupSession;
  }) => Promise<AiProviderSaveResult>;
  /**
   * Signs the administrator in on a DETACHED client: signing the shared one
   * in would flip `isAuthenticated` and the router would leave
   * /initial_setup before the AI step.
   */
  signIn: (values: AdminValues) => Promise<SetupSession>;
  testProviderKey: (params: {
    apiKey: string;
    gateway: AiProviderGateway;
    session: SetupSession;
  }) => Promise<AiProviderTestResult>;
}

export const LIVE_SERVER_SETUP_API: ServerSetupApi = {
  createAdmin: async (values) => {
    await createInitialAdmin({
      display_name: values.name.trim(),
      email: values.email.trim(),
      password: values.password,
    });
  },
  finish: async (values) => {
    const { error } = await getSupabaseAuthClient().auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    });
    if (error) {
      throw error;
    }
  },
  readChecks: async () => {
    const [core, browser] = await Promise.all([
      readSetupChecks(),
      probeAiServiceFromBrowser(),
    ]);
    return [...core, browser];
  },
  saveProviderKey: ({ apiKey, envKey, session }) =>
    saveAiProviderKey({ accessToken: session.accessToken, apiKey, envKey }),
  signIn: async (values) => {
    const supabase = createDetachedSupabaseAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    });
    if (error) {
      throw error;
    }
    const accessToken = data.session?.access_token ?? "";
    const context = await readWorkspaceContext(accessToken);
    return { accessToken, userId: context.userId };
  },
  testProviderKey: ({ apiKey, gateway, session }) =>
    testAiProviderKey({ accessToken: session.accessToken, apiKey, gateway }),
};
