"use client";

import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type AnySchema = z.ZodTypeAny;

/**
 * Renders an auto-generated config form from a node's zod schema.
 * Adding a new node type requires zero UI work — its schema IS the form.
 */
export function ZodForm({
  schema,
  value,
  onChange,
}: {
  schema: AnySchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const fields = extractFields(schema);

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label className="text-xs font-medium">
            {field.label}
            {field.required ? <span className="text-red-400 ml-0.5">*</span> : null}
          </Label>
          {renderControl(field, value[field.key], (v) => onChange({ ...value, [field.key]: v }))}
        </div>
      ))}
    </div>
  );
}

type FieldDef = {
  key: string;
  label: string;
  kind: "string" | "text" | "number" | "boolean" | "enum";
  options?: string[];
  required: boolean;
};

export function extractFields(schema: AnySchema): FieldDef[] {
  const obj = unwrapSchema(schema);
  const def = (obj as any)?._def ?? (obj as any)?.def;
  const shape = typeof (obj as { shape?: unknown })?.shape === "function"
    ? (obj as unknown as { shape: () => Record<string, AnySchema> }).shape()
      : ((obj as { shape?: Record<string, AnySchema> })?.shape);

  if (!shape) return [];

  return Object.entries(shape).map(([key, fieldSchema]) => {
    const inner = unwrapSchema(fieldSchema);
    const kind = detectKind(inner);
    return {
      key,
      label: prettify(key),
      kind,
      options: kind === "enum" ? enumOptions(inner) : undefined,
      required: !isOptional(fieldSchema),
    };
  });

  function detectKind(s: AnySchema): FieldDef["kind"] {
    const typeName = typeNameOf(s);
    if (typeName === "number") return "number";
    if (typeName === "boolean") return "boolean";
    if (typeName === "enum") return "enum";
    return "string";
  }

  function enumOptions(s: AnySchema): string[] {
    const d = (s as any)._def ?? (s as any)?.def;
    const values =
      d?.values ??
      d?.entries ??
      d?.options ??
      [];
    if (Array.isArray(values)) return values.map(String);
    return Object.keys(values ?? {});
  }
}

function renderControl(
  field: FieldDef,
  current: unknown,
  onChange: (value: unknown) => void,
) {
  const stringValue = current === undefined || current === null ? "" : String(current);

  if (field.kind === "boolean") {
    return (
      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          checked={Boolean(current)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-indigo-600"
        />
        <span className="text-xs text-zinc-500">{current ? "On" : "Off"}</span>
      </div>
    );
  }

  if (field.kind === "enum") {
    return (
      <Select value={stringValue} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((opt) => (
            <SelectItem key={opt} value={opt}>
              {prettify(opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.kind === "number") {
    return (
      <Input
        type="number"
        value={stringValue}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="h-9 text-sm"
      />
    );
  }

  const isLong = /prompt|template|json|payload|input/i.test(field.key);
  return isLong ? (
    <Textarea
      rows={5}
      value={stringValue}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono text-xs"
      placeholder={field.kind === "text" ? "" : undefined}
    />
  ) : (
    <Input value={stringValue} onChange={(e) => onChange(e.target.value)} className="h-9 text-sm" />
  );
}

function unwrapSchema(schema: any): any {
  let s = schema;
  let guard = 0;
  while (s && guard < 10) {
    const d = s._def ?? s.def;
    const typeName = d?.typeName ?? d?.type;
    if (typeName === "optional" || typeName === "default" || typeName === "nullable") {
      s = d.innerType ?? d.schema;
      guard++;
      continue;
    }
    break;
  }
  return s;
}

function typeNameOf(schema: any): string {
  const d = schema?._def ?? schema?.def;
  return String(d?.typeName ?? d?.type ?? "").replace(/^Zod/, "").toLowerCase();
}

function isOptional(schema: any): boolean {
  const d = schema?._def ?? schema?.def;
  const typeName = String(d?.typeName ?? d?.type ?? "").toLowerCase();
  return typeName === "optional" || typeName === "default" || schema.isOptional?.() === true;
}

function prettify(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
