// Jev's verdict on a shell command the text rules could not settle
// (sandbox-command-risk.ts `review`): could it destroy or leak anything that
// outlives the sandbox?
//
// Fails CLOSED, unlike the other Jev sites: no key, a timeout, an error, a
// malformed answer, a "risky" verdict or a confidence under the floor all
// return false, which the gate reads as "ask a person".
import { createClassifierClient, roleModelRef } from "@engenty/ai-core";
import {
  type ClassifierClient,
  validateChoiceAnswer,
} from "@engenty/typesafe-client";

/** Below this the classifier is guessing; a guess is not permission. */
export const SAFE_CONFIDENCE_FLOOR = 0.8;
const TIMEOUT_MS = 3000;
const CACHE_LIMIT = 200;

const IDS = ["safe", "risky"];

// A routine re-runs the same command every fire; the verdict on identical
// text and directory does not change. Only real verdicts are kept, never a
// failure, so a blip cannot pin a command to "ask".
const verdicts = new Map<string, boolean>();

function defaultClient(): Pick<ClassifierClient, "systemOne"> | null {
  try {
    return createClassifierClient(roleModelRef("classifier"))?.client ?? null;
  } catch {
    return null;
  }
}

function remember(key: string, safe: boolean): void {
  if (verdicts.size >= CACHE_LIMIT) {
    const oldest = verdicts.keys().next().value;
    if (oldest !== undefined) {
      verdicts.delete(oldest);
    }
  }
  verdicts.set(key, safe);
}

export async function jevSaysCommandSafe(
  args: { command?: unknown; cwd?: unknown },
  options: {
    client?: Pick<ClassifierClient, "systemOne"> | null;
    timeoutMs?: number;
  } = {}
): Promise<boolean> {
  const command = typeof args.command === "string" ? args.command.trim() : "";
  const cwd = typeof args.cwd === "string" ? args.cwd.trim() : "";
  const key = `${cwd}\n${command}`;
  const known = verdicts.get(key);
  if (known !== undefined) {
    return known;
  }
  const client =
    options.client === undefined ? defaultClient() : options.client;
  if (!(client && command)) {
    return false;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      client.systemOne({
        questions: {
          verdict: {
            criteria: {
              risky:
                "May delete, move or overwrite existing files, empty a folder, send data out of the machine, or its effect cannot be told from the text.",
              safe: "Only reads, or only creates new files; cannot remove or overwrite existing shared data.",
            },
            instructions:
              "A shell command an AI agent wants to run in a disposable sandbox that has the team's shared folders (/space, /project, /data) mounted. Could it destroy or leak anything that outlives the sandbox?",
            type: "choice",
          },
        },
        state: { command, working_directory: cwd || "/sandbox" },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("jev_command_timeout")),
          options.timeoutMs ?? TIMEOUT_MS
        );
      }),
    ]);
    const answer = validateChoiceAnswer(response.answers.verdict, IDS);
    const safe =
      answer.choice === "safe" && answer.confidence >= SAFE_CONFIDENCE_FLOOR;
    remember(key, safe);
    return safe;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
