import { z } from "zod";

export type WebMcpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function webMcpResult(value: unknown, isError = false): WebMcpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  };
}

function failure(error: unknown): WebMcpToolResult {
  if (error instanceof z.ZodError) {
    return webMcpResult({
      ok: false,
      error: "Invalid tool input",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, true);
  }
  return webMcpResult({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, true);
}

export function defineWebMcpTool<T extends Record<string, unknown>>(
  definition: Omit<WebMCP.ModelContextTool, "execute">,
  schema: z.ZodType<T>,
  execute: (input: T, options: WebMCP.ToolExecuteCallbackOptions) => Promise<unknown> | unknown,
): WebMCP.ModelContextTool {
  return {
    ...definition,
    execute: async (raw, options) => {
      try {
        // Current preview runtimes can omit all or part of callback options.
        const signal = options?.signal ?? new AbortController().signal;
        signal.throwIfAborted();
        const output = await execute(schema.parse(raw), { signal });
        signal.throwIfAborted();
        return webMcpResult(output);
      } catch (error) {
        if (options?.signal?.aborted) throw error;
        return failure(error);
      }
    },
  };
}
