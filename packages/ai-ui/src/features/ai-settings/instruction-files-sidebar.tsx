import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
  Separator,
} from "@engenty/ui-core";
import type { AiInstructionOwnerGroup } from "./instruction-groups";

interface InstructionFilesSidebarProps {
  description: string;
  emptyLabel: string;
  groups: AiInstructionOwnerGroup[];
  onSelect: (documentKey: string) => void;
  selectedKey: string;
  title: string;
}

export function InstructionFilesSidebar({
  description,
  emptyLabel,
  groups,
  onSelect,
  selectedKey,
  title,
}: InstructionFilesSidebarProps) {
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 px-0">
        <ScrollArea className="h-[calc(100dvh-18rem)]">
          <div className="space-y-4 px-3 pb-3">
            {groups.map((group) => (
              <section className="space-y-2" key={group.owner_id}>
                <div className="px-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{group.title}</p>
                    <Badge variant="outline">{group.owner_kind}</Badge>
                  </div>
                  <p className="truncate text-muted-foreground text-xs">
                    {group.owner_id}
                  </p>
                </div>
                <div className="space-y-1">
                  {group.documents.map((document) => {
                    const isActive = document.document_key === selectedKey;
                    return (
                      <button
                        className={`w-full rounded-md border px-3 py-2 text-left transition ${
                          isActive
                            ? "border-primary bg-accent"
                            : "border-transparent hover:border-border hover:bg-accent/50"
                        }`}
                        key={document.document_key}
                        onClick={() => onSelect(document.document_key)}
                        type="button"
                      >
                        <div className="font-medium text-sm">
                          {document.filename}
                        </div>
                        <div className="truncate text-muted-foreground text-xs">
                          {document.title}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Separator />
              </section>
            ))}
            {groups.length === 0 ? (
              <p className="px-3 text-muted-foreground text-sm">{emptyLabel}</p>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
