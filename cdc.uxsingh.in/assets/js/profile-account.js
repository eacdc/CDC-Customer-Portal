'use strict';

const PROFILE_STORAGE_KEY = 'cdcAuthSession';

function getProfileSession() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function renderCompanyNames(names = []) {
  const container = document.querySelector('[data-profile-companies]');
  if (!container) return;

  container.innerHTML = '';

  if (!names.length) {
    const empty = document.createElement('span');
    empty.className = 'badge bg-label-secondary align-self-start';
    empty.textContent = 'No companies linked';
    container.appendChild(empty);
    return;
  }

  names.forEach((name) => {
    const badge = document.createElement('span');
    badge.className = 'badge bg-label-primary text-wrap align-self-start';
    badge.textContent = name;
    container.appendChild(badge);
  });
}

function hydrateProfileDetails() {
  const session = getProfileSession();
  if (!session) return;

  const contactName = session.contactName ? String(session.contactName).trim() : '';
  const customerKey = session.customerKey ? String(session.customerKey).trim() : '';
  const email = session.email || '';
  const ledgerNamesRaw = Array.isArray(session.ledgerNames) ? session.ledgerNames : [];
  const uniqueCompanyNames = Array.from(
    new Set(
      ledgerNamesRaw
        .map((name) => (typeof name === 'string' ? name.trim() : ''))
        .filter((name) => name.length)
    )
  );
  const displayName = contactName || (email ? email.split('@')[0] : 'User');

  document.querySelectorAll('[data-profile-name]').forEach(el => {
    el.textContent = displayName;
  });

  const customerIdEl = document.querySelector('[data-profile-customer-id]');
  if (customerIdEl) {
    customerIdEl.textContent = customerKey || '—';
  }

  renderCompanyNames(uniqueCompanyNames);

  const nameInput = document.getElementById('name');
  if (nameInput) {
    nameInput.value = displayName;
    nameInput.placeholder = displayName;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  hydrateProfileDetails();

  const form = document.getElementById('formAccountSettings');
  if (!form) return;

  const inputs = form.querySelectorAll('input, textarea');
  const selects = form.querySelectorAll('select');
  const submitBtn = form.querySelector('button[type="submit"]');

  let isEditing = false;

  // Set fields as readonly/disabled on page load
  inputs.forEach(input => {
    input.readOnly = true;

    // Optional: store initial value as placeholder for display
    if (!input.placeholder) {
      input.placeholder = input.value;
    }
  });

  selects.forEach(select => {
    select.disabled = true;
  });

  submitBtn.addEventListener('click', function () {
    if (!isEditing) {
      // Enable editing
      inputs.forEach(input => input.readOnly = false);
      selects.forEach(select => select.disabled = false);
      isEditing = true;
      submitBtn.textContent = 'Save Changes';
    } else {
      // Save changed values and revert to read-only
      inputs.forEach(input => {
        // Only update placeholder if value is non-empty
        if (input.value.trim() !== '') {
          input.placeholder = input.value;
        } else {
          // If empty, retain previous placeholder as value
          input.value = input.placeholder;
        }

        input.readOnly = true;
      });

      selects.forEach(select => {
        select.disabled = true;
      });

      isEditing = false;
      submitBtn.textContent = 'Edit Profile';

      // Optional: log or send the full form data
      const formData = new FormData(form);
      console.log('Form Values:', Object.fromEntries(formData));
    }
  });
});