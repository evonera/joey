// Joey Quick Capture Desktop Companion
(function () {
  // DOM Elements - Navigation & Mascot
  const mascotBadge = document.getElementById('mascotBadge');
  const mascotStatus = document.getElementById('mascotStatus');
  const tabComposeBtn = document.getElementById('tabComposeBtn');
  const tabReviewBtn = document.getElementById('tabReviewBtn');
  const pendingCountBadge = document.getElementById('pendingCountBadge');
  const closeBtn = document.getElementById('closeBtn');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');

  // DOM Elements - Compose View
  const composeView = document.getElementById('composeView');
  const composeFooter = document.getElementById('composeFooter');
  const draftInput = document.getElementById('draftInput');
  const submitDraftBtn = document.getElementById('submitDraftBtn');
  const openWebBtn = document.getElementById('openWebBtn');
  const platformChips = document.querySelectorAll('.chip');

  // DOM Elements - Review View
  const reviewView = document.getElementById('reviewView');
  const reviewFooter = document.getElementById('reviewFooter');
  const reviewEmpty = document.getElementById('reviewEmpty');
  const reviewCard = document.getElementById('reviewCard');
  const reviewCounter = document.getElementById('reviewCounter');
  const reviewPlatformBadge = document.getElementById('reviewPlatformBadge');
  const reviewDate = document.getElementById('reviewDate');
  const reviewBody = document.getElementById('reviewBody');
  const prevDraftBtn = document.getElementById('prevDraftBtn');
  const nextDraftBtn = document.getElementById('nextDraftBtn');
  const reviewOpenWebBtn = document.getElementById('reviewOpenWebBtn');
  const rejectDraftBtn = document.getElementById('rejectDraftBtn');
  const approveDraftBtn = document.getElementById('approveDraftBtn');

  // DOM Elements - Settings Modal
  const settingsOverlay = document.getElementById('settingsOverlay');
  const apiUrlInput = document.getElementById('apiUrlInput');
  const apiTokenInput = document.getElementById('apiTokenInput');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsFeedback = document.getElementById('settingsFeedback');

  // State
  let currentView = 'compose';
  let selectedPlatform = 'all';
  let pendingDrafts = [];
  let currentDraftIndex = 0;
  let isActionInProgress = false;
  const handledDraftIds = new Set();

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

  function updateBadge(count) {
    pendingCountBadge.textContent = count;
    if (count === 0) {
      pendingCountBadge.classList.add('zero');
    } else {
      pendingCountBadge.classList.remove('zero');
    }
  }

  // View Switching
  function switchView(viewName) {
    if (viewName === 'compose') {
      currentView = 'compose';
      tabComposeBtn.classList.add('active');
      tabReviewBtn.classList.remove('active');
      composeView.classList.remove('hidden');
      composeFooter.classList.remove('hidden');
      reviewView.classList.add('hidden');
      reviewFooter.classList.add('hidden');
      setMascot('idle', 'What should I draft today?');
      setTimeout(() => draftInput.focus(), 50);
    } else if (viewName === 'review') {
      currentView = 'review';
      tabReviewBtn.classList.add('active');
      tabComposeBtn.classList.remove('active');
      composeView.classList.add('hidden');
      composeFooter.classList.add('hidden');
      reviewView.classList.remove('hidden');
      reviewFooter.classList.remove('hidden');
      setMascot('idle', 'Reviewing pending drafts...');
      emitEvent('desktop:fetch-pending-drafts');
    }
  }

  tabComposeBtn.addEventListener('click', () => switchView('compose'));
  tabReviewBtn.addEventListener('click', () => switchView('review'));

  // Platform Chips
  platformChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      platformChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedPlatform = chip.getAttribute('data-platform') || 'all';
    });
  });

  // Compose / Submit Draft
  async function handleDraftSubmit() {
    const text = draftInput.value.trim();
    if (!text) {
      setMascot('idle', 'Input is empty! Paste an idea or link.');
      draftInput.focus();
      return;
    }

    setMascot('thinking', 'Drafting with Eve agent...');
    submitDraftBtn.disabled = true;

    const plat = selectedPlatform === 'twitter' ? 'x' : selectedPlatform;
    await emitEvent('desktop:submit-draft', {
      content: text,
      platform: plat,
    });
  }

  submitDraftBtn.addEventListener('click', handleDraftSubmit);

  // Keybindings in Compose Input
  draftInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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

  // Review Drafts Rendering & Navigation
  function renderDrafts() {
    updateBadge(pendingDrafts.length);

    if (pendingDrafts.length === 0) {
      reviewEmpty.classList.remove('hidden');
      reviewCard.classList.add('hidden');
      prevDraftBtn.disabled = true;
      nextDraftBtn.disabled = true;
      rejectDraftBtn.disabled = true;
      approveDraftBtn.disabled = true;
      setMascot('idle', 'All caught up! 🎉');
      return;
    }

    reviewEmpty.classList.add('hidden');
    reviewCard.classList.remove('hidden');

    if (currentDraftIndex >= pendingDrafts.length) {
      currentDraftIndex = pendingDrafts.length - 1;
    }
    if (currentDraftIndex < 0) {
      currentDraftIndex = 0;
    }

    const draft = pendingDrafts[currentDraftIndex];
    reviewCounter.textContent = `Draft ${currentDraftIndex + 1} of ${pendingDrafts.length}`;

    const plat = (
      draft.platformOptions?.platform ||
      draft.platform ||
      'all'
    ).toLowerCase();
    const platLabels = {
      x: '𝕏 Twitter',
      twitter: '𝕏 Twitter',
      linkedin: 'LinkedIn',
      facebook: 'Facebook',
      all: 'All Channels',
    };
    reviewPlatformBadge.textContent = platLabels[plat] || plat.toUpperCase();

    let displayContent = draft.content || '';
    if (!displayContent && draft.variants) {
      if (Array.isArray(draft.variants) && draft.variants.length > 0) {
        const v = draft.variants[0];
        displayContent = v.content || v.text || '';
      } else if (typeof draft.variants === 'object') {
        const keys = Object.keys(draft.variants);
        if (keys.length > 0) {
          const val = draft.variants[keys[0]];
          displayContent = typeof val === 'string' ? val : (val?.content || val?.text || '');
        }
      }
    }
    reviewBody.textContent = displayContent;

    if (draft.createdAt) {
      const d = new Date(draft.createdAt);
      reviewDate.textContent = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      reviewDate.textContent = '';
    }

    prevDraftBtn.disabled = currentDraftIndex === 0;
    nextDraftBtn.disabled = currentDraftIndex === pendingDrafts.length - 1;
    rejectDraftBtn.disabled = false;
    approveDraftBtn.disabled = false;
  }

  function prevDraft() {
    if (currentDraftIndex > 0) {
      currentDraftIndex--;
      renderDrafts();
    }
  }

  function nextDraft() {
    if (currentDraftIndex < pendingDrafts.length - 1) {
      currentDraftIndex++;
      renderDrafts();
    }
  }

  prevDraftBtn.addEventListener('click', prevDraft);
  nextDraftBtn.addEventListener('click', nextDraft);

  // In-HUD Approve & Reject Handlers
  async function handleApprove() {
    if (!pendingDrafts.length || isActionInProgress) return;
    const draft = pendingDrafts[currentDraftIndex];
    if (!draft?.id) return;

    isActionInProgress = true;
    setMascot('thinking', 'Approving draft...');
    approveDraftBtn.disabled = true;
    rejectDraftBtn.disabled = true;

    const payload = { id: draft.id };
    if (!draft.content && draft.variants) {
      if (Array.isArray(draft.variants) && draft.variants.length > 0) {
        const v = draft.variants[0];
        payload.variantName = v.variantName || v.name || 'default';
        payload.content = v.content || v.text || '';
      } else if (typeof draft.variants === 'object') {
        const keys = Object.keys(draft.variants);
        if (keys.length > 0) {
          payload.variantName = keys[0];
          const val = draft.variants[keys[0]];
          payload.content = typeof val === 'string' ? val : (val?.content || val?.text || '');
        }
      }
    }

    await emitEvent('desktop:approve-draft', payload);
  }

  async function handleReject() {
    if (!pendingDrafts.length || isActionInProgress) return;
    const draft = pendingDrafts[currentDraftIndex];
    if (!draft?.id) return;

    isActionInProgress = true;
    setMascot('thinking', 'Rejecting draft...');
    approveDraftBtn.disabled = true;
    rejectDraftBtn.disabled = true;

    await emitEvent('desktop:reject-draft', { id: draft.id });
  }

  approveDraftBtn.addEventListener('click', handleApprove);
  rejectDraftBtn.addEventListener('click', handleReject);

  // Common Header & Footer Buttons
  closeBtn.addEventListener('click', () => {
    emitEvent('desktop:hide-window');
  });

  openWebBtn.addEventListener('click', () => {
    emitEvent('desktop:open-browser', { path: '/' });
  });

  reviewOpenWebBtn.addEventListener('click', () => {
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

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!settingsOverlay.classList.contains('hidden')) {
        settingsOverlay.classList.add('hidden');
      } else {
        emitEvent('desktop:hide-window');
      }
      return;
    }

    // Toggle Settings: Cmd+, / Ctrl+,
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      settingsOverlay.classList.toggle('hidden');
      return;
    }

    // Switch Tabs: Cmd+1 (Compose) / Cmd+2 (Review)
    if ((e.metaKey || e.ctrlKey) && e.key === '1') {
      e.preventDefault();
      switchView('compose');
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '2') {
      e.preventDefault();
      switchView('review');
      return;
    }

    // Review Mode Actions
    if (currentView === 'review' && settingsOverlay.classList.contains('hidden')) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleApprove();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === 'Backspace' || e.key === 'Delete')
      ) {
        e.preventDefault();
        handleReject();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevDraft();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextDraft();
      }
    }
  });

  // Initialize and Register Tauri Listeners
  window.addEventListener('DOMContentLoaded', async () => {
    draftInput.focus();

    // Listen for window focus to re-focus textarea
    await listenEvent('desktop:window-focused', () => {
      if (currentView === 'compose') {
        draftInput.focus();
      }
    });

    // Listen for incoming settings from Rust backend
    await listenEvent('desktop:settings', (payload) => {
      if (payload) {
        if (payload.apiUrl) apiUrlInput.value = payload.apiUrl;
        if (payload.apiToken) apiTokenInput.value = payload.apiToken;
        if (typeof payload.pendingCount === 'number') {
          updateBadge(payload.pendingCount);
        }
      }
    });

    // Listen for periodic draft status updates
    await listenEvent('desktop:draft-status', (payload) => {
      if (payload && typeof payload.pendingCount === 'number') {
        updateBadge(payload.pendingCount);
        if (currentView === 'review') {
          emitEvent('desktop:fetch-pending-drafts');
        }
      }
    });

    // Listen for pending drafts query result
    await listenEvent('desktop:pending-drafts-result', (payload) => {
      if (payload?.success && Array.isArray(payload.drafts)) {
        pendingDrafts = payload.drafts.filter((d) => !handledDraftIds.has(d.id));
      } else {
        pendingDrafts = [];
      }
      renderDrafts();
    });

    // Listen for 1-tap Approve result
    await listenEvent('desktop:approve-result', (payload) => {
      isActionInProgress = false;
      if (payload?.success) {
        setMascot('success', 'Purrfect! Draft approved 🐾');
        if (payload.id) handledDraftIds.add(payload.id);
        pendingDrafts = pendingDrafts.filter((d) => d.id !== payload.id);
        renderDrafts();
      } else {
        setMascot('idle', `Approval failed: ${payload?.error || 'Error'}`);
        approveDraftBtn.disabled = false;
        rejectDraftBtn.disabled = false;
      }
    });

    // Listen for 1-tap Reject result
    await listenEvent('desktop:reject-result', (payload) => {
      isActionInProgress = false;
      if (payload?.success) {
        setMascot('idle', 'Draft rejected.');
        if (payload.id) handledDraftIds.add(payload.id);
        pendingDrafts = pendingDrafts.filter((d) => d.id !== payload.id);
        renderDrafts();
      } else {
        setMascot('idle', `Rejection failed: ${payload?.error || 'Error'}`);
        approveDraftBtn.disabled = false;
        rejectDraftBtn.disabled = false;
      }
    });

    // Listen for compose submit result
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
        const count = payload.count ?? 0;
        settingsFeedback.textContent = `Connected! (${count} pending draft${count === 1 ? '' : 's'})`;
        settingsFeedback.className = 'settings-feedback success';
        updateBadge(count);
      } else {
        settingsFeedback.textContent = `Connection failed: ${payload?.error || 'Check token & URL'}`;
        settingsFeedback.className = 'settings-feedback error';
      }
    });

    // Announce to Rust that frontend is ready
    await emitEvent('desktop:ready');
  });
})();

