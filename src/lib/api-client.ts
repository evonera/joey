const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function getAuthToken(): Promise<string> {
  if (IS_TAURI) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('get_auth_token');
  }
  throw new Error('Not in Tauri context');
}

async function fetchApi(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  
  return res.json();
}

export const apiClient = {
  drafts: {
    list: async (status?: string) => {
      if (IS_TAURI) {
        const query = status ? `?status=${encodeURIComponent(status)}` : '';
        return fetchApi(`/api/v1/drafts${query}`);
      }
      const actions = await import('@/app/actions/drafts');
      return actions.getDrafts(status);
    },
    create: async (data: any) => {
      if (IS_TAURI) {
        return fetchApi('/api/v1/drafts', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      }
      throw new Error('Not implemented for web'); // Replace with action when available
    },
    approve: async (id: string, data?: { variantName?: string; content?: string }) => {
      if (IS_TAURI) {
        return fetchApi(`/api/v1/drafts/${id}/approve`, {
          method: 'POST',
          body: JSON.stringify(data || {}),
        });
      }
      const actions = await import('@/app/actions/drafts');
      return actions.approveDraft(id, data?.variantName, data?.content);
    },
    reject: async (id: string, feedback: string) => {
      if (IS_TAURI) {
        return fetchApi(`/api/v1/drafts/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ feedback }),
        });
      }
      const actions = await import('@/app/actions/drafts');
      return actions.rejectDraft(id, feedback);
    },
  },
  posts: {
    list: async () => {
      if (IS_TAURI) {
        return fetchApi('/api/v1/posts');
      }
      throw new Error('Not implemented for web'); // Replace with action when available
    }
  },
  accounts: {
    list: async () => {
      if (IS_TAURI) {
        return fetchApi('/api/v1/accounts');
      }
      throw new Error('Not implemented for web'); // Replace with action when available
    }
  }
};
