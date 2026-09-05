"use client";

import * as React from "react";
import {
  File02Icon as FileIcon,
  Image01Icon as ImageIcon,
  MusicNote01Icon as AudioIcon,
  Video01Icon as VideoIcon,
  Cancel01Icon as CloseIcon,
  Loading03Icon as SpinnerIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";

export type AttachmentItem = {
  id?: string;
  name: string;
  size?: number;
  type?: string;
  url?: string;
  status?: "uploading" | "ready" | "error";
  progress?: number;
};

export type AttachmentsProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "inline" | "grid";
};

export const Attachments = React.forwardRef<HTMLDivElement, AttachmentsProps>(
  ({ className, variant = "inline", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex gap-2 py-1.5 overflow-x-auto scrollbar-none",
          variant === "grid" ? "flex-wrap" : "flex-nowrap",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Attachments.displayName = "Attachments";

export type AttachmentProps = React.HTMLAttributes<HTMLDivElement> & {
  attachment: AttachmentItem;
  onRemove?: () => void;
  canRemove?: boolean;
};

export const Attachment = React.forwardRef<HTMLDivElement, AttachmentProps>(
  ({ className, attachment, onRemove, canRemove = true, children, ...props }, ref) => {
    const isImage =
      attachment.type?.startsWith("image/") ||
      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.name);
    const isVideo =
      attachment.type?.startsWith("video/") ||
      /\.(mp4|webm|mov)$/i.test(attachment.name);
    const isAudio =
      attachment.type?.startsWith("audio/") ||
      /\.(mp3|wav|ogg|m4a)$/i.test(attachment.name);

    return (
      <div
        ref={ref}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-lg border border-border/50 bg-background/80 px-2.5 py-1.5 text-xs shadow-xs transition-all hover:border-border select-none shrink-0 max-w-xs",
          attachment.status === "error" && "border-destructive/40 bg-destructive/5 text-destructive",
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            <AttachmentPreview
              isImage={isImage}
              isVideo={isVideo}
              isAudio={isAudio}
              url={attachment.url}
              status={attachment.status}
              name={attachment.name}
            />
            <AttachmentInfo
              name={attachment.name}
              size={attachment.size}
              status={attachment.status}
              progress={attachment.progress}
            />
            {canRemove && onRemove ? (
              <AttachmentRemove onRemove={onRemove} />
            ) : null}
          </>
        )}
      </div>
    );
  }
);
Attachment.displayName = "Attachment";

export function AttachmentPreview({
  isImage,
  isVideo,
  isAudio,
  url,
  status,
  name,
}: {
  isImage?: boolean;
  isVideo?: boolean;
  isAudio?: boolean;
  url?: string;
  status?: string;
  name: string;
}) {
  if (status === "uploading") {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <SpinnerIcon className="size-4 animate-spin text-foreground/70" />
      </div>
    );
  }

  if (isImage && url) {
    return (
      <div className="relative size-8 shrink-0 overflow-hidden rounded-md border border-border/40 bg-muted">
        <img
          src={url}
          alt={name}
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  const Icon = isImage ? ImageIcon : isVideo ? VideoIcon : isAudio ? AudioIcon : FileIcon;

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
      <Icon className="size-4 text-foreground/70" />
    </div>
  );
}

export function AttachmentInfo({
  name,
  size,
  status,
  progress,
}: {
  name: string;
  size?: number;
  status?: string;
  progress?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium text-foreground max-w-[160px]">
        {name}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {status === "uploading"
          ? typeof progress === "number"
            ? `Uploading ${progress}%`
            : "Uploading…"
          : status === "error"
          ? "Failed to upload"
          : size
          ? formatFileSize(size)
          : "File"}
      </span>
    </div>
  );
}

export function AttachmentRemove({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className="ml-auto rounded-full p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 transition-all cursor-pointer"
      title="Remove attachment"
      aria-label="Remove attachment"
    >
      <CloseIcon className="size-3" />
    </button>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
