'use client';

import { useState, useEffect } from "react";
import { generateConnectUrl, getConnectedAccounts, disconnectAccount } from "@/app/actions/zernio";
import { Loading03Icon as Loader2, PlusSignIcon as Plus, Delete02Icon as Trash2 } from "hugeicons-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PLATFORMS = [
  { id: "twitter", name: "X (Twitter)" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "facebook", name: "Facebook" },
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
  { id: "youtube", name: "YouTube" },
  { id: "pinterest", name: "Pinterest" },
  { id: "reddit", name: "Reddit" },
];

export default function AccountsPage() {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [accountToDisconnect, setAccountToDisconnect] = useState<any | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await getConnectedAccounts();
      if (res.accounts) {
        setAccounts(res.accounts);
      }
    } catch (e) {
      console.error("Failed to fetch accounts", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (platform: string) => {
    setConnecting(platform);
    const { url, error } = await generateConnectUrl(platform);
    if (url) {
      window.location.assign(url);
    } else {
      toast.error(error || "Failed to initiate connection");
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    setDisconnectingId(accountId);
    try {
      const res = await disconnectAccount(accountId);
      if (res.error) {
        toast.error(res.error);
      } else {
        setAccounts(prev => prev.filter(a => a.id !== accountId));
        toast.success("Account disconnected");
      }
    } catch (e) {
      toast.error("Failed to disconnect account");
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connected Accounts</h1>
        <p className="text-muted-foreground mt-1">Manage your connected social media profiles</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 border border-border rounded-xl p-6 bg-card shadow-xs">
          <h2 className="font-semibold mb-4 text-foreground">Connect a Platform</h2>
          <div className="space-y-3">
            {PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                onClick={() => handleConnect(platform.id)}
                disabled={connecting !== null}
                className="flex w-full items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50 text-foreground cursor-pointer"
              >
                <span className="font-medium text-sm">{platform.name}</span>
                {connecting === platform.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Plus className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-1 md:col-span-2 border border-border rounded-xl p-6 bg-card shadow-xs">
          <h2 className="font-semibold mb-4 text-foreground">Your Accounts</h2>
          
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl bg-muted/20">
              <p className="text-muted-foreground font-medium mb-1">No accounts connected yet</p>
              <p className="text-xs text-muted-foreground">Select a platform on the left to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center gap-3 p-4 border border-border rounded-lg bg-background/50 hover:bg-muted/30 transition-colors">
                  {acc.avatarUrl ? (
                    <img src={acc.avatarUrl} alt={acc.accountName || ""} className="h-10 w-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground capitalize text-sm font-semibold">
                      {acc.platform.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate capitalize text-foreground">{acc.accountName}</p>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Connected
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">{acc.platform}</p>
                  </div>
                  <button 
                    onClick={() => setAccountToDisconnect(acc)}
                    disabled={disconnectingId === acc.id}
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 cursor-pointer rounded-md hover:bg-muted"
                    aria-label={`Disconnect ${acc.accountName || acc.platform}`}
                  >
                    {disconnectingId === acc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!accountToDisconnect} onOpenChange={(open) => !open && setAccountToDisconnect(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect {accountToDisconnect?.accountName || accountToDisconnect?.platform}? Joey will no longer be able to publish or engage with this account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAccountToDisconnect(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!disconnectingId}
              onClick={() => {
                if (accountToDisconnect) {
                  const id = accountToDisconnect.id;
                  setAccountToDisconnect(null);
                  handleDisconnect(id);
                }
              }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
