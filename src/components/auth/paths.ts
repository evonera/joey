/**
 * Resolves an auth view path respecting root-level routes or configured base paths.
 * If basePath is empty or "/", returns `/${viewPath}` without double slashes.
 */
export function resolveAuthPath(basePath?: string, viewPath?: string): string {
  const base = (basePath ?? "").replace(/\/+$/, "");
  const view = (viewPath ?? "").replace(/^\/+/, "");
  if (!base) {
    return `/${view}`;
  }
  return `${base}/${view}`;
}
