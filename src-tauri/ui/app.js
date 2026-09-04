// Joey Quick Capture Desktop Companion
(function () {
  // DOM Elements
  const draftInput = document.getElementById('draftInput');
  const submitDraftBtn = document.getElementById('submitDraftBtn');
  const closeBtn = document.getElementById('closeBtn');
  const openWebBtn = document.getElementById('openWebBtn');
  const pendingBadgeBtn = document.getElementById('pendingBadgeBtn');
  const pendingCountText = document.getElementById('pendingCountText');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const apiUrlInput = document.getElementById('apiUrlInput');
  const apiTokenInput = document.getElementById('apiTokenInput');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsFeedback = document.getElementById('settingsFeedback');
  const mascotBadge = document.getElementById('mascotBadge');
  const mascotStatus = document.getElementById('mascotStatus');
  const platformChips = document.querySelectorAll('.chip');

  let selectedPlatform = 'all';

  // Helper for Tauri Events
  function getTauriEvent() {
    if (window.__TAURI__?.event) {
      return window.__TAURI__.event;
    }
    return null;
  }

  async function emitEvent(eventName, payload = {}) {
    const tauriEvent = getTauriEvent();
    if (tauriEvent?.emit) {
      return await tauriEvent.emit(eventName, payload);
    }
    console.warn(`[Joey] Mock emit for: ${eventName}`, payload);
  }

  async function listenEvent(eventName, handler) {
    const tauriEvent = getTauriEvent();
    if (tauriEvent?.listen) {
      return await tauriEvent.listen(eventName, (e) => handler(e.payload));
    }
    console.warn(`[Joey] Mock listen for: ${eventName}`);
  }

  // Mascot Status Handler
  function setMascot(state, message) {
    mascotBadge.className = 'mascot-badge';
    if (state === 'thinking') {
      mascotBadge.classList.add('anim-thinking');
    } else if (state === 'success') {
      mascotBadge.classList.add('anim-success');
    }
    if (message) {
      mascotStatus.textContent = message;
    }
  }

  // Platform chips
  platformChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      platformChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedPlatform = chip.getAttribute('data-platform') || 'all';
    });
  });

  // Submit Draft
  async function handleDraftSubmit() {
    const text = draftInput.value.trim();
    if (!text) {
      setMascot('idle', 'Input is empty! Paste an idea or link.');
      draftInput.focus();
      return;
    }

    setMascot('thinking', 'Drafting with Eve agent...');
    submitDraftBtn.disabled = true;

    await emitEvent('desktop:submit-draft', {
      content: text,
      platform: selectedPlatform,
    });
  }

  // Event Listeners for UI
  draftInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleDraftSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      emitEvent('desktop:hide-window');
    }
  });

  draftInput.addEventListener('input', () => {
    if (draftInput.value.trim().length > 0) {
      if (mascotStatus.textContent === 'What should I draft today?') {
        setMascot('idle', 'Listening...');
      }
    } else {
      setMascot('idle', 'What should I draft today?');
    }
  });

  submitDraftBtn.addEventListener('click', handleDraftSubmit);

  closeBtn.addEventListener('click', () => {
    emitEvent('desktop:hide-window');
  });

  openWebBtn.addEventListener('click', () => {
    emitEvent('desktop:open-browser', { path: '/' });
  });

  pendingBadgeBtn.addEventListener('click', () => {
    emitEvent('desktop:open-browser', { path: '/drafts' });
  });

  // Settings Modal
  openSettingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.remove('hidden');
    settingsFeedback.textContent = '';
    settingsFeedback.className = 'settings-feedback';
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
  });

  saveSettingsBtn.addEventListener('click', async () => {
    const apiUrl = apiUrlInput.value.trim() || 'https://joey.evonera.com';
    const apiToken = apiTokenInput.value.trim();
    settingsFeedback.textContent = 'Saving...';
    settingsFeedback.className = 'settings-feedback';
    await emitEvent('desktop:save-config', { apiUrl, apiToken });
  });

  testConnectionBtn.addEventListener('click', async () => {
    settingsFeedback.textContent = 'Testing connection...';
    settingsFeedback.className = 'settings-feedback';
    const apiUrl = apiUrlInput.value.trim() || 'https://joey.evonera.com';
    const apiToken = apiTokenInput.value.trim();
    await emitEvent('desktop:test-connection', { apiUrl, apiToken });
  });

  // Global Keybinds inside window
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!settingsOverlay.classList.contains('hidden')) {
        settingsOverlay.classList.add('hidden');
      } else {
        emitEvent('desktop:hide-window');
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      settingsOverlay.classList.toggle('hidden');
    }
  });

  // Initialize and register Tauri listeners
  window.addEventListener('DOMContentLoaded', async () => {
    draftInput.focus();

    // Listen for incoming settings from Rust backend
    await listenEvent('desktop:settings', (payload) => {
      if (payload) {
        if (payload.apiUrl) apiUrlInput.value = payload.apiUrl;
        if (payload.apiToken) apiTokenInput.value = payload.apiToken;
        if (typeof payload.pendingCount === 'number') {
          pendingCountText.textContent = `${payload.pendingCount} pending`;
        }
      }
    });

    // Listen for draft status changes
    await listenEvent('desktop:draft-status', (payload) => {
      if (payload && typeof payload.pendingCount === 'number') {
        pendingCountText.textContent = `${payload.pendingCount} pending`;
      }
    });

    // Listen for submit result
    await listenEvent('desktop:submit-result', (payload) => {
      submitDraftBtn.disabled = false;
      if (payload?.success) {
        setMascot('success', 'Purrfect! Draft queued 🐾');
        draftInput.value = '';
        setTimeout(() => {
          setMascot('idle', 'What should I draft today?');
          emitEvent('desktop:hide-window');
        }, 900);
      } else {
        setMascot('idle', `Error: ${payload?.error || 'Failed to submit'}`);
      }
    });

    // Listen for save result
    await listenEvent('desktop:save-result', (payload) => {
      if (payload?.success) {
        settingsFeedback.textContent = 'Settings saved successfully!';
        settingsFeedback.className = 'settings-feedback success';
        setTimeout(() => {
          settingsOverlay.classList.add('hidden');
        }, 600);
      } else {
        settingsFeedback.textContent = `Save failed: ${payload?.error || 'Unknown error'}`;
        settingsFeedback.className = 'settings-feedback error';
      }
    });

    // Listen for test connection result
    await listenEvent('desktop:test-result', (payload) => {
      if (payload?.success) {
        settingsFeedback.textContent = `Connected! (${payload.count ?? 0} pending drafts)`;
        settingsFeedback.className = 'settings-feedback success';
      } else {
        settingsFeedback.textContent = `Connection failed: ${payload?.error || 'Check token & URL'}`;
        settingsFeedback.className = 'settings-feedback error';
      }
    });

    // Announce to Rust that frontend is ready
    await emitEvent('desktop:ready');
  });
})();
