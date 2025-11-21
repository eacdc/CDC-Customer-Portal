'use strict';

// Top search bar functionality for orders API
document.addEventListener('DOMContentLoaded', () => {
  const ORDERS_SESSION_KEY = 'cdcAuthSession';
  
  function getStoredSession() {
    try {
      const raw = localStorage.getItem(ORDERS_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  
  const session = getStoredSession();

  if (!session?.token) {
    // Hide search if not authenticated
    const searchWrapper = document.querySelector('.navbar-search-wrapper');
    if (searchWrapper) {
      searchWrapper.style.display = 'none';
    }
    return;
  }

  function getApiBase() {
    if (session?.apiBase) {
      return String(session.apiBase).replace(/\/$/, '');
    }
    if (window.AUTH_API_BASE) {
      return String(window.AUTH_API_BASE).replace(/\/$/, '');
    }
    const host = window.location.hostname;
    const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
    const fallback = isLocalHost
      ? 'http://localhost:8080/api'
      : 'https://cdc-customer-portal-backend.onrender.com/api';
    return fallback.replace(/\/$/, '');
  }

  function buildAuthHeaders() {
    const headers = {
      Accept: 'application/json'
    };
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }
    if (session?.sessionId) {
      headers['X-Session-Id'] = session.sessionId;
    }
    return headers;
  }

  // Initialize top search bar
  console.log('[TOP SEARCH BAR] Initializing top search bar');
  console.log('[TOP SEARCH BAR] Current page URL:', window.location.href);
  
  const searchWrapper = document.querySelector('.navbar-search-wrapper');
  console.log('[TOP SEARCH BAR] Search wrapper found:', !!searchWrapper);
  
  if (searchWrapper) {
    const autocompleteElement = document.getElementById('autocomplete');
    console.log('[TOP SEARCH BAR] Autocomplete element found:', !!autocompleteElement);
    
    if (autocompleteElement) {
      // Replace autocomplete with search input and button
      const searchContainer = document.createElement('div');
      searchContainer.className = 'd-flex align-items-center gap-2';
      searchContainer.innerHTML = `
        <input type="text" 
               class="form-control" 
               id="top-orders-search-input" 
               placeholder="Search orders..." 
               style="min-width: 200px;"
               autocomplete="off">
        <button type="button" 
                class="btn btn-primary" 
                id="top-orders-search-btn"
                style="z-index: 1000;">
          <i class="icon-base ti tabler-search"></i>
        </button>
      `;
      
      autocompleteElement.parentElement.replaceChild(searchContainer, autocompleteElement);
      console.log('[TOP SEARCH BAR] Search input and button created');
      
      // Wait a moment for DOM to settle
      setTimeout(() => {
        // Add event listener for search button
        const searchBtn = document.getElementById('top-orders-search-btn');
        const searchInput = document.getElementById('top-orders-search-input');
        
        console.log('[TOP SEARCH BAR] Search button found:', !!searchBtn);
        console.log('[TOP SEARCH BAR] Search input found:', !!searchInput);
        
        if (searchBtn && searchInput) {
          console.log('[TOP SEARCH BAR] Button element:', searchBtn);
          console.log('[TOP SEARCH BAR] Button parent:', searchBtn.parentElement);
          console.log('[TOP SEARCH BAR] Button classes:', searchBtn.className);
          console.log('[TOP SEARCH BAR] Button type:', searchBtn.type);
          console.log('[TOP SEARCH BAR] Event listeners attached successfully');
          
          // Log when user types in search input
          searchInput.addEventListener('input', (e) => {
            const currentValue = e.target.value.trim();
            if (currentValue) {
              console.log('[TOP SEARCH BAR] User typing in search:', currentValue);
            }
          });
          
          const performSearch = () => {
            const searchQuery = searchInput.value.trim();
            console.log('='.repeat(80));
            console.log('[TOP SEARCH BAR] ========== SEARCH INITIATED ==========');
            console.log('[TOP SEARCH BAR] Search button clicked or Enter pressed');
            console.log('[TOP SEARCH BAR] Search query:', searchQuery);
            console.log('[TOP SEARCH BAR] Search query length:', searchQuery.length);
            
            if (!searchQuery) {
              console.warn('[TOP SEARCH BAR] Empty search query, showing alert');
              alert('Please enter a search term');
              return;
            }
            
            // Store in sessionStorage so we can check it after navigation
            sessionStorage.setItem('lastSearchQuery', searchQuery);
            sessionStorage.setItem('lastSearchTime', new Date().toISOString());
            
            // Construct ABSOLUTE URL to avoid base tag interference
            const currentOrigin = window.location.origin;
            const currentPath = window.location.pathname;
            console.log('[TOP SEARCH BAR] Current origin:', currentOrigin);
            console.log('[TOP SEARCH BAR] Current pathname:', currentPath);
            
            // Build absolute URL - use origin + path
            const absoluteUrl = `${currentOrigin}/html/vertical-menu-template/all-orders.html?q=${encodeURIComponent(searchQuery)}`;
            
            console.log('[TOP SEARCH BAR] Navigating to orders page with search query');
            console.log('[TOP SEARCH BAR] Constructed ABSOLUTE URL:', absoluteUrl);
            console.log('[TOP SEARCH BAR] Encoded search query:', encodeURIComponent(searchQuery));
            console.log('[TOP SEARCH BAR] Query parameter:', `?q=${encodeURIComponent(searchQuery)}`);
            console.log('[TOP SEARCH BAR] Current URL before navigation:', window.location.href);
            console.log('[TOP SEARCH BAR] ========================================');
            console.log('='.repeat(80));
            
            // Store navigation intent
            console.log('[TOP SEARCH BAR] About to navigate using window.location.href...');
            
            // Navigate using absolute URL
            window.location.href = absoluteUrl;
          };
          
          // Multiple ways to capture the click
          searchBtn.onclick = function(e) {
            console.log('[TOP SEARCH BAR] *** onclick handler fired ***');
            e.preventDefault();
            performSearch();
            return false;
          };
          
          searchBtn.addEventListener('click', (e) => {
            console.log('[TOP SEARCH BAR] *** click event listener fired ***');
            e.preventDefault();
            e.stopPropagation();
            performSearch();
          }, true); // Use capture phase
          
          searchBtn.addEventListener('mousedown', (e) => {
            console.log('[TOP SEARCH BAR] *** mousedown on button ***');
          });
          
          searchBtn.addEventListener('mouseup', (e) => {
            console.log('[TOP SEARCH BAR] *** mouseup on button ***');
          });
          
          searchInput.addEventListener('keypress', (e) => {
            console.log('[TOP SEARCH BAR] Key pressed in input:', e.key);
            if (e.key === 'Enter') {
              console.log('[TOP SEARCH BAR] *** Enter key pressed in search input ***');
              e.preventDefault();
              performSearch();
            }
          });
          
          searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              console.log('[TOP SEARCH BAR] *** keydown Enter detected ***');
              e.preventDefault();
              performSearch();
            }
          });
          
          console.log('[TOP SEARCH BAR] All event listeners registered (onclick + addEventListener)');
          
          // Add test function
          window.testTopSearch = function(query) {
            console.log('[TEST] Manual search triggered with:', query);
            searchInput.value = query || 'test';
            performSearch();
          };
          console.log('[TOP SEARCH BAR] Test function: window.testTopSearch("your-query")');
        
        } else {
          console.error('[TOP SEARCH BAR] Failed to find search button or input element after timeout');
          if (!searchBtn) console.error('[TOP SEARCH BAR] Search button (#top-orders-search-btn) not found');
          if (!searchInput) console.error('[TOP SEARCH BAR] Search input (#top-orders-search-input) not found');
        }
      }, 100); // Wait 100ms for DOM to settle
      
    } else {
      console.warn('[TOP SEARCH BAR] Autocomplete element not found, search bar not initialized');
    }
  } else {
    console.warn('[TOP SEARCH BAR] Search wrapper (.navbar-search-wrapper) not found');
  }
  
  console.log('[TOP SEARCH BAR] Initialization complete');
});

