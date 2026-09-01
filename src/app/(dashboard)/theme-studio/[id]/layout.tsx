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
      <ThemePageHeader page={res.page} />
      <div className="p-8 max-w-7xl mx-auto w-full flex-1">{children}</div>
    </div>
  );
}
