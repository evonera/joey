import * as React from "react";
import { notFound } from "next/navigation";
import { getThemePageById } from "@/app/actions/theme-pages";
import { PreviewDaySimulator } from "@/components/theme-studio/PreviewDaySimulator";

export default async function ThemePagePreviewDayRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getThemePageById(id);

  if (res.error || !res.page) {
    notFound();
  }

  const { page, sources, slots } = res;

  return (
    <PreviewDaySimulator
      themePage={page}
      slots={slots as any || []}
      sources={sources || []}
    />
  );
}
