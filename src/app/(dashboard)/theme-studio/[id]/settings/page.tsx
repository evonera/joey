"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  getThemePageById, 
  updateThemePage, 
  deleteThemePage 
} from "@/app/actions/theme-pages";
import { 
  IconDeviceFloppy, 
  IconTrash, 
  IconShieldLock, 
  IconLoader2 
} from "@tabler/icons-react";
import { toast } from "sonner";

export default function ThemePageSettingsRoute() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [page, setPage] = React.useState<any>(null);

  const [name, setName] = React.useState("");
  const [niche, setNiche] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [voice, setVoice] = React.useState("");
  const [rightsPolicy, setRightsPolicy] = React.useState("strict");

  React.useEffect(() => {
    async function load() {
      if (!params.id) return;
      const res = await getThemePageById(params.id);
      if (res.page) {
        setPage(res.page);
        setName(res.page.name || "");
        setNiche(res.page.niche || "");
        setAudience(res.page.audience || "");
        setVoice(res.page.voice || "");
        setRightsPolicy(res.page.defaultRightsPolicy || "strict");
      }
      setLoading(false);
    }
    load();
  }, [params.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const res = await updateThemePage(params.id, {
        name: name.trim(),
        niche: niche.trim() || undefined,
        audience: audience.trim() || undefined,
        voice: voice.trim() || undefined,
        defaultRightsPolicy: rightsPolicy,
      });

      if (res.error) throw new Error(res.error);
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this theme page? All sources, mix slots, and templates will be removed.")) {
      return;
    }

    try {
      const res = await deleteThemePage(params.id);
      if (res.error) throw new Error(res.error);
      toast.success("Theme page deleted");
      router.push("/theme-studio");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete theme page");
    }
  }

  if (loading) {
    return (
      <div className="p-12 flex justify-center text-muted-foreground">
        <IconLoader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Theme Page Settings</h2>
        <p className="text-sm text-muted-foreground">
          Update editorial parameters, brand voice, and content rights policies.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="p-6 border rounded-2xl bg-card space-y-4 shadow-sm">
          <h3 className="text-sm font-semibold">General Information</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Page Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Niche Topic</label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Target Audience</label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Editorial Brand Voice & Guidelines
              </label>
              <textarea
                rows={3}
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background leading-relaxed"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border rounded-2xl bg-card space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <IconShieldLock className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Rights & Compliance Policy</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Strict policy automatically blocks unverified content and enforces license attribution.
          </p>

          <select
            value={rightsPolicy}
            onChange={(e) => setRightsPolicy(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
          >
            <option value="strict">Strict (Only CC-BY, Public Domain, & Owned)</option>
            <option value="moderate">Moderate (Allow Transformative News Commentary)</option>
            <option value="permissive">Permissive (Curation with Source Tags)</option>
          </select>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconDeviceFloppy className="w-4 h-4" />}
            Save Settings
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
          >
            <IconTrash className="w-4 h-4" /> Delete Page
          </button>
        </div>
      </form>
    </div>
  );
}
