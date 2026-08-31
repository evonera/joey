'use client';

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

interface Entity {
  id: string;
  name: string;
  picture?: string;
  address?: string;
}

interface EntitySelectorProps {
  platform: string;
  entities: Entity[];
  onSelect: (entityId: string) => void;
}

export function EntitySelector({ platform, entities, onSelect }: EntitySelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getEntityLabel = () => {
    switch (platform) {
      case "facebook": return "Facebook Page";
      case "linkedin": return "LinkedIn Organization";
      case "pinterest": return "Pinterest Board";
      case "googlebusiness": return "Business Location";
      default: return "Account";
    }
  };

  const handleSubmit = () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    onSelect(selectedId);
  };

  if (entities.length === 0) {
    return (
      <div className="py-8 text-center text-zinc-500">
        <p>No {getEntityLabel().toLowerCase()}s found.</p>
        <p className="mt-2 text-sm">Make sure you have the required permissions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 mb-4 text-left">
        Select a {getEntityLabel().toLowerCase()} to connect
      </p>

      <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
        {entities.map((entity) => (
          <button
            key={entity.id}
            onClick={() => setSelectedId(entity.id)}
            disabled={isSubmitting}
            className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
              selectedId === entity.id
                ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20"
                : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            } ${isSubmitting ? "opacity-50" : ""}`}
          >
            {entity.picture ? (
              <img
                src={entity.picture}
                alt={entity.name}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                {entity.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{entity.name}</p>
              {entity.address && (
                <p className="truncate text-sm text-zinc-500">{entity.address}</p>
              )}
            </div>
            {selectedId === entity.id && (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-600" />
            )}
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!selectedId || isSubmitting}
        className="mt-6 flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          `Connect ${getEntityLabel()}`
        )}
      </button>
    </div>
  );
}
