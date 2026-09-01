'use client';

import { useState, useEffect, useRef } from "react";
import { approveReply, rejectReply, sendReply, updateReplyDraft, skipEngagementItem } from "@/app/actions/engagement";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  IconMessage,
  IconBrandX,
  IconBrandLinkedin,
  IconBrandInstagram,
  IconBrandFacebook,
  IconBrandTiktok,
  IconBrandYoutube,
  IconBrandReddit,
  IconBrandBluesky,
  IconBrandThreads,
  IconSend,
  IconCheck,
  IconX,
  IconDotsVertical,
  IconRefresh,
  IconEyeOff,
} from "@tabler/icons-react";

const platformIcons: Record<string, React.ReactNode> = {
  twitter: <IconBrandX className="w-4 h-4" />,
  linkedin: <IconBrandLinkedin className="w-4 h-4" />,
  instagram: <IconBrandInstagram className="w-4 h-4" />,
  facebook: <IconBrandFacebook className="w-4 h-4" />,
  tiktok: <IconBrandTiktok className="w-4 h-4" />,
  youtube: <IconBrandYoutube className="w-4 h-4" />,
  reddit: <IconBrandReddit className="w-4 h-4" />,
  bluesky: <IconBrandBluesky className="w-4 h-4" />,
  threads: <IconBrandThreads className="w-4 h-4" />,
};

function getPlatformIcon(platform: string) {
  return platformIcons[platform] || <IconMessage className="w-4 h-4" />;
}

