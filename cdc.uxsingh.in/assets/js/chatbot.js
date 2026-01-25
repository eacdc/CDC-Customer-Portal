/**
 * Chatbot – integrated with backend chat_sessions, chat/history, chat/message, chat/agents
 * Uses cdcAuthSession (token, apiBase). Requires JWT for history and message; agents can 401 → fallback to static list.
 */
'use strict';

const CHATBOT_SESSION_KEY = 'cdcAuthSession';

function getStoredSession() {
  try {
    const raw = localStorage.getItem(CHATBOT_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getApiBase(session) {
  if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
  return (isLocal ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
}

function buildAuthHeaders(session) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  if (session?.sessionId) headers['X-Session-Id'] = session.sessionId;
  return headers;
}

/** Escape HTML and render **bold**, *italic*, and newlines in chat messages. */
function formatChatText(raw) {
  if (typeof raw !== 'string') return '';
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// Fallback when /api/chat/agents is not available (e.g. 401)
const FALLBACK_AGENTS = [
  { agentKey: 'packaging-quote', buttonText: 'Instant quote for your packaging project' },
  { agentKey: 'book-quote', buttonText: 'Instant quote for a book' },
  { agentKey: 'order-status', buttonText: 'Get order status' },
  { agentKey: 'cdc-info', buttonText: 'Know about CDC' }
];

document.addEventListener('DOMContentLoaded', function () {
  const chatbotBtn = document.getElementById('chatbot-btn');
  const chatScreen = document.querySelector('.first-chat-screen:not(.second-screen)');
  const secondScreen = document.querySelector('.first-chat-screen.second-screen');
  if (!chatbotBtn || !chatScreen || !secondScreen) return;

  const minimiseBtn = chatScreen.querySelector('.fsc-right .minimise');
  const chatQuestionsEl = chatScreen.querySelector('.chat-questions');

  const backBtn = secondScreen.querySelector('.chat-back-btn');
  const minimiseBtn2 = secondScreen.querySelector('.fsc-right .minimise');
  let chatBody2 = secondScreen.querySelector('.fsc-body-inner');
  if (!chatBody2) {
    const body = secondScreen.querySelector('.fsc-body');
    if (body) {
      const inner = document.createElement('div');
      inner.className = 'fsc-body-inner';
      while (body.firstChild) inner.appendChild(body.firstChild);
      body.appendChild(inner);
      chatBody2 = inner;
    } else {
      chatBody2 = null;
    }
  }

  function logScrollDebug(label) {
    if (typeof console === 'undefined' || !console.log) return;
    const L = function (msg, obj) { console.log('[chatbot-scroll] ' + label + ' – ' + msg, obj !== undefined ? obj : ''); };
    L('chatBody2 exists?', !!chatBody2);
    if (!chatBody2) return;
    L('chatBody2', { tagName: chatBody2.tagName, className: chatBody2.className });
    const cs = getComputedStyle(chatBody2);
    L('chatBody2 dimensions', {
      clientHeight: chatBody2.clientHeight,
      scrollHeight: chatBody2.scrollHeight,
      offsetHeight: chatBody2.offsetHeight,
      scrollTop: chatBody2.scrollTop
    });
    L('chatBody2 computed', {
      overflowY: cs.overflowY,
      overflow: cs.overflow,
      height: cs.height,
      maxHeight: cs.maxHeight,
      minHeight: cs.minHeight,
      flex: cs.flex,
      display: cs.display
    });
    const parent = chatBody2.parentElement;
    if (parent) {
      const pcs = getComputedStyle(parent);
      L('parent .fsc-body', {
        className: parent.className,
        clientHeight: parent.clientHeight,
        scrollHeight: parent.scrollHeight,
        overflow: pcs.overflow,
        flex: pcs.flex
      });
    }
    const grandparent = parent ? parent.parentElement : null;
    if (grandparent) {
      const gcs = getComputedStyle(grandparent);
      L('grandparent .first-chat-screen', {
        clientHeight: grandparent.clientHeight,
        scrollHeight: grandparent.scrollHeight,
        height: gcs.height,
        display: gcs.display
      });
    }
    L('SHOULD SHOW SCROLLBAR? scrollHeight > clientHeight', chatBody2.scrollHeight > chatBody2.clientHeight);
  }

  const chatFooter2 = secondScreen.querySelector('.fsc-footer');
  const exitPopup = secondScreen.querySelector('.exit-popup');
  const confirmExitBtn = secondScreen.querySelector('.exit-popup .confirm');
  const cancelExitBtn = secondScreen.querySelector('.exit-popup .cancel');

  const chatInput = secondScreen.querySelector('.chat-input, input[name="chat"]');
  const sendBtn = secondScreen.querySelector('.chat-send-btn, .fsc-text-inpt img[alt="send-btn"]');

  /** When user minimizes, remember which screen/agent was open so reopening shows the same. */
  let lastAgentKeyWhenMinimised = null;

  // ---- Populate agents (from API or fallback) ----
  async function fetchAndRenderAgents() {
    const session = getStoredSession();
    const apiBase = getApiBase(session);
    let list = FALLBACK_AGENTS;
    try {
      const res = await fetch(apiBase + '/chat/agents', { headers: buildAuthHeaders(session) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.agents) && data.agents.length) {
          list = data.agents.map((a) => ({ agentKey: a.agentKey, buttonText: a.buttonText || a.name }));
        }
      }
    } catch (e) {
      console.warn('[chatbot] fetchAgents failed, using fallback', e);
    }
    if (!chatQuestionsEl) return;
    chatQuestionsEl.innerHTML = '';
    list.forEach((a) => {
      const p = document.createElement('p');
      p.className = 'chat-q';
      p.dataset.agentKey = a.agentKey;
      p.textContent = a.buttonText;
      chatQuestionsEl.appendChild(p);
    });
  }

  // ---- Load chat history for an agent ----
  async function loadChatHistory(agentKey) {
    const session = getStoredSession();
    const container = chatBody2;
    if (!container) return;
    container.innerHTML = '<div class="text-secondary p-2">Loading…</div>';

    const apiBase = getApiBase(session);
    try {
      const res = await fetch(apiBase + '/chat/history?agentKey=' + encodeURIComponent(agentKey), {
        headers: buildAuthHeaders(session)
      });
      const data = res.ok ? await res.json() : null;

      container.innerHTML = '';
      if (!res.ok) {
        const div = document.createElement('div');
        const p = document.createElement('p');
        p.className = 'bot';
        p.innerHTML = formatChatText(res.status === 401 ? 'Please sign in to load chat history.' : 'Could not load chat.');
        div.appendChild(p);
        container.appendChild(div);
        scrollChatToBottom();
        afterScrollLog('after loadChatHistory (!res.ok)');
        return;
      }

      const messages = data && Array.isArray(data.messages) ? data.messages : [];
      messages.forEach((m) => {
        const d = document.createElement('div');
        const p = document.createElement('p');
        p.className = m.role === 'user' ? 'user' : 'bot';
        p.innerHTML = formatChatText(m.content || '');
        d.appendChild(p);
        container.appendChild(d);
      });
      scrollChatToBottom();
      afterScrollLog('after loadChatHistory (messages)');
    } catch (e) {
      container.innerHTML = '';
      const div = document.createElement('div');
      const p = document.createElement('p');
      p.className = 'bot';
      p.innerHTML = formatChatText('Could not load chat.');
      div.appendChild(p);
      container.appendChild(div);
      scrollChatToBottom();
      afterScrollLog('after loadChatHistory (catch)');
    }
  }

  function scrollChatToBottom() {
    if (chatBody2) chatBody2.scrollTop = chatBody2.scrollHeight;
  }

  function afterScrollLog(tag) {
    requestAnimationFrame(function () { logScrollDebug(tag); });
  }

  // ---- Send message ----
  async function sendMessage() {
    const agentKey = secondScreen.dataset.agentKey;
    if (!agentKey) return;
    const input = chatInput;
    if (!input) return;
    const content = (input.value || '').trim();
    if (!content) return;

    const session = getStoredSession();
    const container = chatBody2;
    if (!container) return;

    // Append user bubble
    const divUser = document.createElement('div');
    const pUser = document.createElement('p');
    pUser.className = 'user';
    pUser.innerHTML = formatChatText(content);
    divUser.appendChild(pUser);
    container.appendChild(divUser);
    input.value = '';
    scrollChatToBottom();

    // Typing indicator
    const divBot = document.createElement('div');
    const pBot = document.createElement('p');
    pBot.className = 'bot';
    pBot.textContent = 'Typing…';
    divBot.appendChild(pBot);
    container.appendChild(divBot);
    scrollChatToBottom();

    const apiBase = getApiBase(session);
    try {
      const res = await fetch(apiBase + '/chat/message', {
        method: 'POST',
        headers: buildAuthHeaders(session),
        body: JSON.stringify({ agentKey, message: { role: 'user', content } })
      });

      if (res.status === 401) {
        pBot.innerHTML = formatChatText('Session expired. Sign in again to save messages.');
        scrollChatToBottom();
        afterScrollLog('after sendMessage (401)');
        return;
      }

      const data = res.ok ? await res.json().catch(() => ({})) : {};
      const assistantContent =
        (data && data.assistant && typeof data.assistant.content === 'string')
          ? data.assistant.content
          : !res.ok
            ? `Could not get reply (${res.status}).`
            : 'No reply from agent.';
      pBot.innerHTML = formatChatText(assistantContent);
      scrollChatToBottom();
      afterScrollLog('after sendMessage (success)');
    } catch (e) {
      console.warn('[chatbot] sendMessage failed', e);
      pBot.innerHTML = formatChatText('Could not reach the server. Try again.');
      scrollChatToBottom();
      afterScrollLog('after sendMessage (catch)');
    }
  }

  // ---- UI: first screen ----
  [chatScreen, secondScreen].forEach((s) => {
    s.style.display = 'none';
    s.style.opacity = '0';
    s.style.transform = 'scale(0.8)';
    s.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
  });
  chatbotBtn.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  chatbotBtn.addEventListener('click', function () {
    chatbotBtn.style.opacity = '0';
    chatbotBtn.style.transform = 'scale(0.8)';
    setTimeout(() => {
      chatbotBtn.style.display = 'none';
      if (lastAgentKeyWhenMinimised) {
        chatScreen.style.display = 'none';
        secondScreen.dataset.agentKey = lastAgentKeyWhenMinimised;
        secondScreen.style.display = 'flex';
        secondScreen.style.opacity = '0';
        secondScreen.style.transform = 'scale(0.8)';
        loadChatHistory(lastAgentKeyWhenMinimised);
        setTimeout(() => {
          secondScreen.style.opacity = '1';
          secondScreen.style.transform = 'scale(1)';
        }, 20);
      } else {
        chatScreen.style.display = 'flex';
        secondScreen.style.display = 'none';
        setTimeout(() => {
          chatScreen.style.opacity = '1';
          chatScreen.style.transform = 'scale(1)';
        }, 20);
      }
    }, 300);
  });

  minimiseBtn.addEventListener('click', function () {
    lastAgentKeyWhenMinimised = null;
    chatScreen.style.opacity = '0';
    chatScreen.style.transform = 'scale(0.8)';
    setTimeout(() => {
      chatScreen.style.display = 'none';
      chatbotBtn.style.display = 'block';
      setTimeout(() => {
        chatbotBtn.style.opacity = '1';
        chatbotBtn.style.transform = 'scale(1)';
      }, 20);
    }, 400);
  });

  // ---- UI: second screen ----

  if (confirmExitBtn) {
    confirmExitBtn.addEventListener('click', function () {
      if (exitPopup) exitPopup.style.display = 'none';
      secondScreen.style.opacity = '0';
      secondScreen.style.transform = 'scale(0.8)';
      setTimeout(() => {
        secondScreen.style.display = 'none';
        chatbotBtn.style.display = 'block';
        setTimeout(() => {
          chatbotBtn.style.opacity = '1';
          chatbotBtn.style.transform = 'scale(1)';
        }, 20);
      }, 400);
    });
  }

  if (cancelExitBtn) {
    cancelExitBtn.addEventListener('click', function () {
      if (!exitPopup) return;
      exitPopup.style.opacity = '0';
      exitPopup.style.transform = 'translate(-50%, -50%) scale(0.98)';
      setTimeout(() => { exitPopup.style.display = 'none'; }, 200);
    });
  }

  minimiseBtn2.addEventListener('click', function () {
    lastAgentKeyWhenMinimised = secondScreen.dataset.agentKey || null;
    secondScreen.style.opacity = '0';
    secondScreen.style.transform = 'scale(0.8)';
    setTimeout(() => {
      secondScreen.style.display = 'none';
      chatbotBtn.style.display = 'block';
      setTimeout(() => {
        chatbotBtn.style.opacity = '1';
        chatbotBtn.style.transform = 'scale(1)';
      }, 20);
    }, 400);
  });

  // ---- Back button: second screen → first (all agents) ----
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      secondScreen.style.opacity = '0';
      secondScreen.style.transform = 'scale(0.8)';
      setTimeout(() => {
        secondScreen.style.display = 'none';
        chatScreen.style.display = 'flex';
        chatScreen.style.opacity = '0';
        chatScreen.style.transform = 'scale(0.8)';
        setTimeout(() => {
          chatScreen.style.opacity = '1';
          chatScreen.style.transform = 'scale(1)';
        }, 20);
      }, 250);
    });
  }

  // ---- Question click → second screen + load history ----
  chatScreen.addEventListener('click', function (e) {
    const q = e.target.closest('.chat-q');
    if (!q || !q.dataset.agentKey) return;
    const agentKey = q.dataset.agentKey;
    secondScreen.dataset.agentKey = agentKey;

    chatScreen.style.display = 'none';
    secondScreen.style.display = 'flex';
    secondScreen.style.opacity = '0';
    secondScreen.style.transform = 'scale(0.8)';
    setTimeout(() => {
      secondScreen.style.opacity = '1';
      secondScreen.style.transform = 'scale(1)';
    }, 20);
    loadChatHistory(agentKey);
  });

  // ---- Send: click and Enter ----
  function onSend() { sendMessage(); }
  if (sendBtn) sendBtn.addEventListener('click', onSend);
  if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSend();
      }
    });
  }

  // ---- Init ----
  fetchAndRenderAgents();
  setTimeout(function () { logScrollDebug('init (second screen may be hidden)'); }, 500);
  window.chatbotScrollDebug = function () { logScrollDebug('manual (run in console)'); };
});
