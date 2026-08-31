'use client';

import { Checkbox } from "@/components/ui/checkbox";

interface PlatformSelectorProps {
  accounts: any[];
  selectedAccountIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function PlatformSelector({
  accounts,
  selectedAccountIds,
  onSelectionChange,
}: PlatformSelectorProps) {
  
  const handleToggle = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedAccountIds, id]);
    } else {
      onSelectionChange(selectedAccountIds.filter((accountId) => accountId !== id));
    }
  };

  return (
    <div className="space-y-4">
      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">No social accounts connected. Connect an account in Settings first.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {accounts.map((acc) => {
            const isSelected = selectedAccountIds.includes(acc.id);
            return (
              <label
                key={acc.id}
                className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                  isSelected ? 'border-zinc-900 bg-zinc-50 dark:border-white dark:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900'
                }`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => handleToggle(acc.id, checked as boolean)}
                />
                <div className="flex items-center gap-2 overflow-hidden">
                  {acc.avatarUrl ? (
                    <img src={acc.avatarUrl} alt={acc.accountName} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 text-xs font-semibold capitalize">
                      {acc.platform.charAt(0)}
                    </div>
                  )}
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium truncate capitalize">{acc.accountName}</span>
                    <span className="text-xs text-zinc-500 capitalize">{acc.platform}</span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
