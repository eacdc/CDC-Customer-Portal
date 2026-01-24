/**
 * Global Loading Overlay System
 * Shows loading spinner on button clicks and navigation
 * Automatically hides when API calls complete
 */
(function() {
    'use strict';

    let activeRequests = 0; // Track number of active API calls

    // Create and inject loading overlay HTML if it doesn't exist
    function injectLoadingOverlay() {
        if (document.getElementById('cdcLoadingOverlay')) {
            return; // Already exists
        }

        const overlayHTML = `
            <div class="cdc-loading-overlay" id="cdcLoadingOverlay">
                <div class="cdc-loading-spinner"></div>
            </div>
        `;

        // Inject CSS if not already present
        if (!document.getElementById('cdcLoadingOverlayStyles')) {
            const style = document.createElement('style');
            style.id = 'cdcLoadingOverlayStyles';
            style.textContent = `
                .cdc-loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 99999;
                    pointer-events: all;
                }

                .cdc-loading-overlay.active {
                    display: flex !important;
                }

                .cdc-loading-spinner {
                    width: 50px;
                    height: 50px;
                    border: 4px solid rgba(255, 255, 255, 0.3);
                    border-top: 4px solid #ffffff;
                    border-radius: 50%;
                    animation: cdcSpinnerRotate 1s linear infinite;
                }

                @keyframes cdcSpinnerRotate {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                body.cdc-loading-active {
                    overflow: hidden !important;
                }
            `;
            document.head.appendChild(style);
        }

        // Inject overlay HTML
        document.body.insertAdjacentHTML('beforeend', overlayHTML);
    }

    // Initialize on DOM ready
    function init() {
        const loadingOverlay = document.getElementById('cdcLoadingOverlay');
        const body = document.body;

        function showLoading() {
            if (loadingOverlay) {
                loadingOverlay.classList.add('active');
                body.classList.add('cdc-loading-active');
            }
        }

        function hideLoading() {
            // Only hide if no active requests
            if (activeRequests <= 0) {
                if (loadingOverlay) {
                    loadingOverlay.classList.remove('active');
                    body.classList.remove('cdc-loading-active');
                }
            }
        }

        function resetLoading() {
            activeRequests = 0;
            if (loadingOverlay) {
                loadingOverlay.classList.remove('active');
                body.classList.remove('cdc-loading-active');
            }
        }

        function isModifiedClick(event) {
            return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1;
        }

        function shouldIgnoreElement(element, event) {
            if (!element) return true;

            // Skip if explicitly disabled
            if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
                return true;
            }

            // Skip if has data-loading="false"
            if (element.getAttribute('data-loading') === 'false' || element.closest('[data-loading="false"]')) {
                return true;
            }

            // For anchor tags, check special cases
            if (element.tagName === 'A') {
                const href = element.getAttribute('href') || '';
                
                // Ignore empty, hash, javascript: links
                if (href === '' || href === '#' || href.startsWith('javascript:')) {
                    return true;
                }

                // Ignore new tab/window links
                if (element.target && element.target !== '_self') {
                    return true;
                }

                // Ignore download links
                if (element.hasAttribute('download')) {
                    return true;
                }

                // Ignore modified clicks (ctrl+click, middle click, etc.)
                if (isModifiedClick(event)) {
                    return true;
                }
            }

            return false;
        }

        // Intercept fetch API calls
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = (typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url)) || '';
            const isChatApi = url.indexOf('/chat/') !== -1;

            if (!isChatApi) {
                activeRequests++;
                showLoading();
            }

            return originalFetch.apply(this, args)
                .then(response => {
                    if (!isChatApi) {
                        activeRequests--;
                        hideLoading();
                    }
                    return response;
                })
                .catch(error => {
                    if (!isChatApi) {
                        activeRequests--;
                        hideLoading();
                    }
                    throw error;
                });
        };

        // Intercept XMLHttpRequest (AJAX) calls
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(...args) {
            this._cdcTracked = true;
            this._cdcRequestUrl = (typeof args[1] === 'string' ? args[1] : '') || '';
            return originalOpen.apply(this, args);
        };

        XMLHttpRequest.prototype.send = function(...args) {
            if (this._cdcTracked) {
                const isChatApi = (this._cdcRequestUrl || '').indexOf('/chat/') !== -1;
                if (!isChatApi) {
                    activeRequests++;
                    showLoading();
                }

                const onComplete = () => {
                    if (!isChatApi) {
                        activeRequests--;
                        hideLoading();
                    }
                };

                this.addEventListener('load', onComplete);
                this.addEventListener('error', onComplete);
                this.addEventListener('abort', onComplete);
            }

            return originalSend.apply(this, args);
        };

        // Expose global API
        window.CDCLoadingOverlay = {
            show: function() {
                activeRequests++;
                showLoading();
            },
            hide: function() {
                activeRequests = Math.max(0, activeRequests - 1);
                hideLoading();
            },
            reset: resetLoading
        };

        // Clear overlay on page load/show
        window.addEventListener('load', resetLoading);
        window.addEventListener('pageshow', resetLoading);
        
        // Also clear immediately when script runs (handles bfcache)
        resetLoading();

        // Handle clicks on buttons and links
        document.addEventListener('click', function(event) {
            const trigger = event.target.closest('a, button, input[type="button"], input[type="submit"], [role="button"]');
            
            if (shouldIgnoreElement(trigger, event)) {
                return;
            }

            // For navigation links, show loading (will be cleared on page load)
            if (trigger.tagName === 'A' && trigger.getAttribute('href')) {
                showLoading();
            }
        }, true);

        // Handle form submissions
        document.addEventListener('submit', function(event) {
            const form = event.target;
            if (form && !form.closest('[data-loading="false"]')) {
                showLoading();
            }
        }, true);
    }

    // Wait for DOM to be ready, then inject and initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            injectLoadingOverlay();
            init();
        });
    } else {
        injectLoadingOverlay();
        init();
    }

})();