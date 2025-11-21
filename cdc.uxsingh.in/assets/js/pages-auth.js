/**
 *  Pages Authentication
 */
'use strict';

document.addEventListener('DOMContentLoaded', function () {
  (() => {
    const formAuthentication = document.querySelector('#formAuthentication');
    if (!formAuthentication) return;

    const isRegister = formAuthentication.dataset.auth === 'register';
    const isLogin = formAuthentication.dataset.auth === 'login';
    const alertEl = formAuthentication.querySelector('#formAlert');
    const resultEl = formAuthentication.querySelector('#formResult');
    const submitBtn = formAuthentication.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    const successRedirect = formAuthentication.dataset.successRedirect || '';
    const STORAGE_KEY = 'cdcAuthSession';

    const defaultBase =
      window.AUTH_API_BASE ||
      (['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
        ? 'http://localhost:8080/api'
        : 'https://cdc-customer-portal-backend.onrender.com/api');

    const API_BASE = defaultBase.replace(/\/$/, '');
    const ENDPOINT = isRegister ? `${API_BASE}/auth/register-email` : `${API_BASE}/auth/login-email`;

    const registerFields = {
      email: {
        validators: {
          notEmpty: {
            message: 'Please enter your email'
          },
          emailAddress: {
            message: 'Please enter a valid email address'
          }
        }
      },
      customer_key: {
        validators: {
          notEmpty: {
            message: 'Please enter your customer key'
          },
          stringLength: {
            min: 3,
            message: 'Customer key looks too short'
          }
        }
      },
      password: {
        validators: {
          notEmpty: {
            message: 'Please enter your password'
          },
          stringLength: {
            min: 6,
            message: 'Password must be at least 6 characters'
          }
        }
      },
      confirm_password: {
        validators: {
          notEmpty: {
            message: 'Please confirm your password'
          },
          identical: {
            compare: function () {
              const passwordField = formAuthentication.querySelector('[name="password"]');
              return passwordField ? passwordField.value : '';
            },
            message: 'Passwords do not match'
          }
        }
      }
    };

    const loginFields = {
      email: {
        validators: {
          notEmpty: {
            message: 'Please enter your email'
          },
          emailAddress: {
            message: 'Please enter a valid email address'
          }
        }
      },
      password: {
        validators: {
          notEmpty: {
            message: 'Please enter your password'
          },
          stringLength: {
            min: 6,
            message: 'Password must be at least 6 characters'
          }
        }
      }
    };

    const validationFields = isRegister ? registerFields : loginFields;

    const setAlert = (type, message) => {
      if (!alertEl) return;
      alertEl.classList.remove('d-none', 'alert-success', 'alert-danger');
      alertEl.classList.add(type === 'success' ? 'alert-success' : 'alert-danger');
      alertEl.textContent = message;
    };

    const clearAlert = () => {
      if (!alertEl) return;
      alertEl.classList.add('d-none');
      alertEl.textContent = '';
    };

    const showResult = data => {
      if (!resultEl) return;
      if (!data) {
        resultEl.classList.add('d-none');
        resultEl.textContent = '';
        return;
      }
      resultEl.classList.remove('d-none');
      resultEl.textContent = JSON.stringify(data, null, 2);
    };

    const toggleLoading = state => {
      if (!submitBtn) return;
      if (state) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...`;
      } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    };

    const storeSession = (details) => {
      try {
        if (!details || !details.token) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            token: details.token,
            sessionId: details.sessionId || null,
            email: details.email || null,
            contactName: details.contactName || null,
            customerKey: details.customerKey || null,
            ledgerNames: Array.isArray(details.ledgerNames) ? details.ledgerNames : [],
            apiBase: API_BASE,
            storedAt: Date.now(),
          })
        );
      } catch (err) {
        // ignore storage failures (e.g. private mode)
      }
    };

    const handleSubmit = async () => {
      clearAlert();
      showResult(null);
      toggleLoading(true);

      const formData = new FormData(formAuthentication);
      const payload = {
        email: String(formData.get('email') || '').trim().toLowerCase(),
        password: String(formData.get('password') || '')
      };
      if (isRegister) {
        payload.customer_key = String(formData.get('customer_key') || '').trim();
      }

      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        let body = null;
        try {
          body = await response.json();
        } catch (e) {
          body = null;
        }

        if (!response.ok) {
          const errorMessage =
            (body && (body.error || body.detail)) ||
            `Request failed with status ${response.status}`;
          throw new Error(errorMessage);
        }

        const successMessage = isRegister
          ? 'Registration successful! You are now signed in.'
          : 'Login successful! Redirecting...';
        setAlert('success', successMessage);

        if (body?.token) {
          const ledgerNames = [
            ...(body.tenant?.ledgerNames_db1 || []),
            ...(body.tenant?.ledgerNames_db2 || [])
          ].filter(name => typeof name === 'string' && name.trim().length);
          const uniqueLedgerNames = Array.from(new Set(ledgerNames.map(name => name.trim())));

          storeSession({
            token: body.token,
            sessionId: body.sessionId,
            email: body.user?.email || payload.email,
            contactName: body.user?.contactName || null,
            customerKey: body.tenant?.customer_key || null,
            ledgerNames: uniqueLedgerNames
          });
        }

        if (isLogin) {
          const targetHref = resolveRedirectTarget(successRedirect);
          setTimeout(() => {
            window.location.href = targetHref;
          }, 1000);
        }
      } catch (err) {
        setAlert('danger', err.message || 'Unexpected error. Please try again.');
        storeSession(null);
      } finally {
        toggleLoading(false);
      }
    };

    if (typeof FormValidation !== 'undefined') {
      const fvInstance = FormValidation.formValidation(formAuthentication, {
        fields: validationFields,
        plugins: {
          trigger: new FormValidation.plugins.Trigger(),
          bootstrap5: new FormValidation.plugins.Bootstrap5({
            eleValidClass: '',
            rowSelector: '.form-control-validation'
          }),
          submitButton: new FormValidation.plugins.SubmitButton(),
          autoFocus: new FormValidation.plugins.AutoFocus()
        },
        init: instance => {
          instance.on('plugins.message.placed', e => {
            if (e.element.parentElement.classList.contains('input-group')) {
              e.element.parentElement.insertAdjacentElement('afterend', e.messageElement);
            }
          });
        }
      });

      fvInstance.on('core.form.valid', () => {
        handleSubmit();
        return false;
      });
    } else {
      formAuthentication.addEventListener('submit', event => {
        event.preventDefault();
        handleSubmit();
      });
    }

    // Two Steps Verification for numeral input mask
    const numeralMaskElements = document.querySelectorAll('.numeral-mask');

    // Format function for numeral mask
    const formatNumeral = value => value.replace(/\D/g, ''); // Only keep digits

    if (numeralMaskElements.length > 0) {
      numeralMaskElements.forEach(numeralMaskEl => {
        numeralMaskEl.addEventListener('input', event => {
          numeralMaskEl.value = formatNumeral(event.target.value);
        });
      });
    }
  })();
    function resolveRedirectTarget(rawTarget) {
      const fallback = './index.html';
      let target = (rawTarget || '').trim() || fallback;

      if (/^https?:\/\//i.test(target)) {
        return target;
      }

      const normalised = target.replace(/^\.\/+/, '');
      const currentPath = window.location.pathname || '';
      let relativeTarget = normalised;

      if (
        !currentPath.includes('/vertical-menu-template/') &&
        !normalised.startsWith('vertical-menu-template/')
      ) {
        relativeTarget = `vertical-menu-template/${normalised}`;
      }

      try {
        return new URL(relativeTarget, window.location.href).toString();
      } catch (err) {
        try {
          return new URL(fallback, window.location.href).toString();
        } catch {
          return fallback;
        }
      }
    }
});
