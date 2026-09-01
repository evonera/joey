"use client";

import { useEffect, useState } from "react";

export function useWebMcpTools(tools: WebMCP.ModelContextTool[]): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const registrations = new AbortController();
    void Promise.allSettled(tools.map((tool) => modelContext.registerTool(tool, {
      signal: registrations.signal,
    }))).then((results) => {
      if (registrations.signal.aborted) return;
      setAvailable(results.some((registration) => registration.status === "fulfilled"));
      if (process.env.NODE_ENV !== "production") {
        results.forEach((registration, index) => {
          if (registration.status === "rejected") {
            console.warn(`Unable to register WebMCP tool ${tools[index].name}`, registration.reason);
          }
        });
      }
    });
    return () => registrations.abort();
  }, [tools]);

  return available;
}
