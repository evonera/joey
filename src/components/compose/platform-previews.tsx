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
      <Tabs defaultValue={selectedAccounts[0]?.id}>
        <TabsList className="mb-4 flex flex-wrap gap-1">
          {selectedAccounts.map((acc) => (
            <TabsTrigger key={acc.id} value={acc.id} className="capitalize flex items-center gap-1.5 text-xs">
              <span className="font-medium">{acc.platform}</span>
              {acc.accountName && (
                <span className="text-[10px] text-muted-foreground font-normal truncate max-w-[100px]">
                  (@{acc.accountName})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {selectedAccounts.map((acc) => (
          <TabsContent key={acc.id} value={acc.id}>
            <div className="border rounded-xl bg-zinc-50 dark:bg-zinc-900/50 p-6 flex justify-center">
              {/* Mock Social Media Card */}
              <Card className="w-full max-w-md overflow-hidden bg-card shadow-sm rounded-2xl border">
                <div className="p-4 flex gap-3">
                  {acc.avatarUrl ? (
                    <img src={acc.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm uppercase">
                      {(acc.accountName || acc.platform || "U")[0]}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-sm leading-tight text-foreground">{acc.accountName || "Your Account"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{acc.platform} &middot; Preview</p>
                  </div>
                </div>
                
                <div className="px-4 pb-3">
                  <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{displayContent}</p>
                </div>
                
                {media && media.length > 0 && (
                  <div className={`w-full ${media.length > 1 ? "grid grid-cols-2 gap-1 px-4 pb-3" : ""}`}>
                    {media.slice(0, 4).map((url, i) => {
                      const isVideo = /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(url);
                      return (
                        <div key={url} className={`relative overflow-hidden rounded-lg bg-muted ${media.length === 1 ? "aspect-video" : "aspect-square"}`}>
                          {isVideo ? (
                            <video src={url} controls className="w-full h-full object-cover" />
                          ) : (
                            <img src={url} alt={`Media ${i + 1}`} className="w-full h-full object-cover" />
                          )}
                          {i === 3 && media.length > 4 && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg">
                              +{media.length - 4}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                <div className="p-3 border-t flex justify-around text-xs text-muted-foreground">
                  <span className="hover:text-foreground cursor-pointer transition-colors">&hearts; Like</span>
                  <span className="hover:text-foreground cursor-pointer transition-colors">&#128172; Comment</span>
                  <span className="hover:text-foreground cursor-pointer transition-colors">&#8646; Repost</span>
                  <span className="hover:text-foreground cursor-pointer transition-colors">&#8679; Share</span>
                </div>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
