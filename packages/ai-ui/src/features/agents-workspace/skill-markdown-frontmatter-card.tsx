import { Card, CardContent } from "@engenty/ui-core";
import type { SkillFrontmatterPreviewModel } from "./skill-markdown-preview.js";

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="font-medium text-muted-foreground text-xxs uppercase tracking-widest">
      {children}
    </p>
  );
}

export function SkillMarkdownFrontmatterCard({
  labels,
  model,
}: {
  labels: { allowedTools: string; metadata: string };
  model: SkillFrontmatterPreviewModel;
}) {
  return (
    <Card className="mb-6 bg-muted/30 shadow-none" variant="settings">
      <CardContent className="space-y-3 p-4 text-sm">
        {model.primaryLines.length > 0 ? (
          <ul className="space-y-1 font-mono text-xs leading-relaxed">
            {model.primaryLines.map(({ key, value }) => (
              <li className="text-foreground" key={key}>
                <span className="text-muted-foreground">{key}</span>
                <span className="text-muted-foreground">: </span>
                <span>{value}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {model.metadataLines.length > 0 ? (
          <div className="space-y-2">
            <p className="font-medium text-foreground text-xs">
              {labels.metadata}
            </p>
            <ul className="ml-3 space-y-1 border-border border-l pl-3 font-mono text-xs">
              {model.metadataLines.map(({ key, value }) => (
                <li className="text-foreground" key={key}>
                  <span className="text-muted-foreground">{key}</span>
                  <span className="text-muted-foreground">: </span>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {model.allowedTools.length > 0 ? (
          <div className="space-y-1.5">
            <Eyebrow>{labels.allowedTools}</Eyebrow>
            <p className="font-mono text-foreground text-xs">
              {model.allowedTools.join(", ")}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
