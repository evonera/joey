import type { MetadataRoute } from 'next';

// Required for static export
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Joey - Social Media Agent Platform',
    short_name: 'Joey',
    description: 'Autonomous social media management platform powered by AI.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0908',
    theme_color: '#ffe633',
    icons: [
      {
        src: '/icon.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/joey-mascot.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
