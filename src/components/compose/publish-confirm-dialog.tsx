'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SentIcon as Send,
  Loading03Icon as Loader2,
  AlertCircleIcon as AlertCircle,
  Image01Icon as ImageIcon,
} from "hugeicons-react";

export interface AccountSummary {
  id: string;
  accountName: string;
  platform: string;
  avatarUrl?: string;
}

interface PublishConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  isPublishing: boolean;
  accounts: AccountSummary[];
  content: string;
  mediaCount?: number;
  actionLabel?: string;
}

export function PublishConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isPublishing,
  accounts,
  content,
  mediaCount = 0,
  actionLabel = "Publish Now",
}: PublishConfirmDialogProps) {
  const truncatedContent =
    content.length > 220 ? `${content.slice(0, 220).trim()}…` : content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" />
            Confirm Live Publication
          </DialogTitle>
          <DialogDescription>
            Review the details below before publishing live to your connected social channels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Destination Accounts */}
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Target Accounts ({accounts.length})
            </span>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-muted/40 text-xs font-medium"
                >
                  {acc.avatarUrl ? (
                    <img
                      src={acc.avatarUrl}
                      alt={acc.accountName}
                      className="h-4 w-4 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] uppercase font-bold">
                      {acc.platform.charAt(0)}
                    </span>
                  )}
                  <span className="truncate max-w-[120px]">{acc.accountName}</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 uppercase">
                    {acc.platform}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Content Preview */}
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Content Preview
            </span>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words max-h-36 overflow-y-auto">
              {truncatedContent || <span className="italic text-muted-foreground">No text content</span>}
            </div>
          </div>

          {/* Media attachments */}
          {mediaCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="h-4 w-4 text-primary" />
              <span>
                <strong>{mediaCount}</strong> media asset{mediaCount === 1 ? "" : "s"} attached
              </span>
            </div>
          )}

          {/* Live warning */}
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This post will be dispatched immediately. Live posts cannot be undone once published to third-party networks.
            </span>
          </div>
        </div>

        <DialogFooter className="flex sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPublishing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isPublishing}
            className="font-semibold gap-2"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {actionLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
