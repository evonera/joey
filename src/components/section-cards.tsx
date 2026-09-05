import { IconTrendingUp } from "@tabler/icons-react"
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
}: {
  summary?: AnalyticsSnapshot["summary"]
}) {
  const impressions = summary?.impressions ?? 0
  const engagementRate = summary?.engagementRate ?? 0
  const totalInteractions = (summary?.likes ?? 0) + (summary?.comments ?? 0) + (summary?.shares ?? 0)
  const totalPosts = summary?.totalPosts ?? 0

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Impressions</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {impressions.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="gap-1 text-emerald-500 border-emerald-500/20">
              <IconTrendingUp className="size-3.5" />
              +14.2%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Reach across channels <IconTrendingUp className="size-4" />
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
            <Badge variant="outline" className="gap-1 text-emerald-500 border-emerald-500/20">
              <IconTrendingUp className="size-3.5" />
              Optimal
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Interactions vs impressions <IconTrendingUp className="size-4" />
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
            <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/20">
              Active
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
            <Badge variant="outline" className="gap-1 text-primary border-primary/20">
              Live
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
