import Link from "next/link";
import { getThemeTemplates } from "@/app/actions/theme-templates";
import { IconPalette, IconPlus } from "@tabler/icons-react";
import { TemplatePreview } from "@/components/theme-studio/TemplatePreview";

export default async function ThemePageTemplatesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const templatesRes = await getThemeTemplates(id);

  const templates = templatesRes.templates || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Visual Templates</h2>
          <p className="text-sm text-muted-foreground">Choose a visual style, edit it, or start a post with it in Chat.</p>
        </div>
        <Link
          href={`/theme-studio/${id}/templates/new`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm self-start"
        >
          <IconPlus className="w-4 h-4" /> Create Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-2xl bg-card/40">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <IconPalette className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold">No custom templates designed yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
            Design card and carousel templates with custom fonts, colors, and dynamic tokens.
          </p>
          <Link
            href={`/theme-studio/${id}/templates/new`}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg"
          >
            <IconPlus className="w-3.5 h-3.5" /> Design First Template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <article
              key={template.id}
              className="min-w-0 overflow-hidden border rounded-2xl bg-card hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <Link href={`/theme-studio/${id}/templates/${template.id}`} className="block bg-muted/40 p-3" aria-label={`Edit ${template.name}`}>
                {template.previewUrl ? <img src={template.previewUrl} alt={`Preview of ${template.name}`} className="aspect-square max-h-48 w-full rounded-lg object-contain" /> : <TemplatePreview name={template.name} formatName={template.format?.name} componentSpec={template.componentSpec} />}
              </Link>
              <div className="space-y-3 p-5">
                <div>
                  <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                    {template.name.replace(/\s*\([0-9a-f-]{36}\)$/, "")}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Format: {template.format?.name || "Standard Card"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t p-4 text-xs font-semibold">
                <Link href={`/dashboard?create=post&templateId=${encodeURIComponent(template.id)}`} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground">Use in Chat</Link>
                <Link href={`/theme-studio/${id}/templates/${template.id}`} className="rounded-lg border px-3 py-2 hover:bg-muted">Edit style</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
