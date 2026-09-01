import * as React from "react";
import { getContentFormats } from "@/app/actions/theme-content-formats";
import { ThemePageWizard } from "@/components/theme-studio/ThemePageWizard";

export default async function NewThemePage() {
  const formatsRes = await getContentFormats();
  const availableFormats = formatsRes.formats || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="text-center max-w-md mx-auto mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Create Niche Theme Page</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Configure trusted sources, daily content mix, and deterministic brand formatting.
        </p>
      </div>

      <ThemePageWizard availableFormats={availableFormats} />
    </div>
  );
}
