'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import { getDrafts, getDraftCounts, bulkApproveDrafts, bulkRejectDrafts, bulkDeleteDrafts } from "@/app/actions/drafts";
import Link from "next/link";
import { DraftCard } from "@/components/draft-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Search, 
  Trash2, 
  CheckCheck, 
  XCircle, 
  Loader2, 
  Sparkles,
  PenSquare
} from "lucide-react";

const PLATFORMS = [
  { id: "all", label: "All Platforms" },
  { id: "x", label: "𝕏 / Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "threads", label: "Threads" },
  { id: "facebook", label: "Facebook" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
];

export default function DraftsPage() {
    const [drafts, setDrafts] = useState<any[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({
        all: 0,
        pending_review: 0,
        scheduled: 0,
        approved: 0,
        published: 0,
        failed: 0,
        rejected: 0,
    });
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("pending_review");
    const [platformFilter, setPlatformFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    
    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    
    // Bulk reject modal
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [rejectFeedback, setRejectFeedback] = useState("");
    
    // Bulk delete modal
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const refreshCounts = useCallback(async () => {
        const res = await getDraftCounts();
        if (res.counts) {
            setCounts(res.counts);
        }
    }, []);

    const fetchDrafts = useCallback(async () => {
        setLoading(true);
        const res = await getDrafts(statusFilter, platformFilter, searchQuery);
        if (res.drafts) {
            setDrafts(res.drafts);
            // Clear selections that are no longer visible
            setSelectedIds(prev => {
                const visibleIds = new Set(res.drafts.map((d: any) => d.id));
                const next = new Set<string>();
                prev.forEach(id => {
                    if (visibleIds.has(id)) next.add(id);
                });
                return next;
            });
        }
        setLoading(false);
    }, [statusFilter, platformFilter, searchQuery]);

    useEffect(() => {
        refreshCounts();
    }, [refreshCounts]);

    useEffect(() => {
        fetchDrafts();
    }, [fetchDrafts]);

    const handleActionComplete = useCallback(() => {
        fetchDrafts();
        refreshCounts();
    }, [fetchDrafts, refreshCounts]);

    const tabs = useMemo(() => [
        { id: "pending_review", label: "Pending", count: counts.pending_review },
        { id: "scheduled", label: "Scheduled", count: counts.scheduled },
        { id: "approved", label: "Approved", count: counts.approved },
        { id: "published", label: "Published", count: counts.published },
        { id: "failed", label: "Failed", count: counts.failed },
        { id: "rejected", label: "Rejected", count: counts.rejected },
        { id: "all", label: "All", count: counts.all },
    ], [counts]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === drafts.length && drafts.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(drafts.map(d => d.id)));
        }
    };

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0) return;
        setBulkLoading(true);
        const ids = Array.from(selectedIds);
        const res = await bulkApproveDrafts(ids);
        setBulkLoading(false);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success(`Approved ${ids.length} draft${ids.length > 1 ? "s" : ""}`);
            setSelectedIds(new Set());
            handleActionComplete();
        }
    };

    const handleBulkReject = async () => {
        if (selectedIds.size === 0) return;
        setBulkLoading(true);
        const ids = Array.from(selectedIds);
        const res = await bulkRejectDrafts(ids, rejectFeedback.trim() || undefined);
        setBulkLoading(false);
        setRejectDialogOpen(false);
        setRejectFeedback("");
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success(`Rejected ${ids.length} draft${ids.length > 1 ? "s" : ""}`);
            setSelectedIds(new Set());
            handleActionComplete();
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        setBulkLoading(true);
        const ids = Array.from(selectedIds);
        const res = await bulkDeleteDrafts(ids);
        setBulkLoading(false);
        setDeleteDialogOpen(false);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success(`Deleted ${ids.length} draft${ids.length > 1 ? "s" : ""}`);
            setSelectedIds(new Set());
            handleActionComplete();
        }
    };

    const isAllSelected = drafts.length > 0 && selectedIds.size === drafts.length;
    const isSomeSelected = selectedIds.size > 0 && selectedIds.size < drafts.length;

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Drafts</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Review, edit, approve, and manage AI-generated drafts before publication.
                    </p>
                </div>
                <Button asChild size="sm" className="gap-1.5 self-start sm:self-auto">
                    <Link href="/compose">
                        <PenSquare className="w-4 h-4" />
                        Compose New
                    </Link>
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex border-b overflow-x-auto scrollbar-none gap-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            setStatusFilter(tab.id);
                            setSelectedIds(new Set());
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 border-b-2 whitespace-nowrap text-sm font-medium transition-colors ${
                            statusFilter === tab.id 
                                ? "border-primary text-primary font-semibold" 
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <span>{tab.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${
                            statusFilter === tab.id
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                        }`}>
                            {tab.count ?? 0}
                        </span>
                    </button>
                ))}
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search drafts by content..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
                <div className="w-full sm:w-48">
                    <Select value={platformFilter} onValueChange={setPlatformFilter}>
                        <SelectTrigger className="h-9">
                            <SelectValue placeholder="All Platforms" />
                        </SelectTrigger>
                        <SelectContent>
                            {PLATFORMS.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Bulk Actions Header / Floating Toolbar */}
            {drafts.length > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-lg border text-sm">
                    <div className="flex items-center gap-2">
                        <Checkbox 
                            checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                            onCheckedChange={toggleSelectAll}
                            id="select-all-drafts"
                        />
                        <label 
                            htmlFor="select-all-drafts" 
                            className="text-xs font-medium cursor-pointer select-none text-muted-foreground"
                        >
                            {selectedIds.size > 0 
                                ? `${selectedIds.size} of ${drafts.length} selected`
                                : `Select all (${drafts.length})`
                            }
                        </label>
                    </div>

                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2">
                            <Button 
                                size="sm" 
                                variant="default"
                                disabled={bulkLoading}
                                onClick={handleBulkApprove}
                                className="h-7 text-xs gap-1"
                            >
                                {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                                Approve ({selectedIds.size})
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline"
                                disabled={bulkLoading}
                                onClick={() => setRejectDialogOpen(true)}
                                className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                            >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject ({selectedIds.size})
                            </Button>
                            <Button 
                                size="sm" 
                                variant="ghost"
                                disabled={bulkLoading}
                                onClick={() => setDeleteDialogOpen(true)}
                                className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Drafts List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-sm">Loading drafts...</span>
                    </div>
                ) : drafts.length === 0 ? (
                    <div className="text-center py-16 px-4 bg-muted/20 dark:bg-zinc-900/50 rounded-xl border border-dashed">
                        <p className="text-muted-foreground mb-6 font-medium">
                            No {statusFilter.replace('_', ' ')} drafts found
                            {platformFilter !== "all" ? ` for ${PLATFORMS.find(p => p.id === platformFilter)?.label}` : ""}
                            {searchQuery ? ` matching "${searchQuery}"` : ""}.
                        </p>
                        {statusFilter === "pending_review" && (
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                                    Ask Joey to draft content
                                </p>
                                <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                                    <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-full transition-colors border">
                                        Draft a thread about our new launch
                                    </Link>
                                    <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-full transition-colors border">
                                        Summarize our latest article for LinkedIn
                                    </Link>
                                    <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-full transition-colors border">
                                        Write a punchy tweet about tech trends
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    drafts.map(draft => (
                        <DraftCard 
                            key={draft.id} 
                            draft={draft} 
                            onActionComplete={handleActionComplete}
                            selectable={true}
                            selected={selectedIds.has(draft.id)}
                            onToggleSelect={() => toggleSelect(draft.id)}
                        />
                    ))
                )}
            </div>

            {/* Bulk Reject Dialog */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject {selectedIds.size} Drafts</DialogTitle>
                        <DialogDescription>
                            Provide feedback explaining why these drafts are being rejected. This feedback helps your agent generate better content next time.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea 
                        placeholder="Optional feedback for Joey (e.g. tone is too promotional, inaccurate metrics...)"
                        value={rejectFeedback}
                        onChange={(e) => setRejectFeedback(e.target.value)}
                        className="min-h-[100px]"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            variant="destructive" 
                            onClick={handleBulkReject}
                            disabled={bulkLoading}
                        >
                            {bulkLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Reject Drafts
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Delete Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {selectedIds.size} Drafts?</DialogTitle>
                        <DialogDescription>
                            This will permanently remove the selected drafts. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            variant="destructive" 
                            onClick={handleBulkDelete}
                            disabled={bulkLoading}
                        >
                            {bulkLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete Permanently
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

