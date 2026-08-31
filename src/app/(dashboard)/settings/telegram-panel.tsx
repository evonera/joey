"use client";

import { useEffect, useState } from "react";
import { connectTelegramBot, getTelegramBotStatus } from "@/app/actions/telegram";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function TelegramPanel() {
  const [token, setToken] = useState("");
  const [users, setUsers] = useState("");
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getTelegramBotStatus>>>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void getTelegramBotStatus().then(setStatus); }, []);

  async function connect() {
    const allowedUserIds = users.split(",").map((value) => value.trim()).filter(Boolean).map(Number);
    if (allowedUserIds.some((value) => !Number.isSafeInteger(value) || value <= 0)) { toast.error("Telegram user IDs must be positive integers."); return; }
    setSaving(true);
    const result = await connectTelegramBot(token, allowedUserIds);
    setSaving(false);
    if (result.error) { toast.error(result.error); return; }
    setToken("");
    setStatus(await getTelegramBotStatus());
    toast.success("Telegram bot connected.");
  }

  return <section className="rounded-xl border bg-white p-6 shadow-sm dark:bg-zinc-900">
    <h2 className="font-semibold">Telegram bot</h2>
    <p className="mt-1 text-xs text-zinc-500">Connect a tenant-owned bot. The token is encrypted and never shown again.</p>
    {status && <p className="mt-3 text-sm text-emerald-600">Connected: @{status.username ?? "bot"} · {status.status} · {status.pendingUpdates} pending</p>}
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <Input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="BotFather token" />
      <Input value={users} onChange={(event) => setUsers(event.target.value)} placeholder="Allowed Telegram user IDs, comma separated" />
    </div>
    <Button className="mt-3" disabled={saving || !token.trim()} onClick={connect}>{saving ? "Connecting…" : status ? "Rotate bot token" : "Connect bot"}</Button>
  </section>;
}
