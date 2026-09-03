const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

export async function notifyDesktop(title: string, body: string) {
  if (IS_TAURI) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('send_notification', { title, body });
      return;
    } catch {
      // Fallback to web notifications if native command is unavailable
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}
