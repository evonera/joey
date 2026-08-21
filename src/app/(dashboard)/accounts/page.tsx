'use client';

import { useState, useEffect } from "react";
import { generateConnectUrl, getConnectedAccounts, disconnectAccount } from "@/app/actions/zernio";
import { Loader2, Plus, Trash2 } from "lucide-react";

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
      alert(error || "Failed to initiate connection");
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm("Are you sure you want to disconnect this account?")) return;
    setDisconnectingId(accountId);
    try {
      const res = await disconnectAccount(accountId);
      if (res.error) {
        alert(res.error);
      } else {
        setAccounts(prev => prev.filter(a => a.id !== accountId));
      }
    } catch (e) {
      alert("Failed to disconnect account");
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connected Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage your connected social media profiles</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 border rounded-xl p-6 bg-white dark:bg-zinc-900 shadow-sm">
          <h2 className="font-semibold mb-4">Connect a Platform</h2>
          <div className="space-y-3">
            {PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                onClick={() => handleConnect(platform.id)}
                disabled={connecting !== null}
                className="flex w-full items-center justify-between p-3 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <span className="font-medium">{platform.name}</span>
                {connecting === platform.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                ) : (
                  <Plus className="h-4 w-4 text-zinc-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-1 md:col-span-2 border rounded-xl p-6 bg-white dark:bg-zinc-900 shadow-sm">
          <h2 className="font-semibold mb-4">Your Accounts</h2>
          
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
              <p className="text-zinc-500 mb-2">No accounts connected yet</p>
              <p className="text-sm text-zinc-400">Select a platform on the left to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center gap-4 p-4 border rounded-lg">
                  {acc.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={acc.avatarUrl} alt={acc.accountName} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 capitalize">
                      {acc.platform.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <p className="font-medium truncate capitalize">{acc.accountName}</p>
                    <p className="text-xs text-zinc-500 capitalize">{acc.platform}</p>
                  </div>
                  <button 
                    onClick={() => handleDisconnect(acc.id)}
                    disabled={disconnectingId === acc.id}
                    className="p-2 text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-50"
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
    </div>
  );
}
