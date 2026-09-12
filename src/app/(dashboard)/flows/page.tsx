'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bookmark01Icon as BookMarked, Clock01Icon as Clock3, PlusSignIcon as Plus, Delete02Icon as Trash2, GitForkIcon as Workflow } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createFlow, listFlows, deleteFlow, type FlowRow } from "@/app/actions/flows";

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [flowToDelete, setFlowToDelete] = useState<FlowRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const creating = useRef(false);
  const deleting = useRef(false);

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
    if (!newName.trim() || creating.current) return;
    creating.current = true;
    setIsCreating(true);
    try {
      const res = await createFlow(newName.trim());
      if (res.flow) {
        setNewOpen(false);
        router.push(`/flows/${res.flow.id}`);
      } else toast.error(res.error ?? "Failed to create flow");
    } catch { toast.error("Failed to create flow. Please try again."); }
    finally { creating.current = false; setIsCreating(false); }
  }

  async function confirmDelete() {
    if (!flowToDelete || deleting.current) return;
    deleting.current = true;
    setIsDeleting(true);
    try {
      const res = await deleteFlow(flowToDelete.id);
      if (res.ok) {
        setFlows((f) => f.filter((x) => x.id !== flowToDelete.id));
        toast.success(`Flow "${flowToDelete.name}" deleted`);
        setFlowToDelete(null);
      } else toast.error(res.error ?? "Failed to delete flow");
    } catch { toast.error("Failed to delete flow. Please try again."); }
    finally { deleting.current = false; setIsDeleting(false); }
  }

  return (
    <div className="w-full max-w-5xl mx-auto pb-24">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4" data-tour="flows-overview">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Flows</h1>
          <p className="text-muted-foreground mt-1">Build automations with triggers, AI steps, and actions—or start from a template.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link href="/flows/templates" className="flex-1 sm:flex-none">
            <Button variant="outline" className="w-full"><BookMarked className="mr-1.5 h-4 w-4" />Templates</Button>
          </Link>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild><Button className="flex-1 sm:flex-none"><Plus className="mr-1.5 h-4 w-4" />New flow</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Name your flow</DialogTitle><DialogDescription>Give your automation a name you can recognize later.</DialogDescription></DialogHeader>
              <Input
                autoFocus aria-label="Flow name" maxLength={120} disabled={isCreating} placeholder="e.g. Competitor watch" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newName.trim() && handleCreate()}
              />
              <Button disabled={!newName.trim() || isCreating} onClick={handleCreate}>{isCreating ? "Creating…" : "Create"}</Button>
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
                  <h2 className="font-semibold group-hover:text-primary transition-colors">{flow.name}</h2>
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
                onClick={(e) => {
                  e.stopPropagation();
                  setFlowToDelete(flow);
                }}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-100 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(flowToDelete)} onOpenChange={(open) => !open && !isDeleting && setFlowToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Flow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{flowToDelete?.name}&rdquo;? All configuration, history, and scheduled runs for this flow will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={isDeleting} onClick={() => setFlowToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Flow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
