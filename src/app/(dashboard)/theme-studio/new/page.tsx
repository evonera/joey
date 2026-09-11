import * as React from "react";
import { getContentFormats } from "@/app/actions/theme-content-formats";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { ThemePageWizard } from "@/components/theme-studio/ThemePageWizard";

export default async function NewThemePage() {
  const [formatsRes, accountsRes] = await Promise.all([
    getContentFormats(),
    getConnectedAccounts(),
  ]);
  const availableFormats = formatsRes.formats || [];
  const connectedAccounts = accountsRes.accounts || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="text-center max-w-md mx-auto mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Create Niche Theme Page</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Configure publishing channels, trusted sources, daily content mix, and brand templates.
        </p>
      </div>

      <ThemePageWizard 
        availableFormats={availableFormats} 
        initialAccounts={connectedAccounts}
      />
    </div>
  );
}
