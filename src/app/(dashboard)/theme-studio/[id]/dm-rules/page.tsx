import * as React from "react";
import { notFound } from "next/navigation";
import { getDmRules } from "@/app/actions/dm-rules";
import { DmRulesBuilder } from "@/components/theme-studio/DmRulesBuilder";

export default async function ThemePageDmRulesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getDmRules(id);

  if (res.error) {
    notFound();
  }

  return <DmRulesBuilder themePageId={id} initialRules={res.rules || []} />;
}
