'use client';

import { useState } from "react";
import Link from "next/link";
import { updateDraft, approveDraft, rejectDraft, deleteDraft } from "@/app/actions/drafts";
import { publishDraft } from "@/app/actions/publisher";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "./ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import { 
  Delete02Icon as Trash2, 
  Calendar03Icon as Calendar, 
  NoteEditIcon as Edit, 
  CheckmarkCircle02Icon as Check, 
  Loading03Icon as Loader2,
  SentIcon as Send,
  Cancel01Icon as X,
  Comment01Icon as MessageSquare
} from "hugeicons-react";
import { DraftReviewRoom, useDraftCollaboration } from "@/components/drafts/draft-review-room";
import { DraftComments } from "@/components/drafts/draft-comments";
import { useLiveblocksConfig } from "@/components/collaboration/liveblocks-provider";
import { useThreads, useIsInsideRoom } from "@liveblocks/react";

interface DraftCardProps {
  draft: any;
  onActionComplete: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

function InnerDraftCommentBadge({ draftId }: { draftId: string }) {
  const { threads } = useThreads();
  const count = (threads || []).filter(
    (t) => !t.metadata?.draftId || t.metadata.draftId === draftId
  ).length;
  if (count === 0) return null;
  return (
    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
      {count}
    </span>
  );
}

function DraftCommentBadge({ draftId }: { draftId: string }) {
  const { isConfigured } = useLiveblocksConfig();
  const isInside = useIsInsideRoom();
  if (!isConfigured || !isInside) return null;
  return <InnerDraftCommentBadge draftId={draftId} />;
}

function InnerDraftCard({ draft, onActionComplete, selectable, selected, onToggleSelect }: DraftCardProps) {
    const { isConfigured } = useLiveblocksConfig();
    const { broadcastApproval, broadcastRejection, broadcastUpdate } = useDraftCollaboration();
    const [isEditing, setIsEditing] = useState(false);
    const [content, setContent] = useState(draft.content || "");
    const [isRejecting, setIsRejecting] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [loading, setLoading] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isCommentsOpen, setIsCommentsOpen] = useState(false);

    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const hasVariants = Array.isArray(draft.variants) && draft.variants.length > 0;
    const [selectedVariant, setSelectedVariant] = useState(hasVariants ? draft.variants[0].name : "");
    const [variantEdits, setVariantEdits] = useState<Record<string, string>>({});

    const platformOpts = draft.platformOptions as any;
    const platform = platformOpts?.platform || "Universal";
    const mediaUrls: string[] = platformOpts?.mediaUrls || [];

    const isScheduled = Boolean(draft.scheduledFor) && (draft.status === "scheduled" || draft.status === "approved");

