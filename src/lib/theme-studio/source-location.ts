import type { ThemeSourceType } from "@/app/actions/theme-sources";

/**
 * HTTP sources are fetched by the worker, so a user-entered hostname needs a
 * concrete protocol before it is persisted. Other source types intentionally
 * retain their native input format (subreddit, Exa domain, or Exa query).
 */
export function normalizeThemeSourceLocation(type: ThemeSourceType, value: string): string {
  const trimmed = value.trim();
  if (type === "http" && !/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}
