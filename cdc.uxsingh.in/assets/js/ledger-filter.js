/**
 * Ledger filter for CDC Printers users (@cdcprinters.com).
 * Injects a multi-select "Ledger" dropdown to the left of search bar and date filter.
 * Ledger names come from session (combined from both DBs). Default: all selected.
 * Filter is applied only when user clicks "OK"; "Cancel" closes without applying.
 * Fires 'ledgerFilterChange' and exposes window.getSelectedLedgerNames().
 */
'use strict';

const STORAGE_KEY = 'cdcAuthSession';

function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getLedgerNames(session) {
  const list = session?.ledgerNames;
  if (!Array.isArray(list)) return [];
  const names = list
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(names));
}

function isCdcPrintersUser(session) {
  const email = (session?.email || '').trim().toLowerCase();
  return email.endsWith('@cdcprinters.com');
}

/**
 * @returns {string[]} Applied selected ledger names.
 */
function getSelectedLedgerNames() {
  if (typeof window.__ledgerFilterSelected === 'undefined') return [];
  return window.__ledgerFilterSelected || [];
}

function setSelectedLedgerNames(selected) {
  window.__ledgerFilterSelected = Array.isArray(selected) ? selected : [];
  window.dispatchEvent(new CustomEvent('ledgerFilterChange', {
    detail: { selectedLedgers: window.__ledgerFilterSelected }
  }));
}

function updateLabel(el, selectedCount, totalCount) {
  const label = el.querySelector('.ledger-filter-label');
  if (!label) return;
  label.textContent = selectedCount === totalCount
    ? `Client Name (${totalCount} selected)`
    : selectedCount === 0
      ? 'Client Name (none)'
      : `Client Name (${selectedCount} selected)`;
}

function createLedgerFilterDropdown(ledgerNames) {
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  const id = 'ledger-filter-' + Math.random().toString(36).slice(2, 9);
  window.__ledgerFilterSelected = ledgerNames.slice();

  const dropdown = document.createElement('div');
  dropdown.className = 'ledger-filter-wrapper me-3 position-relative';
  dropdown.innerHTML = `
    <div>
      <button type="button" class="btn btn-label-primary ledger-filter-toggle-btn" id="${id}-btn" aria-expanded="false" aria-haspopup="true">
        <i class="icon-base ti tabler-building-store me-1"></i>
        <span class="ledger-filter-label">Client Name (${ledgerNames.length} selected)</span>
        <span class="ms-1">&#9662;</span>
      </button>
      <div class="ledger-filter-dropdown shadow border rounded bg-body position-absolute" id="${id}-menu" style="display:none; min-width:220px; max-width:320px; z-index:1050; top:calc(100% + 4px); left:0; flex-direction:column;">
        <div class="ledger-filter-header flex-shrink-0 border-bottom bg-body px-2 py-1">
          <a class="dropdown-item ledger-filter-select-all py-2 text-primary" href="javascript:void(0);">Select all</a>
          <a class="dropdown-item ledger-filter-deselect-all py-2 text-primary" href="javascript:void(0);">Deselect all</a>
        </div>
        <div class="ledger-filter-scroll" style="max-height:220px; overflow-y:auto; overflow-x:auto; min-height:0;">
          <ul class="list-unstyled mb-0 py-1">
            ${ledgerNames.map((name) => `
              <li>
                <label class="dropdown-item d-flex align-items-center gap-2 mb-0 cursor-pointer py-2">
                  <input type="checkbox" class="form-check-input ledger-filter-cb flex-shrink-0" value="${escapeHtml(name)}" checked>
                  <span class="text-nowrap" style="min-width:0;" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                </label>
              </li>
            `).join('')}
          </ul>
        </div>
        <div class="ledger-filter-footer flex-shrink-0 border-top bg-body p-2 d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-sm btn-secondary ledger-filter-cancel">Cancel</button>
          <button type="button" class="btn btn-sm btn-primary ledger-filter-ok">OK</button>
        </div>
      </div>
    </div>
  `;

  const toggleBtn = dropdown.querySelector('.ledger-filter-toggle-btn');
  const menuEl = dropdown.querySelector('.ledger-filter-dropdown');
  const totalCount = ledgerNames.length;

  function isOpen() {
    return menuEl.style.display !== 'none';
  }

  function openDropdown() {
    syncCheckboxesToApplied();
    menuEl.style.display = 'flex';
    menuEl.style.flexDirection = 'column';
    toggleBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    menuEl.style.display = 'none';
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  function getPendingSelection() {
    const checkboxes = dropdown.querySelectorAll('.ledger-filter-cb:checked');
    return Array.from(checkboxes).map((cb) => cb.value);
  }

  function syncCheckboxesToApplied() {
    const applied = window.__ledgerFilterSelected || [];
    const set = new Set(applied);
    dropdown.querySelectorAll('.ledger-filter-cb').forEach((cb) => {
      cb.checked = set.has(cb.value);
    });
  }

  function onOk() {
    const selected = getPendingSelection();
    window.__ledgerFilterSelected = selected;
    updateLabel(dropdown, selected.length, totalCount);
    setSelectedLedgerNames(selected);
    closeDropdown();
  }

  function onCancel() {
    syncCheckboxesToApplied();
    closeDropdown();
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen() ? closeDropdown() : openDropdown();
  });

  // Prevent clicks inside the menu from bubbling to document (which would close it)
  menuEl.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Close when clicking outside
  document.addEventListener('click', () => {
    if (isOpen()) closeDropdown();
  });

  dropdown.querySelector('.ledger-filter-select-all').addEventListener('click', (e) => {
    e.preventDefault();
    dropdown.querySelectorAll('.ledger-filter-cb').forEach((cb) => { cb.checked = true; });
  });
  dropdown.querySelector('.ledger-filter-deselect-all').addEventListener('click', (e) => {
    e.preventDefault();
    dropdown.querySelectorAll('.ledger-filter-cb').forEach((cb) => { cb.checked = false; });
  });

  dropdown.querySelector('.ledger-filter-ok').addEventListener('click', (e) => {
    e.preventDefault();
    onOk();
  });
  dropdown.querySelector('.ledger-filter-cancel').addEventListener('click', (e) => {
    e.preventDefault();
    onCancel();
  });

  return dropdown;
}

function init() {
  const session = getSession();
  if (!session || !isCdcPrintersUser(session)) return;

  const ledgerNames = getLedgerNames(session);
  if (ledgerNames.length === 0) return;

  const snbContainers = document.querySelectorAll('.custom-snb');
  if (!snbContainers.length) return;

  snbContainers.forEach((snb) => {
    const filterEl = createLedgerFilterDropdown(ledgerNames);
    snb.insertBefore(filterEl, snb.firstChild);
  });

  window.getSelectedLedgerNames = getSelectedLedgerNames;
}

document.addEventListener('DOMContentLoaded', init);
