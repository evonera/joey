import * as React from "react";
import { notFound } from "next/navigation";
import { getThemeSources } from "@/app/actions/theme-sources";
import { SourcesManager } from "@/components/theme-studio/SourcesManager";

export default async function ThemePageSourcesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getThemeSources(id);

  if (res.error) {
    notFound();
  }

  return <SourcesManager themePageId={id} initialSources={res.sources || []} />;
}
