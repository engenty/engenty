// Welcome – the installation check, folded into the first screen. Core's rows
// plus the one only this browser can answer. When everything passes it is a
// single green line; a red row opens with the command that fixes it, and the
// screen checks again every few seconds until it clears.

import { Button, cn } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type SetupCheck, setupBlocked } from "../../lib/initial-setup-checks";
import type { ServerSetupApi } from "../../lib/setup-api";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import { ErrorLine, StatusMark } from "./setup-bits";

const POLL_MS = 5000;

function CheckRow({
  check,
  copy,
}: {
  check: SetupCheck;
  copy: SetupCopy["welcome"];
}) {
  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">
          <StatusMark status={check.status} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink">{check.label}</p>
          {check.detail && check.status !== "ok" ? (
            <p className="break-all text-[12px] text-ink-3">{check.detail}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-[11px] text-ink-4">
          {check.status === "ok"
            ? copy.rowStatus.ok
            : check.status === "fail"
              ? copy.rowStatus.blocks
              : copy.rowStatus.later}
        </span>
      </div>
      {check.fix ? (
        <pre className="ml-6.5 whitespace-pre-wrap break-words rounded-[6px] bg-ink px-3 py-2 font-mono text-[12px] text-paper">
          {check.fix}
        </pre>
      ) : null}
    </li>
  );
}

export function WelcomeStep({
  api,
  copy,
  onChecks,
  onContinue,
}: {
  api: ServerSetupApi;
  copy: SetupCopy["welcome"];
  onChecks: (checks: SetupCheck[]) => void;
  onContinue: () => void;
}) {
  const [checks, setChecks] = useState<SetupCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const next = await api.readChecks();
      setChecks(next);
      setError(null);
      onChecks(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.readFailed);
    } finally {
      setRunning(false);
    }
  }, [api, copy.readFailed, onChecks]);

  useEffect(() => {
    void run();
  }, [run]);

  const blocked = checks ? setupBlocked(checks) : true;

  useEffect(() => {
    if (!(blocked && checks)) {
      return;
    }
    const timer = setInterval(() => void run(), POLL_MS);
    return () => clearInterval(timer);
  }, [blocked, checks, run]);

  const failing = checks?.filter((check) => check.status === "fail") ?? [];
  const passed = checks?.filter((check) => check.status !== "fail") ?? [];
  const showAll = open || failing.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[10px] bg-card px-4 py-3 ring-1 ring-ink/8">
        {checks === null ? (
          <p className="flex items-center gap-2.5 py-1 text-[14px] text-ink-2">
            <AnimatedLoaderIcon play="always" size="sm" />
            {copy.checking}
          </p>
        ) : (
          <>
            <button
              className="flex w-full items-center gap-2.5 py-1 text-left"
              disabled={failing.length > 0}
              onClick={() => setOpen((value) => !value)}
              type="button"
            >
              <StatusMark status={failing.length > 0 ? "fail" : "ok"} />
              <span className="flex-1 font-medium text-[14px] text-ink">
                {failing.length > 0
                  ? copy.needsYou(failing.length)
                  : copy.allGood(checks.length)}
              </span>
              {failing.length > 0 ? (
                running ? (
                  <AnimatedLoaderIcon play="always" size="sm" />
                ) : null
              ) : (
                <span className="flex items-center gap-1 text-[12px] text-ink-3">
                  {open ? copy.hideDetails : copy.details}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      open && "rotate-180"
                    )}
                  />
                </span>
              )}
            </button>
            {failing.length > 0 ? (
              <p className="mt-1 pl-6.5 text-[12.5px] text-ink-3">
                {copy.polling}
              </p>
            ) : null}
            {showAll ? (
              <ul className="mt-2 divide-y divide-ink/6 border-ink/6 border-t">
                {[...failing, ...(open ? passed : [])].map((check) => (
                  <CheckRow check={check} copy={copy} key={check.id} />
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      <ErrorLine message={error} />

      <div className="flex flex-col gap-3">
        <Button
          className="h-11 w-full text-[15px]"
          disabled={blocked || checks === null}
          onClick={onContinue}
          type="button"
        >
          {copy.start}
        </Button>
        {failing.length > 0 || error ? (
          <Button
            className="h-10 w-full"
            disabled={running}
            onClick={() => void run()}
            type="button"
            variant="outline"
          >
            {copy.recheck}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
