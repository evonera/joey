import * as React from "react";
import { notFound } from "next/navigation";
import { getThemeTemplateById } from "@/app/actions/theme-templates";
import { getContentFormats } from "@/app/actions/theme-content-formats";
import { TemplateCanvasEditor } from "@/components/theme-studio/TemplateCanvasEditor";

export default async function ThemePageTemplateEditorRoute({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id, templateId } = await params;
  const formatsRes = await getContentFormats();
  const availableFormats = formatsRes.formats || [];

  if (templateId === "new") {
    return (
      <TemplateCanvasEditor
        themePageId={id}
        initialTemplate={{
          name: "New Visual Template",
          formatId: availableFormats[0]?.id || "",
          renderer: "puppeteer",
          componentSpec: {
            backgroundColor: "#0f172a",
            accentColor: "#38bdf8",
            textColor: "#f8fafc",
            titleSize: 28,
            bodySize: 16,
            watermarkText: "@ThemePage",
            titleTemplate: "{{title}}",
            bodyTemplate: "{{summary}}",
          },
        }}
        availableFormats={availableFormats}
      />
    );
  }

  const templateRes = await getThemeTemplateById(templateId);
  if (
    templateRes.error ||
    !templateRes.template ||
    templateRes.template.themePageId !== id
  ) {
    notFound();
  }

  return (
    <TemplateCanvasEditor
      themePageId={id}
      initialTemplate={templateRes.template as any}
      availableFormats={availableFormats}
    />
  );
}
