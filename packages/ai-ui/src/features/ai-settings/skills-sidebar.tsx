import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
} from "@engenty/ui-core";
import { useState } from "react";
import type { FileStorageSkillSummary } from "../../lib/runtime/skills-api.js";

interface SkillsSidebarProps {
  onSelect: (name: string) => void;
  selectedName: string | null;
  skills: FileStorageSkillSummary[];
  t: (key: string) => string;
}

export function SkillsSidebar({
  onSelect,
  selectedName,
  skills,
  t,
}: SkillsSidebarProps) {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const filtered = query
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          (s.title ?? "").toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
      )
    : skills;

  const managed = filtered.filter((s) => s.tier === "managed");
  const custom = filtered.filter((s) => s.tier === "custom");

  const isEmpty = skills.length === 0;
  const noResults = !isEmpty && filtered.length === 0;

  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle>{t("skills.title")}</CardTitle>
        <div className="pt-1">
          <input
            className="h-8 w-full rounded-md border bg-background px-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.search")}
            type="search"
            value={search}
          />
        </div>
      </CardHeader>
      <CardContent className="min-h-0 px-0 pt-0">
        <ScrollArea className="h-[calc(100vh-18rem)]">
          <div className="space-y-1 px-3 pb-3">
            {isEmpty ? (
              <p className="px-1 py-2 text-muted-foreground text-sm">
                {t("skills.empty")}
              </p>
            ) : noResults ? (
              <p className="px-1 py-2 text-muted-foreground text-sm">
                {t("skills.emptySearch")}
              </p>
            ) : (
              <>
                {managed.length > 0 ? (
                  <div>
                    <p className="mb-1 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {t("skills.tierManaged")} ({managed.length})
                    </p>
                    {managed.map((skill) => (
                      <SkillItem
                        key={skill.name}
                        onSelect={onSelect}
                        selectedName={selectedName}
                        skill={skill}
                        t={t}
                      />
                    ))}
                  </div>
                ) : null}
                {custom.length > 0 ? (
                  <div className={managed.length > 0 ? "mt-3" : undefined}>
                    <p className="mb-1 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {t("skills.tierCustom")} ({custom.length})
                    </p>
                    {custom.map((skill) => (
                      <SkillItem
                        key={skill.name}
                        onSelect={onSelect}
                        selectedName={selectedName}
                        skill={skill}
                        t={t}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SkillItem({
  onSelect,
  selectedName,
  skill,
  t,
}: {
  onSelect: (name: string) => void;
  selectedName: string | null;
  skill: FileStorageSkillSummary;
  t: (key: string) => string;
}) {
  const isActive = skill.name === selectedName;
  const showTitle = skill.title && skill.title !== skill.name;
  return (
    <button
      className={`w-full rounded-md border px-3 py-2 text-left transition ${
        isActive
          ? "border-primary bg-accent"
          : "border-transparent hover:border-border hover:bg-accent/50"
      }`}
      onClick={() => onSelect(skill.name)}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">{skill.name}</div>
        <Badge variant={skill.tier === "managed" ? "secondary" : "outline"}>
          {skill.tier === "managed"
            ? t("skills.tierManaged")
            : t("skills.tierCustom")}
        </Badge>
      </div>
      {showTitle ? (
        <div className="text-muted-foreground text-xs">{skill.title}</div>
      ) : null}
      {skill.description ? (
        <div className="truncate text-muted-foreground text-xs">
          {skill.description}
        </div>
      ) : null}
    </button>
  );
}
