import * as React from "react";
import { notFound } from "next/navigation";
import { getThemePageById } from "@/app/actions/theme-pages";
import { ThemePageHeader } from "@/components/theme-studio/ThemePageHeader";

export default async function ThemePageLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const res = await getThemePageById(id);

  if (res.error || !res.page) {
    notFound();
  }

  return (
    <div className="flex flex-col min-h-full">
      <ThemePageHeader
        page={res.page}
        webMcpState={{
          page: {
            id: res.page.id,
            name: res.page.name,
            niche: res.page.niche,
            audience: res.page.audience,
            status: res.page.status,
            rightsPolicy: res.page.defaultRightsPolicy,
            connectedAccountCount: res.publishingAccounts?.length ?? 0,
            connectedPlatforms: (res.publishingAccounts || []).map((account) => (
              account.platform === "twitter" ? "x" : account.platform
            )),
          },
          sources: (res.sources || []).map((source) => ({
            id: source.id,
            name: source.name,
            sourceType: source.sourceType,
            rightsCategory: source.rightsCategory,
            isActive: source.isActive,
          })),
          slots: (res.slots || []).map((slot) => ({
            id: slot.id,
            label: slot.label,
            cadence: slot.cadence,
            isActive: slot.isActive,
            platform: res.formats?.find((format) => format.id === slot.formatId)?.platform,
          })),
          packages: (res.recentPackages || []).map((pkg) => ({
            id: pkg.id,
            title: pkg.title,
            status: pkg.status,
          })),
        }}
      />
      <div className="p-8 max-w-7xl mx-auto w-full flex-1">{children}</div>
    </div>
  );
}
