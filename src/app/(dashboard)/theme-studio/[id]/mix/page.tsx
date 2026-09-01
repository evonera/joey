import * as React from "react";
import { notFound } from "next/navigation";
import { getThemeSlots } from "@/app/actions/theme-slots";
import { getContentFormats } from "@/app/actions/theme-content-formats";
import { DailyMixScheduler } from "@/components/theme-studio/DailyMixScheduler";

export default async function ThemePageMixRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [slotsRes, formatsRes] = await Promise.all([
    getThemeSlots(id),
    getContentFormats(),
  ]);

  if (slotsRes.error) {
    notFound();
  }

  return (
    <DailyMixScheduler
      themePageId={id}
      initialSlots={slotsRes.slots || []}
      availableFormats={formatsRes.formats || []}
    />
  );
}