    const handleApprove = async (variantName?: string, contentToApprove?: string) => {
        setLoading(true);
        setIsSheetOpen(false);
        const res = await approveDraft(draft.id, variantName, contentToApprove);
        setLoading(false);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success("Draft approved");
            broadcastApproval(variantName);
            onActionComplete();
        }
    };

    const handlePublish = async () => {
        setLoading(true);
        const res = await publishDraft(draft.id);
        setLoading(false);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success("Draft published successfully!");
            onActionComplete();
        }
    };

    const handleReject = async () => {
        if (!feedback.trim()) return;
        setLoading(true);
        const res = await rejectDraft(draft.id, feedback);
        setLoading(false);
        setIsRejecting(false);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success("Draft rejected with feedback");
            broadcastRejection(feedback);
            onActionComplete();
        }
    };

    const handleSaveEdit = async () => {
        setLoading(true);
        const res = await updateDraft(draft.id, content);
        setLoading(false);
        setIsEditing(false);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success("Draft updated");
            broadcastUpdate();
            onActionComplete();
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        const res = await deleteDraft(draft.id);
        setLoading(false);
        setDeleteDialogOpen(false);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success("Draft deleted");
            onActionComplete();
        }
    };

    const currentVariantContent = variantEdits[selectedVariant] ?? 
      draft.variants?.find((v: any) => v.name === selectedVariant)?.content ?? "";

    return (
        <div className={`border rounded-2xl p-5 bg-card shadow-sm flex flex-col gap-4 transition-all hover:border-primary/30 ${selected ? "border-primary ring-1 ring-primary bg-primary/5" : ""}`}>
            {/* Header */}
            <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-2.5">
                    {selectable && (
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={onToggleSelect}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                    )}
                    {platformOpts?.isThemePackage ? (
                        <Link 
                            href={`/theme-studio/${platformOpts.themePageId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#ffe633]/15 text-[#ffe633] border border-[#ffe633]/30 px-2.5 py-1 rounded-md hover:bg-[#ffe633]/25 transition-colors cursor-pointer"
                            title="View Theme Page in Theme Studio"
                        >
                            <span>🎨 Theme: {platformOpts.themePageName || "Theme Channel"}</span>
                        </Link>
                    ) : platformOpts?.source === "flows" || platformOpts?.flowRunId ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-md">
                            <span>⚡ Flow Automation</span>
                        </span>
                    ) : (
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
                            {platform}
                        </span>
                    )}
                    {isScheduled && draft.scheduledFor && (
                        <Badge variant="outline" className="text-[11px] gap-1 font-normal text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(draft.scheduledFor).toLocaleString(undefined, { 
                                month: "short", day: "numeric", hour: "numeric", minute: "2-digit" 
                            })}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant={
                        draft.status === "approved" || draft.status === "scheduled" ? "default" :
                        draft.status === "published" ? "secondary" :
                        draft.status === "failed" || draft.status === "rejected" ? "destructive" : "outline"
                    } className="text-[11px] capitalize">
                        {draft.status.replace("_", " ")}
                    </Badge>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsCommentsOpen(true)}
                        disabled={loading}
                        className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        title="Team comments & review"
                    >
                        <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={loading}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete draft"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            
            {/* Content or Edit Form */}
            {isEditing ? (
                <div className="space-y-3">
                    <Textarea 
                        value={content} 
                        onChange={(e) => setContent(e.target.value)}
                        className="min-h-[140px] text-sm leading-relaxed"
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleSaveEdit} disabled={loading}>
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Save Changes
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                    {draft.content ? (
                        draft.content
                    ) : hasVariants ? (
                        <div className="italic text-muted-foreground bg-muted/30 p-3 rounded-xl border border-dashed text-xs">
                            Multiple draft variations generated. Click <strong>Review & Edit Variants</strong> to select and adjust copy.
                        </div>
                    ) : (
                        <span className="italic text-muted-foreground">No text content available</span>
                    )}
                </div>
            )}

            {/* Media Attachment Previews */}
            {mediaUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                    {mediaUrls.map((url, i) => {
                        const isVideo = /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(url);
                        return (
                            <div key={url} className="relative rounded-lg overflow-hidden border bg-muted h-16 w-16 group">
                                {isVideo ? (
                                    <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                        VIDEO
                                    </div>
                                ) : (
                                    <img src={url} alt={`Media ${i + 1}`} className="h-full w-full object-cover" />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Rejection / Failure Feedback */}
            {draft.errorMessage && (draft.status === 'rejected' || draft.status === 'failed') && (
                <div className="bg-destructive/10 text-destructive border border-destructive/20 p-3 rounded-xl text-xs space-y-1">
                    <strong>{draft.status === 'failed' ? 'Publish Error:' : 'Feedback:'}</strong> {draft.errorMessage}
                </div>
            )}

            {/* Approved Draft Actions */}
            {!isEditing && !isRejecting && (draft.status === 'approved' || draft.status === 'scheduled') && (
                <div className="flex gap-2 pt-2 border-t border-border">
                    <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" disabled={loading} className="gap-1 text-xs">
                        <Edit className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button onClick={handlePublish} disabled={loading} size="sm" className="flex-1 font-semibold text-xs">
                        {loading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Publishing...</> : isScheduled ? "Publish Early" : "Publish Now"}
                    </Button>
                </div>
            )}

            {/* Failed Retry */}
            {draft.status === 'failed' && (
                <div className="flex gap-2 pt-2 border-t border-border">
                    <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" disabled={loading} className="gap-1 text-xs">
                        <Edit className="h-3.5 w-3.5" /> Edit Post
                    </Button>
                    <Button onClick={handlePublish} disabled={loading} size="sm" className="flex-1 font-semibold text-xs">
                        {loading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Retrying...</> : "Retry Publish"}
                    </Button>
                </div>
            )}

            {/* Pending Review Actions */}
            {!isEditing && !isRejecting && draft.status === 'pending_review' && (
                <div className="flex gap-2 pt-2 border-t border-border">
                    {hasVariants ? (
                        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                            <SheetTrigger asChild>
                                <Button size="sm" className="flex-1 font-semibold text-xs">Review & Edit Variants</Button>
                            </SheetTrigger>
                            <SheetContent className="sm:max-w-xl overflow-y-auto">
                                <SheetHeader className="mb-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <SheetTitle className="text-base">Review & Edit Variants</SheetTitle>
                                            <SheetDescription className="text-xs">
                                                Edit text directly before approving your preferred variant.
                                            </SheetDescription>
                                        </div>
                                        <Select value={selectedVariant} onValueChange={setSelectedVariant}>
                                            <SelectTrigger className="w-[160px] h-8 text-xs">
                                                <SelectValue placeholder="Select variant" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {draft.variants.map((v: any) => (
                                                    <SelectItem key={v.name} value={v.name} className="text-xs">{v.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </SheetHeader>
                                
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            Variant Content (Editable)
                                        </label>
                                        <Textarea
                                            value={currentVariantContent}
                                            onChange={(e) => setVariantEdits(prev => ({ ...prev, [selectedVariant]: e.target.value }))}
                                            className="min-h-[180px] text-sm leading-relaxed"
                                        />
                                    </div>
                                    
                                    {draft.variants.find((v: any) => v.name === selectedVariant)?.context?.length > 0 && (
                                        <div className="py-3 border-t border-b border-border space-y-2">
                                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Retrieved Context</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {draft.variants.find((v: any) => v.name === selectedVariant).context.map((ctx: any, idx: number) => (
                                                    <span key={idx} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20 flex items-center gap-1">
                                                        {ctx.title || "Source"}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <Button 
                                        onClick={() => handleApprove(selectedVariant, currentVariantContent)} 
                                        disabled={loading || !currentVariantContent.trim()}
                                        className="w-full font-semibold text-xs"
                                    >
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
                                        Approve &quot;{selectedVariant}&quot; Variant
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    ) : (
                        <Button onClick={() => handleApprove()} disabled={loading} size="sm" className="flex-1 font-semibold text-xs">
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                            Approve
                        </Button>
                    )}
                    
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setIsCommentsOpen(true)} 
                        disabled={loading} 
                        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        title="Discuss or suggest revisions"
                    >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Comments
                        <DraftCommentBadge draftId={draft.id} />
                    </Button>
                    {(!hasVariants || draft.content) && (
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} disabled={loading} className="text-xs">
                            Edit
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setIsRejecting(true)} disabled={loading} className="text-destructive hover:bg-destructive/10 text-xs">
                        Reject
                    </Button>
                </div>
            )}

            {/* Rejection Feedback Box */}
            {isRejecting && (
                <div className="space-y-3 pt-2 border-t border-border">
                    <Textarea 
                        placeholder="Provide feedback for the agent on why this was rejected..." 
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="text-xs min-h-[80px]"
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setIsRejecting(false)} className="text-xs">Cancel</Button>
                        <Button variant="destructive" size="sm" onClick={handleReject} disabled={loading || !feedback.trim()} className="text-xs">
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Send Feedback
                        </Button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this draft?</DialogTitle>
                        <DialogDescription className="text-xs">
                            This action cannot be undone. This post will be permanently removed from your queue.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Delete Draft
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Team Comments Sheet */}
            <Sheet open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
                <SheetContent className="sm:max-w-md overflow-y-auto">
                    <SheetHeader className="mb-4">
                        <SheetTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-primary" />
                            Draft Review & Comments
                        </SheetTitle>
                        <SheetDescription className="text-xs">
                            Real-time feedback, revision requests, and team discussion.
                        </SheetDescription>
                    </SheetHeader>
                    <DraftComments draftId={draft.id} />
                </SheetContent>
            </Sheet>
        </div>
    );
}

export function DraftCard(props: DraftCardProps) {
    return (
        <DraftReviewRoom draftId={props.draft.id} onActionComplete={props.onActionComplete}>
            <InnerDraftCard {...props} />
        </DraftReviewRoom>
    );
}
