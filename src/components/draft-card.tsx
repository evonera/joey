'use client';

import { useState } from "react";
import { updateDraft, approveDraft, rejectDraft } from "@/app/actions/drafts";
import { publishDraft } from "@/app/actions/publisher";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "./ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function DraftCard({ draft, onActionComplete }: { draft: any, onActionComplete: () => void }) {
    const [isEditing, setIsEditing] = useState(false);
    const [content, setContent] = useState(draft.content);
    const [isRejecting, setIsRejecting] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [loading, setLoading] = useState(false);

    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const hasVariants = Array.isArray(draft.variants) && draft.variants.length > 0;
    const [selectedVariant, setSelectedVariant] = useState(hasVariants ? draft.variants[0].name : "");

    const platformOpts = draft.platformOptions as any;
    const platform = platformOpts?.platform || "Unknown";

    const handleApprove = async (variantName?: string, contentToApprove?: string) => {
        setLoading(true);
        setIsSheetOpen(false);
        await approveDraft(draft.id, variantName, contentToApprove);
        setLoading(false);
        onActionComplete();
    };

    const handlePublish = async () => {
        setLoading(true);
        const res = await publishDraft(draft.id);
        setLoading(false);
        if (res.error) {
            alert(res.error);
        } else {
            onActionComplete();
        }
    };

    const handleReject = async () => {
        if (!feedback) return;
        setLoading(true);
        await rejectDraft(draft.id, feedback);
        setLoading(false);
        setIsRejecting(false);
        onActionComplete();
    };

    const handleSaveEdit = async () => {
        setLoading(true);
        await updateDraft(draft.id, content);
        setLoading(false);
        setIsEditing(false);
        onActionComplete();
    };

    return (
        <div className="border rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium uppercase tracking-wider text-zinc-500">{platform}</span>
                <span className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md">{draft.status}</span>
            </div>
            
            {isEditing ? (
                <div className="space-y-2">
                    <Textarea 
                        value={content} 
                        onChange={(e) => setContent(e.target.value)}
                        className="min-h-[120px]"
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleSaveEdit} disabled={loading}>Save</Button>
                    </div>
                </div>
            ) : (
                <div className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap text-sm">
                    {draft.content ? (
                        draft.content
                    ) : hasVariants ? (
                        <div className="italic text-zinc-500">Multiple draft variants generated. Click Review Variants to select one.</div>
                    ) : (
                        <span className="italic text-zinc-400">No content available</span>
                    )}
                </div>
            )}

            {draft.errorMessage && draft.status === 'rejected' && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                    <strong>Feedback:</strong> {draft.errorMessage}
                </div>
            )}

            {!isEditing && !isRejecting && draft.status === 'approved' && (
                <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <Button onClick={handlePublish} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                        {loading ? "Publishing..." : "Publish Now"}
                    </Button>
                </div>
            )}

            {draft.status === 'failed' && (
                <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-100">
                        <strong>Publish Failed:</strong> {draft.errorMessage || "Unknown error occurred"}
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handlePublish} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                            {loading ? "Retrying..." : "Retry Publish"}
                        </Button>
                    </div>
                </div>
            )}

            {!isEditing && !isRejecting && draft.status === 'pending_review' && (
                <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    {hasVariants ? (
                        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                            <SheetTrigger asChild>
                                <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">Review Variants</Button>
                            </SheetTrigger>
                            <SheetContent className="sm:max-w-xl overflow-y-auto">
                                <SheetHeader className="mb-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <SheetTitle>Review Draft Variants</SheetTitle>
                                            <SheetDescription>
                                                Your agent generated multiple variations for this post.
                                            </SheetDescription>
                                        </div>
                                        <Select value={selectedVariant} onValueChange={setSelectedVariant}>
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue placeholder="Select variant" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {draft.variants.map((v: any) => (
                                                    <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </SheetHeader>
                                
                                {draft.variants.map((v: any) => v.name === selectedVariant && (
                                    <div key={v.name} className="mt-4 space-y-4">
                                        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg border whitespace-pre-wrap text-sm min-h-[150px]">
                                            {v.content}
                                        </div>
                                        <Button 
                                            onClick={() => handleApprove(v.name, v.content)} 
                                            disabled={loading}
                                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                                        >
                                            {loading ? "Approving..." : `Approve ${v.name} Variant`}
                                        </Button>
                                    </div>
                                ))}
                            </SheetContent>
                        </Sheet>
                    ) : (
                        <Button onClick={() => handleApprove()} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white">Approve</Button>
                    )}
                    
                    <Button variant="outline" onClick={() => setIsEditing(true)} disabled={loading}>Edit</Button>
                    <Button variant="outline" onClick={() => setIsRejecting(true)} disabled={loading} className="text-red-600 hover:text-red-700 hover:bg-red-50">Reject</Button>
                </div>
            )}

            {isRejecting && (
                <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <Textarea 
                        placeholder="Provide feedback for the agent..." 
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setIsRejecting(false)}>Cancel</Button>
                        <Button variant="destructive" size="sm" onClick={handleReject} disabled={loading || !feedback}>Send Feedback</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
