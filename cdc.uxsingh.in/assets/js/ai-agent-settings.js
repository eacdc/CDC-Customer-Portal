/**
 * AI Agent Settings page
 *
 * - Lists chat agents from `GET /api/admin/chat-agents`
 * - Edits prompt + metadata via `PATCH /api/admin/chat-agents/:agentKey`
 * - Reads/updates the global OpenAI model via `/api/admin/ai-config`
 * - Renders recent invocations from `/api/admin/agent-logs`
 *
 * Auth: reuses the `cdcAuthSession` localStorage entry already populated by
 *       auth-login-cover. Same pattern as chatbot.js.
 */
'use strict';

const SESSION_KEY = 'cdcAuthSession';

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getApiBase(session) {
  if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.AUTH_API_BASE) {
    return String(window.AUTH_API_BASE).replace(/\/$/, '');
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
  return (isLocal
    ? 'http://localhost:8080/api'
    : 'https://cdc-customer-portal-backend.onrender.com/api'
  ).replace(/\/$/, '');
}

function buildAuthHeaders(session) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  if (session?.sessionId) headers['X-Session-Id'] = session.sessionId;
  return headers;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTs(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString();
  } catch {
    return '';
  }
}

function formatDuration(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return '';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function showToast(msg, kind = 'info') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const bg = kind === 'success' ? 'bg-success'
    : kind === 'error' ? 'bg-danger'
    : kind === 'warn' ? 'bg-warning text-dark'
    : 'bg-primary';
  const el = document.createElement('div');
  el.className = `toast align-items-center text-white ${bg} border-0 show mb-2`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHtml(msg)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Close"></button>
    </div>`;
  el.querySelector('.btn-close')?.addEventListener('click', () => el.remove());
  stack.appendChild(el);
  setTimeout(() => { el.remove(); }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  const session = getStoredSession();
  const apiBase = getApiBase(session);

  // DOM refs
  const adminBanner = document.getElementById('adminAccessBanner');
  const adminBannerText = document.getElementById('adminAccessBannerText');

  const aiModelInput = document.getElementById('aiModelInput');
  const aiModelSaveBtn = document.getElementById('aiModelSaveBtn');
  const classifierModelInput = document.getElementById('classifierModelInput');

  const agentListEl = document.getElementById('agentList');
  const refreshAgentsBtn = document.getElementById('refreshAgentsBtn');

  const editorEmpty = document.getElementById('editorEmptyState');
  const editorPanel = document.getElementById('editorPanel');
  const editorAgentName = document.getElementById('editorAgentName');
  const editorAgentKey = document.getElementById('editorAgentKey');
  const editorAgentUpdatedAt = document.getElementById('editorAgentUpdatedAt');
  const editorAgentStatus = document.getElementById('editorAgentStatus');

  const systemPromptInput = document.getElementById('systemPromptInput');
  const savePromptBtn = document.getElementById('savePromptBtn');
  const resetPromptBtn = document.getElementById('resetPromptBtn');

  const agentNameInput = document.getElementById('agentNameInput');
  const agentButtonInput = document.getElementById('agentButtonInput');
  const agentDescriptionInput = document.getElementById('agentDescriptionInput');
  const agentInitialMessageInput = document.getElementById('agentInitialMessageInput');
  const agentActiveInput = document.getElementById('agentActiveInput');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const resetConfigBtn = document.getElementById('resetConfigBtn');

  const logFilterAgent = document.getElementById('logFilterAgent');
  const logFilterPhone = document.getElementById('logFilterPhone');
  const refreshLogsBtn = document.getElementById('refreshLogsBtn');
  const agentLogsBody = document.getElementById('agentLogsBody');
  const waLogsBody = document.getElementById('waLogsBody');
  const portalLogsTable = document.getElementById('portalLogsTable');
  const whatsappLogsTable = document.getElementById('whatsappLogsTable');
  const logsSubtitle = document.getElementById('logsSubtitle');

  // Which source is active: "portal" or "whatsapp"
  let activeLogSource = 'portal';

  // In-memory state
  let agents = [];
  let selectedAgentKey = null;
  let selectedAgentSnapshot = null; // last-loaded copy used for reset

  // ---------- Auth bootstrap ----------
  if (!session || !session.token) {
    if (adminBanner) {
      adminBanner.classList.remove('d-none');
      adminBannerText.textContent =
        'You are not signed in. Please log in to access AI agent settings.';
    }
    disableAll();
    return;
  }

  function disableAll() {
    [aiModelInput, classifierModelInput, aiModelSaveBtn, savePromptBtn, resetPromptBtn,
     saveConfigBtn, resetConfigBtn, refreshAgentsBtn, refreshLogsBtn, logFilterAgent]
      .forEach((el) => { if (el) el.setAttribute('disabled', 'disabled'); });
  }

  // ---------- API helpers ----------
  async function apiFetch(path, opts = {}) {
    const url = `${apiBase}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: { ...buildAuthHeaders(session), ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      adminBanner?.classList.remove('d-none');
      adminBannerText.textContent =
        'Session expired. Please sign in again to access AI agent settings.';
      throw new Error('Unauthorized');
    }
    if (res.status === 403) {
      adminBanner?.classList.remove('d-none');
      adminBannerText.textContent =
        'Your account is not in ADMIN_EMAILS. Ask an administrator to grant you access.';
      throw new Error('Forbidden');
    }
    if (!res.ok) {
      let body = '';
      try { body = JSON.stringify(await res.json()); } catch { body = await res.text(); }
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  // ---------- Global model + WhatsApp classifier model ----------
  async function loadAiConfig() {
    try {
      const data = await apiFetch('/admin/ai-config');
      aiModelInput.value = data.model || '';
      aiModelInput.placeholder = data.envFallback || 'gpt-4o-mini';
      if (classifierModelInput) {
        classifierModelInput.value = data.classifier_model || '';
        classifierModelInput.placeholder = '(uses main model)';
      }
      if (!data.openAiKeyConfigured) {
        showToast('OPENAI_API_KEY is not set on the backend — agents will not respond.', 'warn');
      }
      if (data.gupshupConfigured === false) {
        showToast('Gupshup credentials are not set on the backend — WhatsApp messaging will be inactive.', 'warn');
      }
    } catch (err) {
      if (err.message !== 'Unauthorized' && err.message !== 'Forbidden') {
        showToast(`Failed to load AI config: ${err.message}`, 'error');
      }
    }
  }

  async function saveAiConfig() {
    const model = (aiModelInput.value || '').trim();
    if (!model) {
      showToast('Main model name cannot be empty.', 'warn');
      return;
    }
    // Empty classifier_model is allowed — it means "reuse the main model".
    const classifierModel = (classifierModelInput?.value || '').trim();
    aiModelSaveBtn.setAttribute('disabled', 'disabled');
    try {
      const data = await apiFetch('/admin/ai-config', {
        method: 'PATCH',
        body: JSON.stringify({ model, classifier_model: classifierModel || null }),
      });
      aiModelInput.value = data.model;
      if (classifierModelInput) classifierModelInput.value = data.classifier_model || '';
      const cm = data.classifier_model
        ? ` Classifier: "${data.classifier_model}".`
        : ' Classifier: (uses main model).';
      showToast(`Saved. Main model: "${data.model}".${cm}`, 'success');
    } catch (err) {
      showToast(`Failed to update model: ${err.message}`, 'error');
    } finally {
      aiModelSaveBtn.removeAttribute('disabled');
    }
  }

  aiModelSaveBtn?.addEventListener('click', saveAiConfig);

  // ---------- Agents list + editor ----------
  function renderAgentList() {
    if (!agents.length) {
      agentListEl.innerHTML =
        '<li class="list-group-item text-body-secondary small">No agents found.</li>';
      return;
    }
    agentListEl.innerHTML = agents.map((a) => {
      const active = a.agentKey === selectedAgentKey ? ' active' : '';
      const dot = a.isActive ? 'active' : 'inactive';
      return `
        <li class="list-group-item agent-item${active}" data-agent-key="${escapeHtml(a.agentKey)}">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="fw-medium">${escapeHtml(a.name || a.agentKey)}</div>
              <small class="text-body-secondary badge-agent-key">${escapeHtml(a.agentKey)}</small>
            </div>
            <span class="agent-status-dot ${dot}" title="${a.isActive ? 'Active' : 'Inactive'}"></span>
          </div>
        </li>`;
    }).join('');
    agentListEl.querySelectorAll('.agent-item').forEach((el) => {
      el.addEventListener('click', () => selectAgent(el.dataset.agentKey));
    });
  }

  function populateLogFilter() {
    if (!logFilterAgent) return;
    const cur = logFilterAgent.value;
    logFilterAgent.innerHTML =
      '<option value="">All agents</option>' +
      agents.map((a) =>
        `<option value="${escapeHtml(a.agentKey)}">${escapeHtml(a.name || a.agentKey)}</option>`
      ).join('');
    if (cur && agents.some((a) => a.agentKey === cur)) logFilterAgent.value = cur;
  }

  function selectAgent(key) {
    const a = agents.find((x) => x.agentKey === key);
    if (!a) return;
    selectedAgentKey = key;
    selectedAgentSnapshot = JSON.parse(JSON.stringify(a));
    renderAgentList();
    renderEditor(a);
  }

  function renderEditor(a) {
    editorEmpty.classList.add('d-none');
    editorPanel.classList.remove('d-none');

    editorAgentName.textContent = a.name || a.agentKey;
    editorAgentKey.textContent = a.agentKey;
    editorAgentUpdatedAt.textContent = a.updatedAt
      ? `Updated ${formatTs(a.updatedAt)}` : '';

    editorAgentStatus.textContent = a.isActive ? 'Active' : 'Inactive';
    editorAgentStatus.className = 'badge ' + (a.isActive ? 'bg-label-success' : 'bg-label-secondary');

    systemPromptInput.value = a.systemPrompt || '';
    agentNameInput.value = a.name || '';
    agentButtonInput.value = a.buttonText || '';
    agentDescriptionInput.value = a.description || '';
    agentInitialMessageInput.value = a.initialMessage || '';
    agentActiveInput.checked = a.isActive !== false;
  }

  function resetPrompt() {
    if (!selectedAgentSnapshot) return;
    systemPromptInput.value = selectedAgentSnapshot.systemPrompt || '';
  }

  function resetConfig() {
    if (!selectedAgentSnapshot) return;
    agentNameInput.value = selectedAgentSnapshot.name || '';
    agentButtonInput.value = selectedAgentSnapshot.buttonText || '';
    agentDescriptionInput.value = selectedAgentSnapshot.description || '';
    agentInitialMessageInput.value = selectedAgentSnapshot.initialMessage || '';
    agentActiveInput.checked = selectedAgentSnapshot.isActive !== false;
  }

  async function loadAgents() {
    try {
      agentListEl.innerHTML =
        '<li class="list-group-item text-body-secondary small">Loading agents…</li>';
      const data = await apiFetch('/admin/chat-agents');
      agents = Array.isArray(data.agents) ? data.agents : [];
      renderAgentList();
      populateLogFilter();

      if (selectedAgentKey) {
        const found = agents.find((a) => a.agentKey === selectedAgentKey);
        if (found) {
          selectedAgentSnapshot = JSON.parse(JSON.stringify(found));
          renderEditor(found);
        } else {
          selectedAgentKey = null;
          editorEmpty.classList.remove('d-none');
          editorPanel.classList.add('d-none');
        }
      }
    } catch (err) {
      if (err.message !== 'Unauthorized' && err.message !== 'Forbidden') {
        agentListEl.innerHTML =
          `<li class="list-group-item text-danger small">Failed to load: ${escapeHtml(err.message)}</li>`;
      } else {
        agentListEl.innerHTML =
          '<li class="list-group-item text-body-secondary small">Access denied.</li>';
      }
    }
  }

  async function patchAgent(patch, ok) {
    if (!selectedAgentKey) return;
    try {
      const data = await apiFetch(
        `/admin/chat-agents/${encodeURIComponent(selectedAgentKey)}`,
        { method: 'PATCH', body: JSON.stringify(patch) }
      );
      const idx = agents.findIndex((a) => a.agentKey === data.agent.agentKey);
      if (idx >= 0) agents[idx] = data.agent;
      selectedAgentSnapshot = JSON.parse(JSON.stringify(data.agent));
      renderAgentList();
      renderEditor(data.agent);
      showToast(ok, 'success');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  }

  savePromptBtn?.addEventListener('click', () => {
    patchAgent({ systemPrompt: systemPromptInput.value }, 'Prompt saved.');
  });
  resetPromptBtn?.addEventListener('click', resetPrompt);

  saveConfigBtn?.addEventListener('click', () => {
    patchAgent({
      name: agentNameInput.value,
      buttonText: agentButtonInput.value,
      description: agentDescriptionInput.value,
      initialMessage: agentInitialMessageInput.value,
      isActive: agentActiveInput.checked,
    }, 'Config saved.');
  });
  resetConfigBtn?.addEventListener('click', resetConfig);

  refreshAgentsBtn?.addEventListener('click', loadAgents);

  // ---------- Portal logs ----------
  async function loadPortalLogs() {
    const agentKey = logFilterAgent?.value || '';
    const qs = new URLSearchParams({ limit: '100' });
    if (agentKey) qs.set('agentKey', agentKey);
    try {
      agentLogsBody.innerHTML =
        '<tr><td colspan="6" class="text-body-secondary text-center py-4">Loading logs…</td></tr>';
      const data = await apiFetch(`/admin/agent-logs?${qs.toString()}`);
      const logs = Array.isArray(data.logs) ? data.logs : [];
      if (!logs.length) {
        agentLogsBody.innerHTML =
          '<tr><td colspan="6" class="text-body-secondary text-center py-4">No agent activity yet.</td></tr>';
        return;
      }
      agentLogsBody.innerHTML = logs.map((l) => `
        <tr>
          <td><small>${escapeHtml(formatTs(l.ts))}</small></td>
          <td>
            <div class="fw-medium">${escapeHtml(l.agentName || '—')}</div>
            <small class="text-body-secondary badge-agent-key">${escapeHtml(l.agentKey || '')}</small>
          </td>
          <td><small>${escapeHtml(l.userId || '')}</small></td>
          <td><small>${escapeHtml(l.model || '')}</small></td>
          <td><small>${escapeHtml(formatDuration(l.durationMs))}</small></td>
          <td class="preview" title="${escapeHtml(l.messagePreview || '')}">
            <small>${escapeHtml(l.messagePreview || '')}</small>
          </td>
        </tr>`).join('');
    } catch (err) {
      if (err.message !== 'Unauthorized' && err.message !== 'Forbidden') {
        agentLogsBody.innerHTML =
          `<tr><td colspan="6" class="text-danger text-center py-4">Failed to load logs: ${escapeHtml(err.message)}</td></tr>`;
      } else {
        agentLogsBody.innerHTML =
          '<tr><td colspan="6" class="text-body-secondary text-center py-4">Access denied.</td></tr>';
      }
    }
  }

  // ---------- WhatsApp logs ----------
  async function loadWhatsAppLogs() {
    const phone = (logFilterPhone?.value || '').trim();
    const qs = new URLSearchParams({ limit: '100' });
    if (phone) qs.set('phone', phone);
    try {
      waLogsBody.innerHTML =
        '<tr><td colspan="6" class="text-body-secondary text-center py-4">Loading logs…</td></tr>';
      const data = await apiFetch(`/admin/whatsapp-logs?${qs.toString()}`);
      const logs = Array.isArray(data.logs) ? data.logs : [];
      if (!logs.length) {
        waLogsBody.innerHTML =
          '<tr><td colspan="6" class="text-body-secondary text-center py-4">No WhatsApp activity yet.</td></tr>';
        return;
      }
      waLogsBody.innerHTML = logs.map((l) => {
        const classifierBadge = l.classifierChoice
          ? `<span class="badge bg-label-secondary me-1">${escapeHtml(l.classifierChoice)}</span>`
          : '';
        const agentBadge = l.finalAgentKey
          ? `<span class="badge bg-label-primary">${escapeHtml(l.finalAgentName || l.finalAgentKey)}</span>`
          : '—';
        const errBadge = l.ok === false
          ? `<span class="badge bg-label-danger ms-1" title="${escapeHtml(l.error || '')}">error</span>`
          : '';
        // Show total duration (classifier + agent combined)
        const totalMs = (l.classifierMs || 0) + (l.agentMs || 0);
        return `
        <tr>
          <td><small>${escapeHtml(formatTs(l.ts))}</small></td>
          <td>
            <div class="fw-medium"><i class="ti tabler-device-mobile me-1 text-success"></i>${escapeHtml(l.phone || '—')}</div>
          </td>
          <td>
            <small>${classifierBadge}→ ${agentBadge}${errBadge}</small>
          </td>
          <td><small>${escapeHtml(l.agentModel || l.classifierModel || '')}</small></td>
          <td><small>${escapeHtml(formatDuration(totalMs || null))}</small></td>
          <td class="preview" title="${escapeHtml(l.messagePreview || '')}">
            <small>${escapeHtml(l.messagePreview || '')}</small>
          </td>
        </tr>`;
      }).join('');
    } catch (err) {
      if (err.message !== 'Unauthorized' && err.message !== 'Forbidden') {
        waLogsBody.innerHTML =
          `<tr><td colspan="6" class="text-danger text-center py-4">Failed to load WhatsApp logs: ${escapeHtml(err.message)}</td></tr>`;
      } else {
        waLogsBody.innerHTML =
          '<tr><td colspan="6" class="text-body-secondary text-center py-4">Access denied.</td></tr>';
      }
    }
  }

  function loadLogs() {
    if (activeLogSource === 'whatsapp') loadWhatsAppLogs();
    else loadPortalLogs();
  }

  // ---------- Toggle between Portal and WhatsApp ----------
  function applyLogSourceToggle(source) {
    activeLogSource = source;
    const isWa = source === 'whatsapp';

    // Show/hide the correct table and filter
    portalLogsTable?.classList.toggle('d-none', isWa);
    whatsappLogsTable?.classList.toggle('d-none', !isWa);
    logFilterAgent?.classList.toggle('d-none', isWa);
    logFilterPhone?.classList.toggle('d-none', !isWa);

    // Update subtitle text
    if (logsSubtitle) {
      logsSubtitle.innerHTML = isWa
        ? 'Each row is one inbound WhatsApp message. Shows the phone number, classifier decision, and final agent.'
        : 'Each row is one call to <code>POST /api/chat/message</code>. Shows which agent was picked for the user\'s request.';
    }

    loadLogs();
  }

  document.querySelectorAll('input[name="logSource"]').forEach((radio) => {
    radio.addEventListener('change', (e) => applyLogSourceToggle(e.target.value));
  });

  refreshLogsBtn?.addEventListener('click', loadLogs);
  logFilterAgent?.addEventListener('change', loadPortalLogs);
  logFilterPhone?.addEventListener('change', loadWhatsAppLogs);

  // ---------- Boot ----------
  loadAiConfig();
  loadAgents();
  loadLogs();

  // Refresh logs every 15s so admins see new activity live.
  setInterval(() => {
    if (!document.hidden) loadLogs();
  }, 15000);
});
