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
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5 p-0 sm:space-y-6 sm:p-8">
      <div className="mx-auto max-w-md px-1 pt-2 text-center sm:mb-8 sm:p-0">
        <h1 className="text-2xl font-bold tracking-tight">Create a Theme Page</h1>
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
