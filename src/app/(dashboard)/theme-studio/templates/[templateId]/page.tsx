import { notFound, redirect } from "next/navigation";
import { getThemeTemplateById } from "@/app/actions/theme-templates";
import { getContentFormats } from "@/app/actions/theme-content-formats";
import { TemplateCanvasEditor } from "@/components/theme-studio/TemplateCanvasEditor";

export default async function StandaloneTemplateEditor({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const [templateResult, formatsResult] = await Promise.all([getThemeTemplateById(templateId), getContentFormats()]);
  if (!templateResult.template) notFound();
  if (templateResult.template.themePageId) {
    redirect(`/theme-studio/${templateResult.template.themePageId}/templates/${templateId}`);
  }
  return <TemplateCanvasEditor initialTemplate={templateResult.template as any} availableFormats={formatsResult.formats || []} />;
}
