import { defineNode } from "../../node-contract";
import { llmTaskConfig } from "../../catalog";
import { runLlm } from "@/lib/llm";

const configSchema = llmTaskConfig;

export const llmTaskNode = defineNode({
  type: "ai.llm",
  category: "ai",
  label: "AI Task",
  description:
    "Runs an LLM over the incoming data. Optionally forces structured JSON via a schema. Spend counts against your LLM budget.",
  inputs: ["data"],
  outputs: ["result"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);

    const { assertBudget } = await import("@/lib/usage");
    const budget = await assertBudget(ctx.tenantId);
    if (!budget.allowed) {
      throw new Error(
        `Monthly LLM budget reached ($${budget.costUsd.toFixed(2)} / $${budget.budgetUsd}). ` +
          "Raise the limit in Settings to keep flows running.",
      );
    }

    let jsonSchema: Record<string, unknown> | undefined;
    if (config.outputSchema?.trim()) {
      jsonSchema = JSON.parse(config.outputSchema);
    }

    const userContent = config.userTemplate?.includes("{{input}}")
      ? config.userTemplate.replaceAll("{{input}}", safeStringify(input))
      : `${config.userTemplate ?? ""}\n\nINPUT:\n${safeStringify(input)}`.trim();

    const result = await runLlm({
      tenantId: ctx.tenantId,
      provider: config.provider,
      model: config.model,
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: userContent },
      ],
      jsonSchema,
      maxTokens: config.maxTokens,
    });

    // A configured schema is a contract: never fall back to raw text or schema-invalid data.
    if (jsonSchema) {
      if (result.json === undefined || result.json === null) {
        throw new Error(
          "LLM output did not match the configured JSON schema (unparseable response). " +
            "Re-run the node or adjust the prompt/schema.",
        );
      }

      const validation = validateJsonSchema(result.json, jsonSchema);
      if (!validation.valid) {
        throw new Error(
          `LLM output violated the configured JSON schema: ${validation.errors.join("; ")}. ` +
            "Re-run the node or adjust the prompt/schema.",
        );
      }
    }

    return {
      output: jsonSchema ? result.json : result.text,
    };
  },
});

export function validateJsonSchema(
  data: unknown,
  schema: Record<string, unknown>,
  path = "$",
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Type validation
  if (typeof schema.type === "string") {
    const expectedType = schema.type;
    if (expectedType === "object") {
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        errors.push(`${path}: expected object, got ${Array.isArray(data) ? "array" : data === null ? "null" : typeof data}`);
        return { valid: false, errors };
      }
    } else if (expectedType === "array") {
      if (!Array.isArray(data)) {
        errors.push(`${path}: expected array, got ${typeof data}`);
        return { valid: false, errors };
      }
    } else if (expectedType === "string") {
      if (typeof data !== "string") {
        errors.push(`${path}: expected string, got ${typeof data}`);
        return { valid: false, errors };
      }
    } else if (expectedType === "number") {
      if (typeof data !== "number" || isNaN(data)) {
        errors.push(`${path}: expected number, got ${typeof data}`);
        return { valid: false, errors };
      }
    } else if (expectedType === "integer") {
      if (typeof data !== "number" || !Number.isInteger(data)) {
        errors.push(`${path}: expected integer, got ${typeof data}`);
        return { valid: false, errors };
      }
    } else if (expectedType === "boolean") {
      if (typeof data !== "boolean") {
        errors.push(`${path}: expected boolean, got ${typeof data}`);
        return { valid: false, errors };
      }
    } else if (expectedType === "null") {
      if (data !== null) {
        errors.push(`${path}: expected null, got ${typeof data}`);
        return { valid: false, errors };
      }
    }
  } else if (Array.isArray(schema.type)) {
    // Union types e.g. ["string", "null"]
    const matchesAny = schema.type.some((t) => {
      if (t === "object") return typeof data === "object" && data !== null && !Array.isArray(data);
      if (t === "array") return Array.isArray(data);
      if (t === "string") return typeof data === "string";
      if (t === "number") return typeof data === "number" && !isNaN(data);
      if (t === "integer") return typeof data === "number" && Number.isInteger(data);
      if (t === "boolean") return typeof data === "boolean";
      if (t === "null") return data === null;
      return false;
    });
    if (!matchesAny) {
      errors.push(`${path}: expected one of types [${schema.type.join(", ")}], got ${typeof data}`);
      return { valid: false, errors };
    }
  }

  // Enum validation
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) {
      errors.push(`${path}: value ${JSON.stringify(data)} is not in enum [${schema.enum.map((e) => JSON.stringify(e)).join(", ")}]`);
    }
  }

  // Object property validation
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Required properties
    if (Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (typeof req === "string" && (!(req in obj) || obj[req] === undefined)) {
          errors.push(`${path}.${req}: required property is missing`);
        }
      }
    }

    // Properties validation
    if (schema.properties && typeof schema.properties === "object") {
      const properties = schema.properties as Record<string, Record<string, unknown>>;
      for (const [propName, propSchema] of Object.entries(properties)) {
        if (propName in obj && obj[propName] !== undefined) {
          const propRes = validateJsonSchema(obj[propName], propSchema, `${path}.${propName}`);
          errors.push(...propRes.errors);
        }
      }
    }

    // additionalProperties: false
    if (schema.additionalProperties === false && schema.properties && typeof schema.properties === "object") {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(obj)) {
        if (!allowedKeys.has(key)) {
          errors.push(`${path}.${key}: unexpected property (additionalProperties is false)`);
        }
      }
    }
  }

  // Array item validation
  if (Array.isArray(data) && schema.items && typeof schema.items === "object") {
    const itemSchema = schema.items as Record<string, unknown>;
    for (let i = 0; i < data.length; i++) {
      const itemRes = validateJsonSchema(data[i], itemSchema, `${path}[${i}]`);
      errors.push(...itemRes.errors);
    }
  }

  // String constraints
  if (typeof data === "string") {
    if (typeof schema.minLength === "number" && data.length < schema.minLength) {
      errors.push(`${path}: string length ${data.length} is less than minLength ${schema.minLength}`);
    }
    if (typeof schema.maxLength === "number" && data.length > schema.maxLength) {
      errors.push(`${path}: string length ${data.length} is greater than maxLength ${schema.maxLength}`);
    }
    if (typeof schema.pattern === "string") {
      try {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          errors.push(`${path}: string does not match pattern ${schema.pattern}`);
        }
      } catch {
        // invalid regex pattern in user schema
      }
    }
  }

  // Number constraints
  if (typeof data === "number") {
    if (typeof schema.minimum === "number" && data < schema.minimum) {
      errors.push(`${path}: number ${data} is less than minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && data > schema.maximum) {
      errors.push(`${path}: number ${data} is greater than maximum ${schema.maximum}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
