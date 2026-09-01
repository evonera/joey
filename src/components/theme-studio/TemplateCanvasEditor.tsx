"use client";

import * as React from "react";
import { 
  IconDeviceFloppy, 
  IconSparkles, 
  IconEye, 
  IconTypography, 
  IconPalette, 
  IconLayersLinked, 
  IconRefresh,
  IconLoader2,
  IconCheck
} from "@tabler/icons-react";
import { createThemeTemplate, updateThemeTemplate } from "@/app/actions/theme-templates";
import { toast } from "sonner";

interface TemplateData {
  id?: string;
  themePageId?: string | null;
  name: string;
  formatId: string;
  renderer: "puppeteer" | "remotion";
  componentSpec: {
    backgroundColor?: string;
    backgroundGradient?: string;
    textColor?: string;
    accentColor?: string;
    fontFamily?: string;
    titleSize?: number;
    bodySize?: number;
    showWatermark?: boolean;
    watermarkText?: string;
    showSlideIndicator?: boolean;
    padding?: number;
    borderRadius?: number;
    titleTemplate?: string;
    bodyTemplate?: string;
  };
  propsSchema?: Record<string, unknown> | null;
  format?: {
    slug: string;
    name: string;
    platform: string;
    mediaType: string;
    aspectRatio?: string | null;
  } | null;
}

interface TemplateCanvasEditorProps {
  themePageId?: string;
  initialTemplate: TemplateData;
  availableFormats: Array<{
    id: string;
    slug: string;
    name: string;
    mediaType: string;
    aspectRatio?: string | null;
  }>;
}

