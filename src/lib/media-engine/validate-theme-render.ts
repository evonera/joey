import type { assets, contentPackages, mediaRenderJobs, storyClusters, themeContentFormats, themePages, themeVisualTemplates } from '@/lib/db/schema';
import { deriveThemeRenderInput } from '@/lib/media-engine/theme-adapter';
import { deriveLegacyThemeRenderInput } from '@/lib/media-engine/legacy-theme-input';

type LockedThemeRender = {
  pkg: typeof contentPackages.$inferSelect;
  page: typeof themePages.$inferSelect;
  format: typeof themeContentFormats.$inferSelect;
  template?: typeof themeVisualTemplates.$inferSelect;
  cluster?: typeof storyClusters.$inferSelect;
  job?: typeof mediaRenderJobs.$inferSelect;
  output?: typeof assets.$inferSelect;
};

/** Callers must use tenant-scoped rows. To fence publication, hold row locks until the claim commits. */
export function validateThemeRenderSnapshot({ pkg, page, format, template, cluster, job, output }: LockedThemeRender): void {
  const input = deriveThemeRenderInput(pkg, page, format, template);
  const metrics = pkg.metrics as Record<string, unknown> | null;
  if (!metrics?.renderJobId) {
    if (metrics?.legacyRenderRevision) {
      const legacy = deriveLegacyThemeRenderInput(input, cluster);
      if (metrics.legacyRenderRevision !== legacy.revision || metrics.failurePhase) throw new Error('The design or copy has changed. Render again before approval.');
    }
    if (format.mediaType === 'video' || (Array.isArray(pkg.renderedAssetUrls) && pkg.renderedAssetUrls.some((asset: any) => asset?.type === 'video'))) throw new Error('Render a finished MP4 before approving or publishing this video.');
    return;
  }
  if (!job || job.id !== String(metrics.renderJobId)) throw new Error('Render not found.');
  if (job.status !== 'succeeded' || !job.outputAssetId || !output || output.id !== job.outputAssetId || metrics.renderRevision !== input.revision) throw new Error('The media is still rendering or has changed. Render again and review the finished export.');
  const attached = Array.isArray(pkg.renderedAssetUrls) ? pkg.renderedAssetUrls : [];
  if (!attached.some((item: any) => item?.assetId === output.id)) throw new Error('The completed render is not attached to this package yet.');
}
