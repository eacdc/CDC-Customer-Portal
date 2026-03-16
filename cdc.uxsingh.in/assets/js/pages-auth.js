/**
 *  Pages Authentication
 */
'use strict';

document.addEventListener('DOMContentLoaded', function () {
  // Initial cleanup function to ensure UI is always clickable (before form is initialized)
  const initialCleanup = () => {
    // Remove any modal backdrops that might be blocking
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());
    
    // Remove modal-open class from body
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    
    // Remove any notiflix overlays that might be blocking
    if (typeof Loading !== 'undefined') {
      try {
        Loading.remove();
      } catch (e) {
        // Ignore errors if Loading is not initialized
      }
    }
    
    // Remove any notiflix block overlays
    if (typeof Block !== 'undefined') {
      try {
        Block.remove('body');
        Block.remove('#formAuthentication');
        Block.remove('.authentication-wrapper');
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Clear any notiflix loading or block elements
    const notiflixElements = document.querySelectorAll('.notiflix-loading, .notiflix-block');
    notiflixElements.forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    // Ensure pointer-events is not blocked
    document.body.style.pointerEvents = '';
    const authWrapper = document.querySelector('.authentication-wrapper');
    if (authWrapper) {
      authWrapper.style.pointerEvents = '';
    }
  };

  // Run initial cleanup immediately and after a short delay to catch any late-loading overlays
  initialCleanup();
  setTimeout(initialCleanup, 100);
  setTimeout(initialCleanup, 500);

  (() => {
    const formAuthentication = document.querySelector('#formAuthentication');
    if (!formAuthentication) return;

    const isRegister = formAuthentication.dataset.auth === 'register';
    const isLogin = formAuthentication.dataset.auth === 'login';
    const isForgotPassword = formAuthentication.dataset.auth === 'forgot-password';
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
    const ENDPOINT = isRegister
      ? `${API_BASE}/auth/register-email`
      : isForgotPassword
        ? `${API_BASE}/auth/forgot-password`
        : `${API_BASE}/auth/login-email`;

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
      },
      terms: {
        validators: {
          notEmpty: {
            message: 'You must agree to the privacy policy and terms'
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

    const forgotPasswordFields = {
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
      new_password: {
        validators: {
          notEmpty: {
            message: 'Please enter your new password'
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
            message: 'Please confirm your new password'
          },
          identical: {
            compare: function () {
              const passwordField = formAuthentication.querySelector('[name="new_password"]');
              return passwordField ? passwordField.value : '';
            },
            message: 'Passwords do not match'
          }
        }
      }
    };

    const validationFields = isRegister
      ? registerFields
      : isForgotPassword
        ? forgotPasswordFields
        : loginFields;

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

    // Flag to prevent multiple simultaneous submissions
    let isSubmitting = false;
    
    // Cleanup function to ensure UI is always clickable (with access to form elements)
    const cleanupBlockingStates = () => {
      // Remove any modal backdrops that might be blocking
      const backdrops = document.querySelectorAll('.modal-backdrop');
      backdrops.forEach(backdrop => backdrop.remove());
      
      // Remove modal-open class from body
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      
      // Remove any notiflix overlays that might be blocking
      if (typeof Loading !== 'undefined') {
        try {
          Loading.remove();
        } catch (e) {
          // Ignore errors if Loading is not initialized
        }
      }
      
      // Remove any notiflix block overlays
      if (typeof Block !== 'undefined') {
        try {
          Block.remove('body');
          Block.remove('#formAuthentication');
          Block.remove('.authentication-wrapper');
        } catch (e) {
          // Ignore errors
        }
      }
      
      // Clear any notiflix loading or block elements
      const notiflixElements = document.querySelectorAll('.notiflix-loading, .notiflix-block');
      notiflixElements.forEach(el => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      
      // Ensure form elements are not disabled
      const formInputs = document.querySelectorAll('#formAuthentication input, #formAuthentication button');
      formInputs.forEach(input => {
        if (input.disabled && input.type !== 'checkbox' && input.type !== 'radio') {
          input.disabled = false;
        }
      });
      
      // Ensure pointer-events is not blocked
      document.body.style.pointerEvents = '';
      const authWrapper = document.querySelector('.authentication-wrapper');
      if (authWrapper) {
        authWrapper.style.pointerEvents = '';
      }
      
      // Re-enable submit button if it was disabled
      if (submitBtn && submitBtn.disabled) {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    };
    
    const toggleLoading = state => {
      if (!submitBtn) return;
      if (state) {
        isSubmitting = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...`;
        
        // Safety timeout: automatically re-enable after 30 seconds to prevent permanent blocking
        setTimeout(() => {
          if (isSubmitting && submitBtn && submitBtn.disabled) {
            console.warn('[AUTH] Loading state exceeded 30 seconds, re-enabling form');
            cleanupBlockingStates();
          }
        }, 30000);
      } else {
        isSubmitting = false;
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
      // Prevent multiple simultaneous submissions
      if (isSubmitting) {
        console.warn('[AUTH] Form submission already in progress, ignoring duplicate submit');
        return;
      }
      
      clearAlert();
      showResult(null);
      toggleLoading(true);
      
      // Ensure blocking states are cleared before starting
      cleanupBlockingStates();

      const formData = new FormData(formAuthentication);
      const payload = {
        email: String(formData.get('email') || '').trim().toLowerCase(),
        password: String(formData.get('password') || '')
      };
      if (isRegister) {
        payload.customer_key = String(formData.get('customer_key') || '').trim();
      }
      if (isForgotPassword) {
        payload.email = String(formData.get('email') || '').trim().toLowerCase();
        payload.customer_key = String(formData.get('customer_key') || '').trim();
        payload.new_password = String(formData.get('new_password') || '');
        delete payload.password;
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
          : isForgotPassword
            ? 'Password changed successfully. Redirecting to login...'
            : 'Login successful! Redirecting...';
        setAlert('success', successMessage);

        if (isForgotPassword) {
          const targetHref = resolveRedirectTarget(successRedirect);
          setTimeout(() => {
            window.location.href = targetHref;
          }, 1500);
        } else if (body?.token) {
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

        // Redirect after success: both login and register send user to the same post-auth page
        if (isLogin || isRegister) {
          const targetHref = resolveRedirectTarget(successRedirect);
          setTimeout(() => {
            window.location.href = targetHref;
          }, 1000);
        }
        // forgot-password redirect is handled above
      } catch (err) {
        setAlert('danger', err.message || 'Unexpected error. Please try again.');
        storeSession(null);
        // Ensure UI is clickable even after error
        cleanupBlockingStates();
      } finally {
        toggleLoading(false);
        // Double-check that blocking states are cleared
        setTimeout(cleanupBlockingStates, 100);
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
    
    // Add event listeners to clear blocking states on page visibility/focus changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        cleanupBlockingStates();
      }
    });
    
    window.addEventListener('focus', () => {
      cleanupBlockingStates();
    });
    
    window.addEventListener('pageshow', (event) => {
      // Handle back/forward cache restoration
      if (event.persisted) {
        cleanupBlockingStates();
        // Re-enable submit button if it was disabled
        if (submitBtn && submitBtn.disabled) {
          toggleLoading(false);
        }
      }
    });
    
    // Ensure cleanup on page unload as well
    window.addEventListener('beforeunload', () => {
      cleanupBlockingStates();
    });
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
