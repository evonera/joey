const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

export async function notifyDesktop(title: string, body: string) {
  if (IS_TAURI) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('send_notification', { title, body });
  } else {
    // Fallback for non-Tauri environment if needed
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
    }
  }
}