export function ReplyCard({
  item,
  onActionComplete,
  stagedContent,
  onDiscardStagedEdit,
  onEditSaved,
  onEditingChange,
}: {
  item: any;
  onActionComplete: () => void;
  stagedContent?: string;
  onDiscardStagedEdit?: () => void;
  onEditSaved?: (persistedContent: string, expectedStagedContent?: string) => boolean;
  onEditingChange?: (replyDraftId: string, isEditing: boolean) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(item.replyDraft?.content || "");
  const [isRejecting, setIsRejecting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const hasHumanEdits = useRef(false);
  const activeReplyDraftId = useRef<string | undefined>(item.replyDraft?.id);

  useEffect(() => {
    const replyDraftId = item.replyDraft?.id;
    const serverContent = item.replyDraft?.content ?? "";
    if (activeReplyDraftId.current !== replyDraftId) {
      activeReplyDraftId.current = replyDraftId;
      hasHumanEdits.current = false;
      setLoading(false);
      setDraftContent(stagedContent ?? serverContent);
      setIsEditing(stagedContent !== undefined);
      return;
    }
    if (stagedContent !== undefined) {
      if (!hasHumanEdits.current) setDraftContent(stagedContent);
      setIsEditing(true);
      return;
    }
    if (!hasHumanEdits.current) setDraftContent(serverContent);
  }, [item.replyDraft?.content, item.replyDraft?.id, stagedContent]);

  useEffect(() => {
    const replyDraftId = item.replyDraft?.id;
    if (!replyDraftId) return;
    onEditingChange?.(replyDraftId, isEditing);
    return () => onEditingChange?.(replyDraftId, false);
  }, [isEditing, item.replyDraft?.id, onEditingChange]);

  const pendingReply = item.replyDraft && ["pending_review", "failed"].includes(item.replyDraft.status);
  const sendFailed = item.replyDraft?.status === "failed";
  const hasSentReply = item.replyDraft?.status === "sent";
  const noReplyYet = !item.replyDraft;

  const handleApproveAndSend = async () => {
    if (!item.replyDraft) return;
    setLoading(true);
    const res = await approveReply(item.replyDraft.id);
    if (res.success) {
      const sendRes = await sendReply(item.replyDraft.id);
      if (sendRes.error) alert(sendRes.error);
    }
    setLoading(false);
    onActionComplete();
  };

  const handleSendEdited = async () => {
    if (!item.replyDraft) return;
    setLoading(true);
    await updateReplyDraft(item.replyDraft.id, draftContent);
    const res = await approveReply(item.replyDraft.id);
    if (res.success) {
      const sendRes = await sendReply(item.replyDraft.id);
      if (sendRes.error) alert(sendRes.error);
    }
    setLoading(false);
    setIsEditing(false);
    onActionComplete();
  };

  const handleReject = async () => {
    if (!item.replyDraft || !feedback) return;
    setLoading(true);
    await rejectReply(item.replyDraft.id, feedback);
    setLoading(false);
    setIsRejecting(false);
    onActionComplete();
  };

  const handleSkip = async () => {
    setLoading(true);
    await skipEngagementItem(item.id);
    setLoading(false);
    onActionComplete();
  };

  const handleSaveEdit = async () => {
    if (!item.replyDraft) return;
    const savingDraftId = item.replyDraft.id;
    const stagedSnapshot = stagedContent;
    setLoading(true);
    const response = await updateReplyDraft(savingDraftId, draftContent);
    if (activeReplyDraftId.current !== savingDraftId) return;
    setLoading(false);
    if (response.error) {
      alert(response.error);
      return;
    }
    const persistedContent = draftContent.trim();
    hasHumanEdits.current = false;
    setDraftContent(persistedContent);
    const stagedSnapshotCleared = onEditSaved?.(persistedContent, stagedSnapshot) ?? true;
    setIsEditing(!stagedSnapshotCleared);
    onActionComplete();
  };

  const handleCancelEdit = () => {
    if (stagedContent !== undefined) onDiscardStagedEdit?.();
    hasHumanEdits.current = false;
    setDraftContent(item.replyDraft?.content ?? "");
    setIsEditing(false);
  };

  return (
    <div className="border rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm flex flex-col gap-3">
      {/* Header: Platform + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getPlatformIcon(item.platform)}
          <span className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            {item.platform}
          </span>
          <span className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
            {item.status}
          </span>
        </div>
      </div>

      {/* Commenter info + comment */}
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0 flex items-center justify-center text-xs font-medium overflow-hidden">
          {item.commenterAvatar ? (
            <img src={item.commenterAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            (item.commenterName?.[0] || "?").toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{item.commenterName || "Unknown"}</span>
            {item.commenterHandle && (
              <span className="text-xs text-zinc-500">@{item.commenterHandle}</span>
            )}
          </div>
          <div className="mt-1 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 text-sm text-zinc-700 dark:text-zinc-300 border-l-2 border-zinc-300 dark:border-zinc-600">
            <p className="whitespace-pre-wrap">{item.text}</p>
          </div>
          <time
            className="mt-1 block text-xs text-zinc-400"
            dateTime={new Date(item.createdAt).toISOString()}
            suppressHydrationWarning
          >
            {new Date(item.createdAt).toLocaleString()}
          </time>
        </div>
      </div>

      {/* AI Draft reply */}
      {pendingReply && (
        <>
          {isEditing ? (
            <div className="space-y-2">
              {stagedContent !== undefined ? <div role="status" className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">WebMCP staged this edit. Review it before saving.</div> : null}
              <Textarea
                value={draftContent}
                onChange={(e) => {
                  hasHumanEdits.current = true;
                  setDraftContent(e.target.value);
                }}
                className="min-h-[80px] text-sm"
                disabled={loading}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={loading}>
                  {stagedContent !== undefined ? "Discard" : "Cancel"}
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={loading}>
                  {loading ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <IconMessage className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  {sendFailed ? "Send Failed — Review & Retry" : "AI Draft Reply"}
                </span>
              </div>
              <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                {draftContent}
              </p>
            </div>
          )}

          {/* Actions */}
          {!isEditing && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={handleApproveAndSend}
                disabled={loading}
              >
                <IconSend className="w-3.5 h-3.5" />
                {loading ? "Sending..." : sendFailed ? "Retry Send" : "Approve & Send"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  hasHumanEdits.current = false;
                  setIsEditing(true);
                }}
                disabled={loading}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRejecting(true)}
                disabled={loading}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <IconX className="w-3.5 h-3.5" />
                Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={loading}
                className="text-zinc-500"
              >
                <IconEyeOff className="w-3.5 h-3.5" />
                Skip
              </Button>
            </div>
          )}

          {isRejecting && (
            <div className="space-y-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <Textarea
                placeholder="Provide feedback for the agent..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[60px] text-sm"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setIsRejecting(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReject}
                  disabled={loading || !feedback}
                >
                  Send Feedback
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Rejected state */}
      {item.replyDraft?.status === "rejected" && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap line-through">
            {item.replyDraft.content}
          </p>
          {item.replyDraft.feedback && (
            <div className="mt-2 text-xs text-red-600">
              <strong>Feedback:</strong> {item.replyDraft.feedback}
            </div>
          )}
        </div>
      )}

      {/* Sent state */}
      {hasSentReply && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <IconCheck className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
              Reply Sent
            </span>
          </div>
          <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
            {item.replyDraft.content}
          </p>
        </div>
      )}

      {/* No reply yet */}
      {noReplyYet && item.status === "pending" && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <IconRefresh className="w-3.5 h-3.5 animate-spin" />
          Waiting for agent draft...
        </div>
      )}

      {/* Skipped state */}
      {item.status === "skipped" && (
        <div className="text-xs text-zinc-400 flex items-center gap-1">
          <IconEyeOff className="w-3 h-3" />
          Skipped
        </div>
      )}
    </div>
  );
}
