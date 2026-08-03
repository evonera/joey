import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: 'https://joey.evonera.com',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://joey.evonera.com/privacy',
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: 'https://joey.evonera.com/terms',
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      // Machine-readable summary for AI crawlers (llmstxt.org). Low priority so
      // HTML pages stay canonical, but still crawlable for LLM user-agents.
      url: 'https://joey.evonera.com/llms.txt',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.2,
    },
  ];
}
