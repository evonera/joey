'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bookmark01Icon as BookMarked, Clock01Icon as Clock3, PlusSignIcon as Plus, Delete02Icon as Trash2, GitForkIcon as Workflow } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createFlow, listFlows, deleteFlow, type FlowRow } from "@/app/actions/flows";

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await listFlows();
      setFlows(res.flows);
    } catch {
      toast.error("Failed to load flows");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    const res = await createFlow(newName);
    if (res.flow) {
      router.push(`/flows/${res.flow.id}`);
    } else toast.error(res.error ?? "Failed");
  }

  async function handleDelete(id: string) {
    const res = await deleteFlow(id);
    if (res.ok) { setFlows((f) => f.filter((x) => x.id !== id)); toast.success("Deleted"); }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto pb-24">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Flows</h1>
          <p className="text-muted-foreground mt-1">Compose automations: triggers → AI steps → drafts awaiting your approval.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/flows/templates">
            <Button variant="outline"><BookMarked className="mr-1.5 h-4 w-4" />Templates</Button>
          </Link>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1.5 h-4 w-4" />New flow</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Name your flow</DialogTitle></DialogHeader>
              <Input
                autoFocus placeholder="e.g. Competitor watch" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newName.trim() && handleCreate()}
              />
              <Button disabled={!newName.trim()} onClick={handleCreate}>Create</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8">Loading…</p>
      ) : flows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-12 text-center">
          <Workflow className="h-10 w-10 text-zinc-300 dark:text-zinc-700" />
          <p className="font-medium">No flows yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Create one from scratch or install a ready-made template like “Competitor Intelligence”.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {flows.map((flow) => (
            <div key={flow.id} className="group relative rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <Link href={`/flows/${flow.id}`} className="block">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-semibold group-hover:text-[#ffe633] transition-colors">{flow.name}</h2>
                  <Badge variant={flow.status === "active" ? "default" : "secondary"} className="text-[10px]">{flow.status}</Badge>
                </div>
                {flow.description && <p className="text-sm text-muted-foreground line-clamp-2">{flow.description}</p>}
                <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3 w-3" />
                  {flow.lastRunAt ? `Last run ${new Date(flow.lastRunAt).toLocaleString()}` : "Never run"}
                </p>
              </Link>
              <button
                aria-label={`Delete ${flow.name}`}
                onClick={() => handleDelete(flow.id)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
