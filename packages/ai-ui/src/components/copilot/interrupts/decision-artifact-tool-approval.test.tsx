/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type DecisionArtifact,
  DecisionArtifactCard,
} from "./decision-artifact.js";

// Real locale copy with real interpolation, so these tests assert what the USER
// reads. Without it `t()` falls back to the server's English `defaultValue` and
// the card's own key choice + parameters — the thing that regressed — would go
// unchecked. Mirrors apps/ui/src/locales/{en,de}/common.json.
const MESSAGES: Record<string, string> = {
  "copilot.toolApproval.approveAlways": "Approve for this agent",
  "copilot.toolApproval.approveOnce": "Approve once",
  "copilot.toolApproval.approveRun": "Approve for this run",
  "copilot.toolApproval.body":
    "This action requires your approval before it runs. Operation: {{operation}}",
  "copilot.toolApproval.bodyBulk":
    "These actions require your approval before they run. Operations: {{operations}}",
  "copilot.toolApproval.deny": "Deny",
  "copilot.toolApproval.title": "Approve {{action}}?",
  "copilot.toolApproval.workspaceCommand": "Run this command?",
};

vi.mock("@engenty/i18n/ui", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = MESSAGES[key];
      if (!template) {
        return (options?.defaultValue as string) ?? key;
      }
      return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(options?.[name] ?? "")
      );
    },
  }),
}));

afterEach(() => {
  cleanup();
});

const noop = () => {
  // choices are not exercised here
};

// Mirrors the server encoder (apps/ai/.../lib/tool-approval.ts).
function artifactId(operationId: string, grantContext?: unknown): string {
  const base = `tool-approval|${encodeURIComponent(operationId)}`;
  return grantContext
    ? `${base}|${encodeURIComponent(JSON.stringify(grantContext))}`
    : base;
}

function toolApprovalArtifact(input: {
  artifactId: string;
  body: string;
  choices: { id: string; label: string }[];
  title: string;
}): DecisionArtifact {
  return {
    artifactId: input.artifactId,
    body: input.body,
    choices: input.choices,
    interruptId: input.artifactId,
    title: input.title,
  };
}

const SINGLE_CHOICES = [
  { id: "approve_once", label: "Approve once" },
  { id: "approve_always", label: "Approve for this agent" },
  { id: "deny", label: "Deny" },
];

const BULK_CHOICES = [
  { id: "approve_once", label: "Approve for this run" },
  { id: "approve_always", label: "Approve for this agent" },
  { id: "deny", label: "Deny" },
];

describe("DecisionArtifactCard — tool approval", () => {
  it("never renders the raw grant-context tail in the body", () => {
    // The regression: the card printed
    // "Operation: time_tracking_entries_create|%7B%22operation_ids%22…%7D".
    render(
      <DecisionArtifactCard
        artifact={toolApprovalArtifact({
          artifactId: artifactId("time_tracking_entries_create", {
            operation_ids: ["time_tracking_entries_create"],
          }),
          body: "This action requires your approval before it runs.",
          choices: SINGLE_CHOICES,
          title: "Approve bulk write access?",
        })}
        onChoose={noop}
      />
    );

    const body = screen.getByText(/Operation/).textContent ?? "";
    expect(body).toContain("time_tracking_entries_create");
    expect(body).not.toContain("%7B");
    expect(body).not.toContain("operation_ids");
    expect(body).not.toContain("|");
  });

  it("hides the secrets_reveal grant context (the secret id is not display copy)", () => {
    render(
      <DecisionArtifactCard
        artifact={toolApprovalArtifact({
          artifactId: artifactId("secrets_reveal", {
            secret_id: "11111111-1111-4111-8111-111111111111",
          }),
          body: "This action requires your approval before it runs.",
          choices: SINGLE_CHOICES,
          title: "Approve secrets_reveal?",
        })}
        onChoose={noop}
      />
    );

    const body = screen.getByText(/Operation/).textContent ?? "";
    expect(body).toContain("secrets_reveal");
    expect(body).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("lists every covered operation and uses run/agent scope labels on a bulk card", () => {
    render(
      <DecisionArtifactCard
        artifact={toolApprovalArtifact({
          artifactId: artifactId("log_time_entry", {
            operation_ids: ["log_time_entry", "update_time_entry"],
          }),
          body: "Create 200 dummy time entries",
          choices: BULK_CHOICES,
          title: "Approve bulk write access?",
        })}
        onChoose={noop}
      />
    );

    const body = screen.getByText(/Operations/).textContent ?? "";
    expect(body).toContain("log_time_entry");
    expect(body).toContain("update_time_entry");
    // "once"/"always" promise the wrong thing for a multi-op grant.
    expect(screen.getByText("Approve for this run")).toBeTruthy();
    expect(screen.getByText("Approve for this agent")).toBeTruthy();
    expect(screen.queryByText("Approve once")).toBeNull();
  });

  it("shows a sandbox command as the command, not the tool name", () => {
    const command = "python3 /task/check_mail.py --since 1h";
    render(
      <DecisionArtifactCard
        artifact={toolApprovalArtifact({
          artifactId: artifactId(
            `workspace:mastra_workspace_execute_command:${command}`
          ),
          body: command,
          choices: SINGLE_CHOICES,
          title: "Approve Run command?",
        })}
        onChoose={noop}
      />
    );

    expect(screen.getByText("Run this command?")).toBeTruthy();
    expect(screen.getByText(command)).toBeTruthy();
    expect(screen.queryByText(/mastra_workspace_execute_command/)).toBeNull();
    expect(screen.getByText("Approve for this agent")).toBeTruthy();
  });

  it("does not print a delegated specialist's ask as a shell command", () => {
    // The delegate lane lists the child's operations in the grant context and
    // writes a summary body — wrapping that in a code block showed prose as
    // the command to run.
    const operation =
      "workspace:mastra_workspace_execute_command:ls -la /data/Files";
    render(
      <DecisionArtifactCard
        artifact={toolApprovalArtifact({
          artifactId: artifactId(operation, { operation_ids: [operation] }),
          body: `Chief of Staff needs your approval to run: Run command: ls -la /data/Files.\n\nOperations: ${operation}`,
          choices: SINGLE_CHOICES,
          title: "Chief of Staff write access",
        })}
        onChoose={noop}
      />
    );

    expect(screen.queryByText("Run this command?")).toBeNull();
    expect(document.querySelector("pre")).toBeNull();
  });

  it("keeps single-operation cards on the once/always wording", () => {
    render(
      <DecisionArtifactCard
        artifact={toolApprovalArtifact({
          artifactId: artifactId("contacts_contact_delete"),
          body: "This action requires your approval before it runs.",
          choices: SINGLE_CHOICES,
          title: "Approve Delete contact?",
        })}
        onChoose={noop}
      />
    );

    expect(screen.getByText("Approve once")).toBeTruthy();
    expect(screen.queryByText("Approve for this run")).toBeNull();
  });

  it("leaves non-approval decision artifacts untouched", () => {
    render(
      <DecisionArtifactCard
        artifact={toolApprovalArtifact({
          artifactId: "decision-123",
          body: "Pick a grouping.",
          choices: [
            { id: "by_person", label: "By person" },
            { id: "by_project", label: "By project" },
          ],
          title: "Analyze details by",
        })}
        onChoose={noop}
      />
    );

    expect(screen.getByText("Analyze details by")).toBeTruthy();
    expect(screen.getByText("Pick a grouping.")).toBeTruthy();
    expect(screen.getByText("By person")).toBeTruthy();
  });
});
