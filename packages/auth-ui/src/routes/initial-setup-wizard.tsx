// Server setup – what a fresh installation needs before anyone works in it.
//
//   welcome   the installation check; blocks until every red row is fixed
//   1 admin   the superadmin account, then a detached session
//   2 AI      a gateway key, stored as a platform setting (skippable; skipped
//             on its own when the server environment already has a key)
//
// It ends by signing the superadmin in and handing over to the tenant setup
// (`TENANT_SETUP_PATH`), where their team is set up like any other. Every
// outside call goes through `api`, so the preview page runs these screens on
// an in-memory backend. Only shown when `initial_setup_required` is true.

import { SPACE_COLORS } from "@engenty/app-shell";
import { Button } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { type ReactNode, useState } from "react";
import { AdminStep } from "../components/setup/setup-admin-step";
import { ErrorLine } from "../components/setup/setup-bits";
import { SetupFrame } from "../components/setup/setup-frame";
import {
  envConnectedOutcome,
  type ProviderOutcome,
  ProviderStep,
} from "../components/setup/setup-provider-step";
import { WelcomeStep } from "../components/setup/setup-welcome-step";
import { type AuthLocale, detectAuthLocale } from "../lib/auth-i18n";
import {
  aiProviderEnvKeysFromChecks,
  type SetupCheck,
} from "../lib/initial-setup-checks";
import type {
  AdminValues,
  ServerSetupApi,
  SetupSession,
} from "../lib/setup-api";
import { SETUP_COPY, type SetupStage } from "../lib/setup-wizard-i18n";
import { TENANT_SETUP_PATH } from "./tenant-setup-path";

type ServerStage = Extract<SetupStage, "welcome" | "admin" | "provider">;

export function InitialSetupWizard({
  api,
  onComplete,
  toolbar,
}: {
  api: ServerSetupApi;
  /** Called signed in, with the path to go on to. */
  onComplete: (path: string) => void;
  toolbar?: ReactNode;
}) {
  const [locale, setLocale] = useState<AuthLocale>(detectAuthLocale);
  const copy = SETUP_COPY[locale];
  const [stage, setStage] = useState<ServerStage>("welcome");
  const [checks, setChecks] = useState<SetupCheck[]>([]);
  const [admin, setAdmin] = useState<AdminValues | null>(null);
  const [adminName, setAdminName] = useState("");
  const [session, setSession] = useState<SetupSession | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const envKeys = aiProviderEnvKeysFromChecks(checks);

  const finish = async (values: AdminValues) => {
    setFinishError(null);
    setFinishing(true);
    try {
      await api.finish(values);
      onComplete(TENANT_SETUP_PATH);
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : String(err));
    }
  };

  const connect = (outcome: ProviderOutcome) =>
    setProvider(outcome.kind === "connected" ? outcome.label : null);

  const screen = {
    welcome: copy.welcome,
    admin: copy.admin,
    provider: copy.provider,
  }[stage];

  return (
    <SetupFrame
      lead={screen.lead}
      locale={locale}
      onLocaleChange={setLocale}
      stage={stage}
      story={{
        admin: adminName,
        appCard: null,
        apps: [],
        copilot: "idle",
        copilotLook: "round",
        engenty: null,
        provider,
        space: "",
        spaceLook: { color: SPACE_COLORS[0], icon: null },
        work: {
          approvalMode: "auto",
          browser: { autostart: false, unattended: false },
        },
      }}
      title={screen.title}
      toolbar={toolbar}
    >
      {finishing ? (
        <div className="flex flex-col gap-4">
          {finishError ? (
            <>
              <ErrorLine message={finishError} />
              <Button
                className="h-11 w-full"
                onClick={() => admin && void finish(admin)}
                type="button"
              >
                {copy.provider.submit}
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-2.5 text-[15px] text-ink-2">
              <AnimatedLoaderIcon play="always" size="sm" />
              {copy.ready.signingIn}
            </p>
          )}
        </div>
      ) : null}
      {!finishing && stage === "welcome" ? (
        <WelcomeStep
          api={api}
          copy={copy.welcome}
          onChecks={setChecks}
          onContinue={() => setStage("admin")}
        />
      ) : null}
      {!finishing && stage === "admin" ? (
        <AdminStep
          api={api}
          copy={copy.admin}
          onComplete={(values, next) => {
            setAdmin(values);
            setSession(next);
            if (envKeys.length > 0) {
              connect(envConnectedOutcome(envKeys));
              void finish(values);
              return;
            }
            setStage("provider");
          }}
          onNameChange={setAdminName}
        />
      ) : null}
      {!finishing && stage === "provider" && session && admin ? (
        <ProviderStep
          api={api}
          copy={copy.provider}
          envKeys={envKeys}
          onComplete={(outcome) => {
            connect(outcome);
            void finish(admin);
          }}
          onProviderChange={setProvider}
          session={session}
        />
      ) : null}
    </SetupFrame>
  );
}
