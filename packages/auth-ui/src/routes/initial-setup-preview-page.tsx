// Both setup wizards on in-memory backends, for working on their screens:
// `/auth/setup-preview`. Development only. Nothing is created, so they run as
// often as needed. The bar at the bottom switches between the tenant setup
// (the default — what every new team sees) and the server setup, restarts,
// and for the server setup switches the two situations that change its flow.

import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { cn } from "@engenty/ui-core";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  createPreviewServerSetupApi,
  createPreviewTenantSetupApi,
  DEFAULT_PREVIEW_SCENARIO,
  type PreviewScenario,
} from "../lib/setup-preview-api";
import { InitialSetupWizard } from "./initial-setup-wizard";
import { TenantSetupWizard } from "./tenant-setup-wizard";

type Part = "tenant" | "server";

/** The signed-in person the tenant preview pretends to be. */
const PREVIEW_PERSON = "Alex Berger";

const INK = "oklch(22% 0.018 60)";

function Toggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={on}
      className={cn(
        "rounded-full px-2.5 py-1 text-[12px] transition-colors",
        on ? "bg-white" : "text-white/70 hover:text-white"
      )}
      onClick={onClick}
      style={on ? { color: INK } : undefined}
      type="button"
    >
      {label}
    </button>
  );
}

export function InitialSetupPreviewPage() {
  const [part, setPart] = useState<Part>("tenant");
  const [scenario, setScenario] = useState<PreviewScenario>(
    DEFAULT_PREVIEW_SCENARIO
  );
  const [run, setRun] = useState(0);
  const [landed, setLanded] = useState<string | null>(null);
  // A fresh backend per run: its memory is the preview's database.
  const serverApi = useMemo(
    () => createPreviewServerSetupApi(scenario),
    [scenario]
  );
  const tenantApi = useMemo(
    () => createPreviewTenantSetupApi(PREVIEW_PERSON),
    []
  );

  if (!isEngentyDevelopmentEnvironment()) {
    return <Navigate replace to="/auth/login" />;
  }

  const restart = (next: { part?: Part; scenario?: PreviewScenario } = {}) => {
    if (next.part) {
      setPart(next.part);
    }
    if (next.scenario) {
      setScenario(next.scenario);
    }
    setLanded(null);
    setRun((value) => value + 1);
  };

  const toolbar = (
    <div
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-white shadow-lg backdrop-blur"
      style={{ background: "oklch(22% 0.018 60 / 0.92)" }}
    >
      <span className="mr-1 font-medium text-[12px]">
        {landed ? `Would open ${landed}` : "Preview · nothing is saved"}
      </span>
      <Toggle
        label="Tenant setup"
        on={part === "tenant"}
        onClick={() => restart({ part: "tenant" })}
      />
      <Toggle
        label="Server setup"
        on={part === "server"}
        onClick={() => restart({ part: "server" })}
      />
      {part === "server" ? (
        <>
          <span className="mx-1 h-4 w-px bg-white/20" />
          <Toggle
            label="Broken install"
            on={scenario.brokenInstall}
            onClick={() =>
              restart({
                scenario: {
                  ...scenario,
                  brokenInstall: !scenario.brokenInstall,
                },
              })
            }
          />
          <Toggle
            label="Key in env"
            on={scenario.envKey}
            onClick={() =>
              restart({ scenario: { ...scenario, envKey: !scenario.envKey } })
            }
          />
        </>
      ) : null}
      <button
        aria-label="Restart"
        className="ml-1 flex size-7 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        onClick={() => restart()}
        type="button"
      >
        <RotateCcw className="size-3.5" />
      </button>
    </div>
  );

  return part === "tenant" ? (
    <TenantSetupWizard
      api={tenantApi}
      key={`tenant-${run}`}
      onComplete={setLanded}
      toolbar={toolbar}
    />
  ) : (
    <InitialSetupWizard
      api={serverApi}
      key={`server-${run}`}
      onComplete={setLanded}
      toolbar={toolbar}
    />
  );
}
