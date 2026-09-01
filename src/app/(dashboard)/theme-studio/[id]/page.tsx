import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getThemePageById } from "@/app/actions/theme-pages";
import { 
  IconRss, 
  IconCalendar, 
  IconPalette, 
  IconSparkles, 
  IconArrowRight, 
  IconEye,
  IconCheck,
  IconClock
} from "@tabler/icons-react";
import { ThemePackageQueue } from "@/components/theme-studio/ThemePackageQueue";

export default async function ThemePageOverview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getThemePageById(id);

  if (res.error || !res.page) {
    notFound();
  }

  const { page, sources, slots, templates, recentPackages } = res;

  return (
    <div className="space-y-8">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 border rounded-2xl bg-card space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Trusted Feeds</span>
            <IconRss className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold">{sources?.length || 0}</p>
          <p className="text-[11px] text-muted-foreground">
            {sources?.filter((s) => s.isActive).length || 0} currently active
          </p>
        </div>

        <div className="p-5 border rounded-2xl bg-card space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Daily Mix Slots</span>
            <IconCalendar className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold">{slots?.length || 0}</p>
          <p className="text-[11px] text-muted-foreground">Generated every 24 hours</p>
        </div>

        <div className="p-5 border rounded-2xl bg-card space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Templates</span>
            <IconPalette className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold">{templates?.length || 0}</p>
          <p className="text-[11px] text-muted-foreground">Visual styles applied</p>
        </div>

        <div className="p-5 border rounded-2xl bg-card space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Recent Packages</span>
            <IconSparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold">{recentPackages?.length || 0}</p>
          <p className="text-[11px] text-muted-foreground">Authored and staged</p>
        </div>
      </div>

      {/* Main Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Daily Mix & Sources Overview */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 border rounded-2xl bg-card space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Active Daily Mix</h2>
              <Link
                href={`/theme-studio/${page.id}/mix`}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
              >
                Manage Mix <IconArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {(!slots || slots.length === 0) ? (
              <div className="p-6 text-center border border-dashed rounded-xl text-xs text-muted-foreground">
                No slots configured yet.{" "}
                <Link href={`/theme-studio/${page.id}/mix`} className="text-primary font-semibold underline">
                  Add content slots
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {slots.map((slot, i) => (
                  <div
                    key={slot.id}
                    className="p-3 border rounded-xl flex items-center justify-between bg-muted/20 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-muted flex items-center justify-center font-bold text-[10px]">
                        #{i + 1}
                      </span>
                      <span className="font-semibold">{slot.label || "Daily Slot"}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[11px] font-medium">
                      {slot.cadence}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 border rounded-2xl bg-card space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Recent Packages Staged</h2>
              <Link
                href={`/theme-studio/${page.id}/preview-day`}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
              >
                <IconEye className="w-3.5 h-3.5" /> Simulate Next Run
              </Link>
            </div>

            <ThemePackageQueue packages={recentPackages || []} />
          </div>
        </div>

        {/* Right 1 Col: Brand Voice & Quick Actions */}
        <div className="space-y-6">
          <div className="p-6 border rounded-2xl bg-card space-y-4 shadow-sm">
            <h2 className="text-base font-bold">Brand Kit & Tone</h2>
            {page.voice && (
              <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border">
                <span className="font-semibold text-foreground block mb-1">Tone of Voice:</span>
                {page.voice}
              </div>
            )}

            <div className="pt-2">
              <Link
                href={`/theme-studio/${page.id}/settings`}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border rounded-xl text-xs font-semibold hover:bg-muted transition-colors"
              >
                Edit Brand Voice & Kit
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
