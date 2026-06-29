import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { callCoreApi, defaultApiUrl } from "../core-api.js";
import { dim } from "../env-setup/env-style.js";

interface SkillListItem {
  description?: string;
  engenty_modules?: string[];
  name: string;
  source?: string;
  tier?: string;
  title?: string;
}

interface CommonOpts {
  apiUrl?: string;
  token?: string;
}

function renderSkillsTable(skills: SkillListItem[]): string {
  if (skills.length === 0) {
    return "No skills available for this tenant.";
  }
  const rows = skills.map((skill) => [
    skill.name,
    (skill.engenty_modules ?? []).join(","),
    skill.tier ?? "",
    skill.description ?? skill.title ?? "",
  ]);
  const all = [["SKILL", "MODULES", "TIER", "DESCRIPTION"], ...rows];
  const widths = all[0].map((_, index) =>
    Math.max(...all.map((row) => Math.min(row[index]?.length ?? 0, 80)))
  );
  return all
    .map((row, rowIndex) =>
      row
        .map((cell, index) => {
          const text = cell.length > 80 ? `${cell.slice(0, 77)}…` : cell;
          const padded = text.padEnd(widths[index]);
          if (rowIndex === 0 || index === 3) {
            return dim(padded);
          }
          return padded;
        })
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

export function registerSkillsCommands(program: Command): void {
  const skills = program
    .command("skills")
    .description(
      "Agent instructions for using the tools (module-provided SKILL.md playbooks)"
    );

  skills
    .command("list")
    .description("List available skills (filter with --module)")
    .option("--module <id>", "Only skills belonging to one module")
    .option("--json", "Raw JSON output")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(
        async (opts: CommonOpts & { json?: boolean; module?: string }) => {
          const result = await callCoreApi<{ skills: SkillListItem[] }>(
            opts,
            "GET",
            "/ai/skills"
          );
          let list = result.skills ?? [];
          if (opts.module) {
            list = list.filter((skill) =>
              (skill.engenty_modules ?? []).includes(opts.module as string)
            );
          }
          if (opts.json) {
            console.log(JSON.stringify(list, null, 2));
            return;
          }
          console.log(renderSkillsTable(list));
          console.log(
            dim(
              "\nRead one with: engenty skills show <name> — then call the referenced tools via engenty tools call."
            )
          );
        }
      )
    );

  skills
    .command("show")
    .description("Print a skill's full instructions (SKILL.md body)")
    .argument("<name>", "Skill name (kebab-case, from skills list)")
    .option("--json", "Raw JSON output (frontmatter + body)")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(
        async (name: string, opts: CommonOpts & { json?: boolean }) => {
          const result = await callCoreApi<{
            skill: SkillListItem & { body?: string };
          }>(opts, "GET", `/ai/skills/${encodeURIComponent(name)}`);
          if (opts.json) {
            console.log(JSON.stringify(result.skill, null, 2));
            return;
          }
          const skill = result.skill;
          const modules = (skill.engenty_modules ?? []).join(", ");
          console.log(
            dim(
              `# ${skill.name}${skill.tier ? ` (${skill.tier})` : ""}${modules ? ` — modules: ${modules}` : ""}`
            )
          );
          console.log(skill.body ?? skill.description ?? "(no content)");
        }
      )
    );
}
