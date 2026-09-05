import type { AnalyticsSnapshot } from "@/app/actions/analytics"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function SectionCards({
  summary,
  days,
}: {
  summary?: AnalyticsSnapshot["summary"]
  days?: number
}) {
  const impressions = summary?.impressions ?? 0
  const engagementRate = summary?.engagementRate ?? 0
  const totalInteractions = (summary?.likes ?? 0) + (summary?.comments ?? 0) + (summary?.shares ?? 0)
  const totalPosts = summary?.totalPosts ?? 0

  const engagementStatus =
    engagementRate >= 3.0
      ? { label: "High", className: "text-emerald-500 border-emerald-500/20" }
      : engagementRate >= 1.0
        ? { label: "Good", className: "text-blue-500 border-blue-500/20" }
        : engagementRate > 0
          ? { label: "Developing", className: "text-amber-500 border-amber-500/20" }
          : { label: "No activity", className: "text-muted-foreground border-border" }

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Impressions</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {impressions.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="text-muted-foreground border-border text-[11px] font-normal">
              {days ? `${days}d window` : "Total"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Reach across channels
          </div>
          <div className="text-muted-foreground text-xs">
            Aggregated cross-platform views
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Engagement Rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {engagementRate.toFixed(2)}%
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={`gap-1 ${engagementStatus.className}`}>
              {engagementStatus.label}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Interactions vs impressions
          </div>
          <div className="text-muted-foreground text-xs">
            Likes, comments &amp; shares ratio
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Engagements</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalInteractions.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge
              variant="outline"
              className={`gap-1 ${
                totalInteractions > 0
                  ? "text-amber-500 border-amber-500/20"
                  : "text-muted-foreground border-border"
              }`}
            >
              {totalInteractions > 0 ? "Active" : "No activity"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Community response
          </div>
          <div className="text-muted-foreground text-xs">
            Likes, comments and reposts
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Published Posts</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalPosts.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge
              variant="outline"
              className={`gap-1 ${
                totalPosts > 0
                  ? "text-primary border-primary/20"
                  : "text-muted-foreground border-border"
              }`}
            >
              {totalPosts > 0 ? `${totalPosts} live` : "No posts"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Active editorial output
          </div>
          <div className="text-muted-foreground text-xs">
            Published through connected accounts
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
