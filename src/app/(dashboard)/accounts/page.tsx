'use client';

import { createElement, useState, useEffect } from "react";
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
import { PLATFORMS } from "@/components/chat/social-platform-selector";

export default function AccountsPage() {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [accountToDisconnect, setAccountToDisconnect] = useState<any | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

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
    setConnectionError(null);
    try {
      const { url, error } = await generateConnectUrl(platform);
      if (url) {
        window.location.assign(url);
        return;
      }
      const message = error || "Failed to initiate connection";
      setConnectionError(message);
      toast.error(message);
    } catch {
      const message = "Couldn’t start the connection. Check the Zernio key in Settings and try again.";
      setConnectionError(message);
      toast.error(message);
    } finally {
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <div className="col-span-1 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5" data-tour="accounts-connect">
          <h2 className="font-semibold text-foreground">Connect a platform</h2>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">Connections open Zernio’s secure provider authorization flow.</p>
          {connectionError ? (
            <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive">
              {connectionError}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                onClick={() => handleConnect(platform.canonicalKey)}
                disabled={connecting !== null}
                className="group flex w-full items-center gap-3 rounded-lg border border-border p-2.5 text-foreground transition-colors hover:border-foreground/20 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                  {createElement(platform.icon, { className: "size-4" })}
                </span>
                <span className="font-medium text-sm">{platform.name}</span>
                {connecting === platform.canonicalKey ? (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Plus className="ml-auto h-4 w-4 text-muted-foreground" />
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
