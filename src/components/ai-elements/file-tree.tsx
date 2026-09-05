"use client";

import * as React from "react";
import {
  Folder01Icon as FolderIcon,
  FolderOpenIcon,
  File02Icon as FileIcon,
  CodeIcon,
  ArrowRight01Icon as ChevronRightIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";

export type FileNode = {
  name: string;
  path: string;
  isFolder?: boolean;
  children?: FileNode[];
};

export type FileTreeProps = React.HTMLAttributes<HTMLDivElement> & {
  nodes: FileNode[];
  selectedPath?: string;
  onSelectPath?: (path: string) => void;
};

export function FileTree({
  nodes,
  selectedPath,
  onSelectPath,
  className,
  ...props
}: FileTreeProps) {
  return (
    <div
      className={cn(
        "my-2 flex flex-col rounded-lg border border-border/40 bg-background/60 p-2 text-xs font-mono select-none overflow-x-auto",
        className
      )}
      {...props}
    >
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelectPath={onSelectPath}
        />
      ))}
    </div>
  );
}

export function FileTreeNode({
  node,
  selectedPath,
  onSelectPath,
  depth = 0,
}: {
  node: FileNode;
  selectedPath?: string;
  onSelectPath?: (path: string) => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = React.useState(depth < 2);
  const isSelected = selectedPath === node.path;

  if (node.isFolder) {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-left text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer",
            isSelected && "bg-muted/70 text-foreground font-medium"
          )}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 transition-transform duration-150",
              isOpen && "rotate-90"
            )}
          />
          {isOpen ? (
            <FolderOpenIcon className="size-3.5 text-primary shrink-0" />
          ) : (
            <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {isOpen && node.children ? (
          <div className="flex flex-col">
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const isCode = /\.(ts|tsx|js|jsx|json|html|css|py|rs|go)$/i.test(node.name);

  return (
    <button
      type="button"
      onClick={() => onSelectPath?.(node.path)}
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-left text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer",
        isSelected && "bg-muted/80 text-foreground font-medium"
      )}
      style={{ paddingLeft: `${depth * 14 + 22}px` }}
    >
      {isCode ? (
        <CodeIcon className="size-3.5 text-muted-foreground/70 shrink-0" />
      ) : (
        <FileIcon className="size-3.5 text-muted-foreground/70 shrink-0" />
      )}
      <span className="truncate">{node.name}</span>
    </button>
  );
}
