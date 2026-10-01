// Listen for deep link events from Tauri
import { listen } from '@tauri-apps/api/event';

export function setupDeepLinkHandler() {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    listen('deep-link', (event) => {
      try {
        const url = new URL(event.payload as string);
        if (url.pathname === '/oauth-callback' || url.host === 'oauth-callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          if (code && state) {
            // Desktop OAuth exchange is not implemented yet. Never write the
            // authorization code or state token to logs.
            return;
          }
        }
      } catch (err) {
        console.error('Error handling deep link:', err);
      }
    });
  }
}
