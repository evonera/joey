import Link from "next/link";
import { getThemeTemplates } from "@/app/actions/theme-templates";
import { getThemePages } from "@/app/actions/theme-pages";
import { TemplatePreview } from "@/components/theme-studio/TemplatePreview";

export default async function TemplateLibraryPage() {
  const [templateResult, pageResult] = await Promise.all([getThemeTemplates(), getThemePages()]);
  if (templateResult.error) throw new Error(templateResult.error);
  const pages = new Map((pageResult.pages || []).map((page) => [page.id, page.name]));
  const templates = templateResult.templates || [];

  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <div className="border-b pb-5">
      <Link href="/theme-studio" className="text-sm text-muted-foreground hover:text-foreground">← Theme Studio</Link>
      <h1 className="mt-2 text-2xl font-bold">Your templates</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pick a style to edit, or start a new post with it in Chat.</p>
    </div>
    {templates.length === 0 ? <div className="space-y-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><p>No templates yet. Create a Theme Page to build your first style.</p><Link href="/theme-studio/new" className="inline-flex rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">Create a Theme Page</Link></div> :
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{templates.map((template) => {
        const editHref = template.themePageId
          ? `/theme-studio/${template.themePageId}/templates/${template.id}`
          : `/theme-studio/templates/${template.id}`;
        const useHref = `/dashboard?create=post&templateId=${encodeURIComponent(template.id)}`;
        return <article key={template.id} className="min-w-0 overflow-hidden rounded-xl border bg-card">
          <Link href={editHref} className="block bg-muted/50 p-3 hover:bg-muted" aria-label={`Edit ${template.name}`}>
            {template.previewUrl ? <img src={template.previewUrl} alt={`Preview of ${template.name}`} className="aspect-square max-h-52 w-full rounded-lg object-contain" /> :
              <TemplatePreview name={template.name} formatName={template.format?.name} componentSpec={template.componentSpec} />}
          </Link>
          <div className="space-y-2 p-4">
            <h2 className="truncate font-semibold" title={template.name}>{template.name.replace(/\s*\([0-9a-f-]{36}\)$/, "")}</h2>
            <p className="text-xs text-muted-foreground">{template.themePageId ? pages.get(template.themePageId) || "Theme Page" : "Saved standalone template"} · {template.format?.name || "Visual"}</p>
            <p className="text-xs text-muted-foreground">Chat drafts copy; apply this visual style in Theme Studio.</p>
            <div className="flex flex-wrap gap-2 pt-1"><Link href={useHref} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Draft copy in Chat</Link><Link href={editHref} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted">Edit style</Link></div>
          </div>
        </article>;
      })}</div>}
  </div>;
}
