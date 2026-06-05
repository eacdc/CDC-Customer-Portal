/**
 * admin-nav.js
 *
 * Hides every sidebar item marked `data-admin-only="true"` until the backend
 * confirms the logged-in user is an admin (their email is in ADMIN_EMAILS).
 *
 * Items are kept hidden by default (inline `style="display: none;"` on the
 * menu <li>) so non-admins never see a flash of the admin link before the
 * check completes.
 *
 * Backend contract (added in portalapi.js):
 *   GET /api/admin/me   -> { email, isAdmin: boolean }   when authenticated
 *                       -> 401 when no token
 */
'use strict';

(function () {
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

  function showAdminItems() {
    document.querySelectorAll('[data-admin-only="true"]').forEach((el) => {
      el.style.display = '';
    });
  }

  function hideAdminItems() {
    document.querySelectorAll('[data-admin-only="true"]').forEach((el) => {
      el.style.display = 'none';
    });
  }

  async function checkAdmin() {
    const session = getStoredSession();
    if (!session || !session.token) {
      hideAdminItems();
      return;
    }
    try {
      const res = await fetch(`${getApiBase(session)}/admin/me`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.token}`,
          ...(session.sessionId ? { 'X-Session-Id': session.sessionId } : {}),
        },
      });
      if (!res.ok) {
        hideAdminItems();
        return;
      }
      const data = await res.json();
      if (data && data.isAdmin === true) {
        showAdminItems();
      } else {
        hideAdminItems();
      }
    } catch {
      hideAdminItems();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAdmin);
  } else {
    checkAdmin();
  }
})();
