'use client';

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { lintPackaging } from "@/lib/packaging-linter";
import {
  SparklesIcon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  FavouriteIcon as Heart,
  Comment01Icon as MessageSquare,
  RepeatIcon as Repeat,
  SentIcon as Share2,
  Bookmark01Icon as Bookmark,
} from "hugeicons-react";

export interface FeedSimulatorProps {
  mediaUrl?: string | null;
  postText: string;
  overlayText?: string;
  authorName?: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
}

export function FeedSimulator({
  mediaUrl,
  postText,
  overlayText,
  authorName = "Joey User",
  authorHandle = "@joey_user",
  authorAvatarUrl,
}: FeedSimulatorProps) {
  const [platform, setPlatform] = useState<"x" | "instagram" | "youtube-mobile" | "youtube-desktop">("x");

  const lint = lintPackaging(postText, overlayText);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (score >= 55) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    return "text-red-400 border-red-500/30 bg-red-500/10";
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) {
      return { label: "High CTR Synergy", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
    }
    if (score >= 55) {
      return { label: "Good — Needs Polish", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
    }
    return { label: "Low Synergy Warning", color: "bg-red-500/20 text-red-400 border-red-500/30" };
  };

  const badgeInfo = getScoreBadge(lint.score);

  return (
    <div className="space-y-4">
      {/* View Switcher & Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Feed Simulation
          </span>
          <Badge variant="outline" className={`text-[11px] font-bold ${badgeInfo.color}`}>
            {lint.score}/100 • {badgeInfo.label}
          </Badge>
        </div>

        <div className="flex flex-wrap rounded-lg border bg-muted/30 p-1 text-xs gap-1">
          <button
            type="button"
            onClick={() => setPlatform("x")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              platform === "x"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            𝕏 Feed
          </button>
          <button
            type="button"
            onClick={() => setPlatform("instagram")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              platform === "instagram"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📸 Instagram
          </button>
          <button
            type="button"
            onClick={() => setPlatform("youtube-mobile")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              platform === "youtube-mobile"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📱 YT Mobile
          </button>
          <button
            type="button"
            onClick={() => setPlatform("youtube-desktop")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              platform === "youtube-desktop"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            💻 YT Desktop
          </button>
        </div>
      </div>

      {/* Simulator Frame */}
      <div className="overflow-hidden rounded-xl border bg-black/90 p-4 text-white shadow-xl">
        {platform === "x" && (
          <div className="mx-auto max-w-md space-y-3 font-sans">
            {/* Header */}
            <div className="flex items-center gap-3">
              {authorAvatarUrl ? (
                <img src={authorAvatarUrl} alt={authorName} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-sm">
                  {authorName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-1.5 font-bold text-sm text-zinc-100">
                  <span className="truncate">{authorName}</span>
                  <span className="font-normal text-xs text-zinc-400">{authorHandle}</span>
                </div>
                <span className="text-[11px] text-zinc-500">Just now</span>
              </div>
            </div>

            {/* Post Hook / Text */}
            <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
              {postText || "Your post hook and compelling copy goes here..."}
            </p>

            {/* Visual Attachment Card */}
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              {mediaUrl ? (
                <img src={mediaUrl} alt="Visual Hook" className="w-full h-auto object-cover max-h-[380px]" />
              ) : (
                <div className="flex h-48 w-full items-center justify-center text-xs text-zinc-500">
                  Visual hook preview will render here
                </div>
              )}
            </div>

            {/* Interaction Bar */}
            <div className="flex items-center justify-between pt-1 px-1 text-zinc-400 text-xs">
              <span className="flex items-center gap-1.5 hover:text-blue-400 transition-colors">
                <MessageSquare className="h-4 w-4" /> 24
              </span>
              <span className="flex items-center gap-1.5 hover:text-green-400 transition-colors">
                <Repeat className="h-4 w-4" /> 89
              </span>
              <span className="flex items-center gap-1.5 hover:text-pink-500 transition-colors">
                <Heart className="h-4 w-4" /> 432
              </span>
              <span className="flex items-center gap-1.5 hover:text-blue-400 transition-colors">
                <Bookmark className="h-4 w-4" /> 68
              </span>
              <Share2 className="h-4 w-4" />
            </div>
          </div>
        )}

        {platform === "instagram" && (
          <div className="mx-auto max-w-sm space-y-3 font-sans">
            {/* Header */}
            <div className="flex items-center gap-2.5">
              <div className="p-[2px] rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600">
                {authorAvatarUrl ? (
                  <img src={authorAvatarUrl} alt={authorName} className="h-8 w-8 rounded-full border border-black object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 font-bold text-white text-xs border border-black">
                    {authorName.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="font-semibold text-xs text-zinc-100">{authorHandle.replace("@", "")}</span>
            </div>

            {/* Visual Attachment Card */}
            <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
              {mediaUrl ? (
                <img src={mediaUrl} alt="Instagram Post" className="w-full h-auto object-cover max-h-[440px]" />
              ) : (
                <div className="flex h-64 w-full items-center justify-center text-xs text-zinc-500">
                  Visual hook preview will render here
                </div>
              )}
            </div>

            {/* Instagram Actions */}
            <div className="flex items-center justify-between text-zinc-300">
              <div className="flex items-center gap-3">
                <Heart className="h-5 w-5 hover:text-red-500 cursor-pointer" />
                <MessageSquare className="h-5 w-5 hover:text-zinc-100 cursor-pointer" />
                <Share2 className="h-5 w-5 hover:text-zinc-100 cursor-pointer" />
              </div>
              <Bookmark className="h-5 w-5 hover:text-zinc-100 cursor-pointer" />
            </div>

            {/* Caption */}
            <div className="space-y-1 text-xs">
              <p className="leading-snug text-zinc-100">
                <span className="font-semibold mr-1.5">{authorHandle.replace("@", "")}</span>
                {postText || "Add your post caption in compose..."}
              </p>
              <p className="text-[11px] text-zinc-500">View all 18 comments</p>
            </div>
          </div>
        )}

        {platform === "youtube-mobile" && (
          <div className="mx-auto max-w-[360px] space-y-3 font-sans">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-900 shadow">
              {mediaUrl ? (
                <img src={mediaUrl} alt="YouTube Mobile Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                  Thumbnail Preview
                </div>
              )}
              <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                03:42
              </span>
            </div>

            <div className="flex gap-3 pt-0.5">
              {authorAvatarUrl ? (
                <img src={authorAvatarUrl} alt={authorName} className="h-9 w-9 rounded-full object-cover shrink-0" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 font-bold text-xs text-white">
                  {authorName.slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <h4 className="text-sm leading-snug font-medium text-zinc-100">
                  {postText.length <= 40 ? (
                    <span>{postText || "Your video or post title..."}</span>
                  ) : (
                    <span>
                      <span>{postText.slice(0, 40)}</span>
                      <span className="text-red-400/90 bg-red-950/50 rounded px-1 text-xs font-mono ml-0.5">
                        ...[Cut off on mobile]
                      </span>
                    </span>
                  )}
                </h4>
                <p className="text-[12px] text-zinc-400">
                  {authorName} • 145K views • 2 hours ago
                </p>
              </div>
            </div>
          </div>
        )}

        {platform === "youtube-desktop" && (
          <div className="flex flex-col sm:flex-row gap-4 font-sans">
            <div className="relative aspect-video w-full sm:w-64 sm:shrink-0 overflow-hidden rounded-lg bg-zinc-900 shadow">
              {mediaUrl ? (
                <img src={mediaUrl} alt="YouTube Desktop Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                  Thumbnail Preview
                </div>
              )}
              <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                03:42
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <h4 className="text-base font-medium leading-snug text-zinc-100">
                {postText.length <= 60 ? (
                  <span>{postText || "Your video or post title..."}</span>
                ) : (
                  <span>
                    <span>{postText.slice(0, 60)}</span>
                    <span className="text-amber-400/90 bg-amber-950/50 rounded px-1 text-xs font-mono ml-0.5">
                      ...[Truncated]
                    </span>
                  </span>
                )}
              </h4>
              <p className="text-xs text-zinc-400">145K views • 2 hours ago</p>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 font-bold text-[10px] text-white">
                  {authorName.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-xs text-zinc-300 font-medium">{authorName}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Packaging Synergy Audit Card */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Packaging Synergy Linter
            </span>
          </div>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${getScoreColor(lint.score)}`}>
            {lint.score} / 100
          </span>
        </div>

        {/* Actionable Feedback List */}
        <div className="space-y-2 text-xs">
          {lint.issues.length === 0 && lint.good.length === 0 && (
            <p className="text-muted-foreground italic">Type or select a title/hook to check packaging synergy.</p>
          )}

          {lint.issues.map((issue, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 rounded-lg p-2.5 ${
                issue.severity === "critical"
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
              }`}
            >
              <AlertCircleIcon
                className={`h-4 w-4 shrink-0 mt-0.5 ${
                  issue.severity === "critical" ? "text-red-400" : "text-amber-400"
                }`}
              />
              <div className="space-y-0.5">
                <span className="font-semibold capitalize">
                  {issue.type.replace("-", " ")}:
                </span>{" "}
                <span>{issue.message}</span>
              </div>
            </div>
          ))}

          {lint.good.map((praise, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-emerald-400"
            >
              <CheckmarkCircle02Icon className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{praise}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
