"use client";

import * as React from "react";
import {
  CodeCircleIcon as SchemaIcon,
  ArrowRight01Icon as ChevronRightIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";

export type SchemaProperty = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  default?: string | number | boolean;
  properties?: SchemaProperty[];
};

export type SchemaDisplayProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  properties: SchemaProperty[];
};

export function SchemaDisplay({
  title = "Schema Definition",
  properties,
  className,
  ...props
}: SchemaDisplayProps) {
  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/50 bg-background/70 p-3.5 text-xs shadow-xs space-y-2",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5 font-semibold text-foreground pb-1 border-b border-border/30">
        <SchemaIcon className="size-3.5 text-primary" />
        <span>{title}</span>
      </div>

      <div className="flex flex-col divide-y divide-border/20">
        {properties.map((prop) => (
          <SchemaFieldRow key={prop.name} property={prop} />
        ))}
      </div>
    </div>
  );
}

export function SchemaFieldRow({
  property,
  depth = 0,
}: {
  property: SchemaProperty;
  depth?: number;
}) {
  const [open, setOpen] = React.useState(true);
  const hasChildren = property.properties && property.properties.length > 0;

  return (
    <div className="flex flex-col py-2" style={{ paddingLeft: `${depth * 16}px` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronRightIcon
                className={cn("size-3 transition-transform", open && "rotate-90")}
              />
            </button>
          ) : null}
          <span className="font-mono font-medium text-foreground text-xs truncate">
            {property.name}
          </span>
          {property.required ? (
            <span className="text-[10px] text-destructive font-medium" title="Required">
              *
            </span>
          ) : null}
          <SchemaTypeBadge type={property.type} />
        </div>

        {property.default !== undefined ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            default: {String(property.default)}
          </span>
        ) : null}
      </div>

      {property.description ? (
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed pl-4">
          {property.description}
        </p>
      ) : null}

      {hasChildren && open ? (
        <div className="flex flex-col mt-1 border-l border-border/30 pl-2">
          {property.properties?.map((child) => (
            <SchemaFieldRow
              key={child.name}
              property={child}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SchemaTypeBadge({ type }: { type: string }) {
  const color =
    type === "string"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : type === "number" || type === "integer"
      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      : type === "boolean"
      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
      : type === "array"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-muted text-muted-foreground";

  return (
    <span className={cn("rounded px-1.5 py-0.2 text-[10px] font-mono font-medium", color)}>
      {type}
    </span>
  );
}