export function TemplateCanvasEditor({
  themePageId,
  initialTemplate,
  availableFormats,
}: TemplateCanvasEditorProps) {
  const [name, setName] = React.useState(initialTemplate.name || "Default Card Template");
  const [formatId, setFormatId] = React.useState(
    initialTemplate.formatId || availableFormats[0]?.id || ""
  );
  const [spec, setSpec] = React.useState(initialTemplate.componentSpec || {
    backgroundColor: "#0f172a",
    backgroundGradient: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
    textColor: "#f8fafc",
    accentColor: "#38bdf8",
    fontFamily: "Inter, sans-serif",
    titleSize: 28,
    bodySize: 16,
    showWatermark: true,
    watermarkText: "@ThemePage",
    showSlideIndicator: false,
    padding: 32,
    borderRadius: 16,
    titleTemplate: "{{title}}",
    bodyTemplate: "{{summary}}",
  });

  const [previewSample, setPreviewSample] = React.useState({
    title: "LeBron James Surpasses 40,000 Career Points in Historic Performance",
    summary: "A breakdown of the milestones, shooting percentages, and impact on the Lakers' playoff seeding heading into the final stretch.",
    source_name: "ESPN NBA",
    author: "Dave McMenamin",
    tag: "BREAKING NEWS",
  });

  const [activeTab, setActiveTab] = React.useState<"design" | "content">("design");
  const [saving, setSaving] = React.useState(false);

  const selectedFormat = availableFormats.find((f) => f.id === formatId) || availableFormats[0];
  const isPortrait = selectedFormat?.aspectRatio === "4:5";
  const isVertical = selectedFormat?.aspectRatio === "9:16";

  async function handleSave() {
    setSaving(true);
    try {
      if (initialTemplate.id) {
        const res = await updateThemeTemplate(initialTemplate.id, {
          name,
          componentSpec: spec,
        });
        if (res.error) throw new Error(res.error);
        toast.success("Template updated");
      } else {
        const res = await createThemeTemplate({
          themePageId: themePageId || undefined,
          name,
          formatId,
          renderer: selectedFormat?.mediaType === "video" ? "remotion" : "puppeteer",
          componentSpec: spec,
        });
        if (res.error) throw new Error(res.error);
        toast.success("New template saved");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  function insertToken(token: string, target: "title" | "body") {
    if (target === "title") {
      setSpec((prev) => ({
        ...prev,
        titleTemplate: (prev.titleTemplate || "") + ` {{${token}}}`,
      }));
    } else {
      setSpec((prev) => ({
        ...prev,
        bodyTemplate: (prev.bodyTemplate || "") + ` {{${token}}}`,
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xl font-bold bg-transparent border-b border-dashed border-muted-foreground/30 hover:border-primary focus:border-primary focus:outline-none pb-0.5"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Format: <span className="font-semibold text-foreground">{selectedFormat?.name}</span> ({selectedFormat?.aspectRatio || "1:1"})
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
        >
          {saving ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconDeviceFloppy className="w-4 h-4" />}
          Save Template
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left / Settings Sidebar (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab("design")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "design"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <IconPalette className="w-3.5 h-3.5" /> Style & Layout
              </span>
            </button>
            <button
              onClick={() => setActiveTab("content")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "content"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <IconTypography className="w-3.5 h-3.5" /> Tokens & Content
              </span>
            </button>
          </div>

          {activeTab === "design" ? (
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-muted-foreground mb-1">Target Format</label>
                <select
                  value={formatId}
                  onChange={(e) => setFormatId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg bg-background"
                >
                  {availableFormats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.aspectRatio || "1:1"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">Background Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={spec.backgroundColor || "#0f172a"}
                      onChange={(e) => setSpec({ ...spec, backgroundColor: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={spec.backgroundColor || "#0f172a"}
                      onChange={(e) => setSpec({ ...spec, backgroundColor: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border rounded font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-muted-foreground mb-1">Accent / Highlight</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={spec.accentColor || "#38bdf8"}
                      onChange={(e) => setSpec({ ...spec, accentColor: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={spec.accentColor || "#38bdf8"}
                      onChange={(e) => setSpec({ ...spec, accentColor: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border rounded font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">Text Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={spec.textColor || "#f8fafc"}
                    onChange={(e) => setSpec({ ...spec, textColor: e.target.value })}
                    className="w-8 h-8 rounded border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={spec.textColor || "#f8fafc"}
                    onChange={(e) => setSpec({ ...spec, textColor: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border rounded font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">
                    Title Size: {spec.titleSize || 28}px
                  </label>
                  <input
                    type="range"
                    min={18}
                    max={48}
                    value={spec.titleSize || 28}
                    onChange={(e) => setSpec({ ...spec, titleSize: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">
                    Body Size: {spec.bodySize || 16}px
                  </label>
                  <input
                    type="range"
                    min={12}
                    max={24}
                    value={spec.bodySize || 16}
                    onChange={(e) => setSpec({ ...spec, bodySize: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">Watermark Handle</label>
                <input
                  type="text"
                  value={spec.watermarkText || ""}
                  onChange={(e) => setSpec({ ...spec, watermarkText: e.target.value })}
                  placeholder="@yourbrand"
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-muted-foreground mb-1.5">Available Dynamic Tokens</label>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {["title", "summary", "source_name", "author", "tag", "date"].map((tok) => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => insertToken(tok, "title")}
                      className="px-2 py-1 bg-secondary text-secondary-foreground font-mono text-[11px] rounded-md hover:bg-primary/20 transition-colors"
                    >
                      + {`{{${tok}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">Title Template</label>
                <textarea
                  rows={2}
                  value={spec.titleTemplate || "{{title}}"}
                  onChange={(e) => setSpec({ ...spec, titleTemplate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono bg-background"
                />
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">Body Text Template</label>
                <textarea
                  rows={3}
                  value={spec.bodyTemplate || "{{summary}}"}
                  onChange={(e) => setSpec({ ...spec, bodyTemplate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono bg-background"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right / Live Artboard Preview (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center p-8 bg-muted/30 border rounded-2xl">
          <div className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-wider flex items-center gap-1.5">
            <IconEye className="w-4 h-4" /> Live Render Preview
          </div>

          <div
            style={{
              background: spec.backgroundGradient || spec.backgroundColor || "#0f172a",
              color: spec.textColor || "#f8fafc",
              padding: `${spec.padding || 32}px`,
              borderRadius: `${spec.borderRadius || 16}px`,
              aspectRatio: isVertical ? "9/16" : isPortrait ? "4/5" : "1/1",
              maxWidth: isVertical ? "320px" : isPortrait ? "360px" : "400px",
              width: "100%",
            }}
            className="shadow-2xl flex flex-col justify-between relative overflow-hidden select-none transition-all duration-300"
          >
            {/* Header Tag & Source */}
            <div className="flex items-center justify-between gap-2">
              <span
                style={{
                  backgroundColor: `${spec.accentColor || "#38bdf8"}25`,
                  color: spec.accentColor || "#38bdf8",
                  borderColor: `${spec.accentColor || "#38bdf8"}50`,
                }}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border"
              >
                {previewSample.tag}
              </span>
              <span className="text-[11px] opacity-75 font-medium">{previewSample.source_name}</span>
            </div>

            {/* Main Content Area */}
            <div className="my-auto py-6 space-y-3">
              <h2
                style={{
                  fontSize: `${spec.titleSize || 28}px`,
                  lineHeight: 1.25,
                  fontWeight: 800,
                  fontFamily: spec.fontFamily,
                }}
                className="tracking-tight"
              >
                {previewSample.title}
              </h2>
              <p
                style={{
                  fontSize: `${spec.bodySize || 16}px`,
                  lineHeight: 1.45,
                  opacity: 0.88,
                  fontFamily: spec.fontFamily,
                }}
              >
                {previewSample.summary}
              </p>
            </div>

            {/* Footer Watermark */}
            {spec.showWatermark && (
              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs opacity-75">
                <span className="font-semibold">{spec.watermarkText || "@ThemePage"}</span>
                <span className="text-[10px]">Joey Theme Studio</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
