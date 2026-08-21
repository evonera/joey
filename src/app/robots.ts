import type { MetadataRoute } from 'next';

// Required for static export
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/settings/', '/accounts/', '/api/', '/login', '/signup'],
      },
    ],
    sitemap: 'https://joey.evonera.com/sitemap.xml',
  };
}
