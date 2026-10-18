import { z } from "zod";
import type { FlowGraphDoc } from "./types";

export const themeRecipeModeSchema = z.enum(["draft_only", "publishing"]);
export type ThemeRecipeMode = z.infer<typeof themeRecipeModeSchema>;

/** Legacy recipes retain their publishing-account validation on recompilation. */
export function themeRecipeMode(graph: FlowGraphDoc | null | undefined): ThemeRecipeMode {
  return graph?.nodes.find((node) => node.type === "action.theme_studio_run")?.config.mode === "draft_only"
    ? "draft_only"
    : "publishing";
}
