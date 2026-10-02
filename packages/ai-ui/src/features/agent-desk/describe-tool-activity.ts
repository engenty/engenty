// What an agent is doing right now, in words — from its latest tool call.
// Never a tool name: a call without a phrase of its own reads as "working".
// The routine card says it from the run's step, the hand-off row from the
// colleague's progress lines.

/** The tool call to describe; `args` only where the phrase names a value. */
export interface ToolActivity {
  args?: Readonly<Record<string, string | undefined>>;
  toolName: string;
}

export function describeToolActivity(
  activity: ToolActivity,
  t: (key: string, values?: Record<string, string>) => string
): string {
  const { toolName } = activity;
  const args = activity.args ?? {};
  const key = "agentDesk.activity.now";
  switch (toolName) {
    case "web_search":
      return args.query
        ? t(`${key}.webSearch`, { query: args.query })
        : t(`${key}.working`);
    case "web_fetch": {
      let source = args.url ?? "";
      try {
        source = new URL(source).hostname.replace(/^www\./, "");
      } catch {
        // not a URL — say it as given
      }
      return source ? t(`${key}.webFetch`, { source }) : t(`${key}.working`);
    }
    case "artifact_write":
      return args.title
        ? t(`${key}.writing`, { title: args.title })
        : t(`${key}.writingUntitled`);
    case "artifact_read":
    case "show_artifact":
      return t(`${key}.reading`);
    case "app_build":
      return t(`${key}.buildingApp`);
    case "skill":
    case "skill_search":
      return t(`${key}.guide`);
    case "memory_note":
    case "working_memory_set":
      return t(`${key}.noting`);
    case "engenty_tools_search":
    case "engenty_tools_discover":
    case "engenty_tools_modules":
      return t(`${key}.lookingUp`);
    default:
      return t(`${key}.working`);
  }
}

/**
 * A colleague's progress line names the tool it started as `Running <id>`
 * (`delegate-run-agui-driver.ts`, TOOL_CALL_START). Every other line is
 * already a sentence and is shown as written.
 */
const RUNNING_TOOL_LINE = /^Running ([a-z0-9_-]+)$/;

export function describeProgressLine(
  line: string,
  t: (key: string, values?: Record<string, string>) => string
): string {
  const toolName = RUNNING_TOOL_LINE.exec(line.trim())?.[1];
  return toolName ? describeToolActivity({ toolName }, t) : line;
}
