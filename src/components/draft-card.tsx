'use client';

import { useState } from "react";
import { updateDraft, approveDraft, rejectDraft } from "@/app/actions/drafts";
import { publishDraft } from "@/app/actions/publisher";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";

export function DraftCard({ draft, onActionComplete }: { draft: any, onActionComplete: () => void }) {
    const [isEditing, setIsEditing] = useState(false);
    const [content, setContent] = useState(draft.content);
    const [isRejecting, setIsRejecting] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [loading, setLoading] = useState(false);

    const platformOpts = draft.platformOptions as any;
    const platform = platformOpts?.platform || "Unknown";

    const handleApprove = async () => {
        setLoading(true);
        await approveDraft(draft.id);
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
                <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{draft.content}</p>
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

            {!isEditing && !isRejecting && draft.status === 'pending_review' && (
                <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <Button onClick={handleApprove} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white">Approve</Button>
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
