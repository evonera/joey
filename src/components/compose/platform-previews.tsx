'use client';

import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface PlatformPreviewsProps {
  content: string;
  media: string[];
  selectedAccounts: any[];
}

export function PlatformPreviews({ content, media, selectedAccounts }: PlatformPreviewsProps) {
  if (!selectedAccounts || selectedAccounts.length === 0) {
    return null;
  }

  // Fallback if no content/media
  const displayContent = content || "Start typing to preview your post...";

  return (
    <div className="w-full">
      <Tabs defaultValue={selectedAccounts[0]?.platform || "unknown"}>
        <TabsList className="mb-4">
          {selectedAccounts.map((acc) => (
            <TabsTrigger key={acc.id} value={acc.platform} className="capitalize">
              {acc.platform}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {selectedAccounts.map((acc) => (
          <TabsContent key={acc.id} value={acc.platform}>
            <div className="border rounded-lg bg-zinc-50 dark:bg-zinc-900 p-6 flex justify-center">
              {/* Mock Social Media Card */}
              <Card className="w-full max-w-sm overflow-hidden bg-white dark:bg-black shadow-sm rounded-xl">
                <div className="p-4 flex gap-3">
                  {acc.avatarUrl ? (
                    <img src={acc.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  )}
                  <div>
                    <p className="font-semibold text-sm leading-tight">{acc.accountName || "Your Account"}</p>
                    <p className="text-xs text-zinc-500">Just now</p>
                  </div>
                </div>
                
                <div className="px-4 pb-3">
                  <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
                </div>
                
                {media && media.length > 0 && (
                  <div className="w-full aspect-video bg-zinc-100 dark:bg-zinc-800">
                    <img src={media[0]} alt="Attached media" className="w-full h-full object-cover" />
                  </div>
                )}
                
                <div className="p-3 border-t flex justify-around text-zinc-400">
                  <div className="h-4 w-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-4 w-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-4 w-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                </div>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
