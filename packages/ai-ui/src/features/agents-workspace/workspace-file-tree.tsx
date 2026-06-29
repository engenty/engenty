// Recursive folder/file tree for the Workspace tab. The whole tree is fetched +
// cached once (see useWorkspaceTreeQuery); expand/collapse is local UI state, so
// navigating folders never refetches.

import { Button, cn } from "@engenty/ui-core";
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import { useState } from "react";

import type { WorkspaceTreeNode } from "./workspace-tree-utils";

interface WorkspaceFileTreeProps {
  nodes: WorkspaceTreeNode[];
  onSelect: (path: string) => void;
  selectedPath: string | null;
}

interface TreeRowProps {
  depth: number;
  node: WorkspaceTreeNode;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}

function TreeRow({ depth, node, onSelect, selectedPath }: TreeRowProps) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: `${depth * 0.75 + 0.25}rem` };

  if (node.isDir) {
    return (
      <div>
        <Button
          className="h-auto w-full justify-start gap-1.5 py-1.5 text-left font-mono text-xs"
          onClick={() => setOpen((value) => !value)}
          style={indent}
          variant="ghost"
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )}
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          {node.name}
        </Button>
        {open
          ? node.children.map((child) => (
              <TreeRow
                depth={depth + 1}
                key={child.path}
                node={child}
                onSelect={onSelect}
                selectedPath={selectedPath}
              />
            ))
          : null}
      </div>
    );
  }

  return (
    <Button
      className={cn(
        "h-auto w-full justify-start gap-1.5 py-1.5 text-left font-mono text-xs",
        selectedPath === node.path && "bg-muted"
      )}
      onClick={() => onSelect(node.path)}
      style={indent}
      variant="ghost"
    >
      <File className="size-3.5 shrink-0 text-muted-foreground" />
      {node.name}
    </Button>
  );
}

export function WorkspaceFileTree({
  nodes,
  onSelect,
  selectedPath,
}: WorkspaceFileTreeProps) {
  return (
    <div>
      {nodes.map((node) => (
        <TreeRow
          depth={0}
          key={node.path}
          node={node}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}
