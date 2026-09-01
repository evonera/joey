import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getThemeTemplates } from "@/app/actions/theme-templates";
import { getContentFormats } from "@/app/actions/theme-content-formats";
import { IconPalette, IconPlus, IconArrowRight, IconSparkles } from "@tabler/icons-react";

export default async function ThemePageTemplatesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [templatesRes, formatsRes] = await Promise.all([
    getThemeTemplates(id),
    getContentFormats(),
  ]);

  const templates = templatesRes.templates || [];
  const formats = formatsRes.formats || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Visual Templates</h2>
          <p className="text-sm text-muted-foreground">
            Deterministic card layouts and video scene templates configured for this theme page.
          </p>
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
            <Link
              key={template.id}
              href={`/theme-studio/${id}/templates/${template.id}`}
              className="p-5 border rounded-2xl bg-card hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-secondary text-secondary-foreground uppercase">
                    {template.renderer}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">v{template.version}</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                    {template.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Format: {template.format?.name || "Standard Card"}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Edit Canvas</span>
                <IconArrowRight className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
