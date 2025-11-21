'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const ORDERS_SESSION_KEY = 'cdcAuthSession';
  const DEFAULT_RANGE = '90d';
      const DEFAULT_LIMIT = '1000'; // Fetch more items for pagination

  const TAB_CONFIG = {
    all: {
      containerId: 'all-orders-container',
      searchWrapper: '.search-here',
      placeholder: 'Search orders...',
      emptyMessage: 'No orders found.',
      searchEmptyMessage: 'No orders match your search.'
    },
    pending: {
      containerId: 'pending-orders-container',
      searchWrapper: '.search-here-pending',
      placeholder: 'Search pending orders...',
      emptyMessage: 'No pending orders found.',
      searchEmptyMessage: 'No pending orders match your search.'
    },
    completed: {
      containerId: 'completed-orders-container',
      searchWrapper: '.search-here-completed',
      placeholder: 'Search completed orders...',
      emptyMessage: 'No completed orders found.',
      searchEmptyMessage: 'No completed orders match your search.'
    }
  };

  const ITEMS_PER_PAGE = 10;

  const tabState = {
    all: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [], searchQuery: '' },
    pending: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [], searchQuery: '' },
    completed: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [], searchQuery: '' }
  };

  let currentCustomDateTab = null;

  const session = getStoredSession();

  if (!session?.token) {
    showGlobalError('You must sign in before viewing orders.');
    return;
  }

  // Check for URL search query parameter before initializing
  console.log('[ORDERS PAGE] ========== PAGE LOADED ==========');
  console.log('[ORDERS PAGE] Full URL:', window.location.href);
  console.log('[ORDERS PAGE] Origin:', window.location.origin);
  console.log('[ORDERS PAGE] Pathname:', window.location.pathname);
  console.log('[ORDERS PAGE] Search string:', window.location.search);
  console.log('[ORDERS PAGE] Hash:', window.location.hash);
  
  // Check sessionStorage for search intent
  const storedQuery = sessionStorage.getItem('lastSearchQuery');
  const storedTime = sessionStorage.getItem('lastSearchTime');
  if (storedQuery && storedTime) {
    console.log('[ORDERS PAGE] Found stored search query:', storedQuery);
    console.log('[ORDERS PAGE] Search was initiated at:', storedTime);
    // Clear it so it doesn't affect subsequent visits
    sessionStorage.removeItem('lastSearchQuery');
    sessionStorage.removeItem('lastSearchTime');
  }
  
  const urlParams = new URLSearchParams(window.location.search);
  const urlSearchQuery = urlParams.get('q');
  
  console.log('[ORDERS PAGE] URLSearchParams object:', urlParams.toString());
  console.log('[ORDERS PAGE] All URL parameters:');
  for (const [key, value] of urlParams.entries()) {
    console.log(`[ORDERS PAGE]   ${key} = ${value}`);
  }
  console.log('[ORDERS PAGE] Search query from URL (q parameter):', urlSearchQuery || '(none)');
  
  // If URL doesn't have query but we have stored one, use stored
  const finalSearchQuery = urlSearchQuery || storedQuery;
  if (finalSearchQuery && !urlSearchQuery && storedQuery) {
    console.warn('[ORDERS PAGE] URL missing query parameter but found in sessionStorage!');
    console.warn('[ORDERS PAGE] Expected query from navigation:', storedQuery);
    console.warn('[ORDERS PAGE] This suggests the query string was lost during navigation!');
  }
  
  // Store search query in state before loading orders (use finalSearchQuery which includes fallback)
  if (finalSearchQuery) {
    console.log('[ORDERS PAGE] Storing search query in state:', finalSearchQuery);
    tabState.all.searchQuery = finalSearchQuery;
    // Switch to 'all' tab if not already active
    const allTab = document.getElementById('dispatch-tab');
    if (allTab && !allTab.classList.contains('active')) {
      console.log('[ORDERS PAGE] Switching to "all" tab');
      allTab.click();
    }
  }
  
  console.log('[ORDERS PAGE] ========================================');
  
  initSearchInputs();
  initDateRangeHandlers();

  // Set search input value from URL parameter if present
  if (urlSearchQuery) {
    // Set search input value on 'all' tab after initialization
    setTimeout(() => {
      const allTabInput = tabState.all.searchInput;
      if (allTabInput) {
        allTabInput.value = urlSearchQuery;
      }
    }, 100);
  }

  // Load orders for each tab
  loadOrdersForTab('all', 'all-orders-container');
  loadOrdersForTab('pending', 'pending-orders-container');
  loadOrdersForTab('completed', 'completed-orders-container');

  // Bind modal handlers
  bindModalHandlers();

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(ORDERS_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
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

  async function loadOrdersForTab(tab, containerId) {
    const config = TAB_CONFIG[tab];
    const container = document.getElementById(containerId);
    if (!config || !container) return;

    config.container = container;
    container.innerHTML = '<div class="col-12 text-center"><p>Loading...</p></div>';

    try {
      const orders = await loadOrders(tab);
      // Filter orders by PoDate based on selected date range
      const filteredOrders = filterOrdersByDateRange(orders, tab);
      tabState[tab].orders = filteredOrders;
      
      // If there's a search query, the API already filtered, so use orders as-is
      tabState[tab].filteredOrders = filteredOrders; // API already filtered if search query exists
      
      tabState[tab].currentPage = 1; // Reset to page 1
      renderOrdersWithPagination(tab);
    } catch (error) {
      console.error('Error loading orders:', error);
      container.innerHTML = `<div class="col-12 text-center"><p class="text-danger">${error.userMessage || 'Failed to load orders.'}</p></div>`;
    }
  }

  async function loadOrders(tab) {
    const apiBase = getApiBase();
    const state = tabState[tab];
    const dateRange = state.dateRange || DEFAULT_RANGE;
    
    console.log(`[ORDERS API] Loading orders for tab: ${tab}`);
    console.log(`[ORDERS API] API Base URL: ${apiBase}`);
    console.log(`[ORDERS API] Date range: ${dateRange}`);
    
    let url = `${apiBase}/orders?tab=${encodeURIComponent(tab)}&limit=${encodeURIComponent(DEFAULT_LIMIT)}`;
    
    // Add search query if present (from input or stored query)
    const searchQuery = (state.searchInput ? state.searchInput.value.trim() : '') || state.searchQuery || '';
    console.log(`[ORDERS API] Search query from state:`, searchQuery || '(none)');
    console.log(`[ORDERS API] Search input value:`, state.searchInput ? state.searchInput.value : '(no input)');
    console.log(`[ORDERS API] Stored search query:`, state.searchQuery || '(none)');
    
    if (searchQuery) {
      url += `&q=${encodeURIComponent(searchQuery)}`;
      // Store the search query in state
      state.searchQuery = searchQuery;
      console.log(`[ORDERS API] Search query added to URL: q=${encodeURIComponent(searchQuery)}`);
    }
    
    if (state.customDates) {
      // Custom date range
      url += `&from=${encodeURIComponent(state.customDates.from)}&to=${encodeURIComponent(state.customDates.to)}`;
      console.log(`[ORDERS API] Using custom date range: from=${state.customDates.from}, to=${state.customDates.to}`);
    } else {
      // Predefined range
      url += `&range=${encodeURIComponent(dateRange)}`;
      console.log(`[ORDERS API] Using predefined range: ${dateRange}`);
    }

    console.log(`[ORDERS API] Making API call to: ${url}`);
    console.log(`[ORDERS API] Request headers:`, buildAuthHeaders());
    
    const startTime = performance.now();
    const response = await fetch(url, {
      headers: buildAuthHeaders()
    });
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    
    console.log(`[ORDERS API] Response received in ${duration}ms`);
    console.log(`[ORDERS API] Response status: ${response.status} ${response.statusText}`);
    console.log(`[ORDERS API] Response headers:`, Object.fromEntries(response.headers.entries()));

    if (response.status === 401) {
      console.error('[ORDERS API] Unauthorized - session expired');
      throw userFacingError(
        'Your session has expired. Please sign out and sign in again.'
      );
    }

    if (!response.ok) {
      const body = await safeJson(response);
      console.error('[ORDERS API] Error response:', response.status, body);
      throw userFacingError(body?.error || 'Unable to load orders.');
    }

    const body = await response.json();
    const items = body?.items || [];
    
    console.log(`[ORDERS API] Successfully received ${items.length} orders`);
    console.log(`[ORDERS API] Response body:`, {
      itemsCount: items.length,
      hasNextCursor: !!body?.nextCursor,
      nextCursor: body?.nextCursor || '(none)'
    });
    
    if (searchQuery) {
      console.log(`[ORDERS API] Filtered orders by search query "${searchQuery}": ${items.length} results`);
      if (items.length > 0) {
        console.log(`[ORDERS API] Sample order (first result):`, items[0]);
      }
    }
    
    return items;
  }

  function renderOrderCards(orders, container, emptyMessage, searchQuery = '') {
    if (!container) return;

    console.log(`[RENDER] Rendering order cards for container:`, container.id || '(no id)');
    console.log(`[RENDER] Number of orders to display:`, orders?.length || 0);
    console.log(`[RENDER] Search query:`, searchQuery || '(none)');

    // Clear container but preserve search message container
    const existingSearchMsg = container.parentElement?.querySelector('.search-result-message');
    if (existingSearchMsg) {
      console.log(`[RENDER] Removing existing search result message`);
      existingSearchMsg.remove();
    }

    if (!orders || orders.length === 0) {
      console.log(`[RENDER] No orders to display, showing empty message:`, emptyMessage);
      container.innerHTML = `<div class="col-12 text-center"><p>${emptyMessage || 'No orders found.'}</p></div>`;
      return;
    }

    // Add search result message if there's a search query
    if (searchQuery && searchQuery.trim()) {
      console.log(`[RENDER] Adding search result message for query: "${searchQuery}"`);
      const searchMsgDiv = document.createElement('div');
      searchMsgDiv.className = 'col-12 mb-3 search-result-message';
      searchMsgDiv.innerHTML = `<p class="text-muted mb-0"><strong>Search result for '<span class="text-primary">${escapeHtml(searchQuery)}</span>'</strong></p>`;
      container.parentElement?.insertBefore(searchMsgDiv, container);
      console.log(`[RENDER] Search result message displayed above order cards`);
    }

    container.innerHTML = '';

    orders.forEach(order => {
      const card = createOrderCard(order);
      container.appendChild(card);
    });
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function createOrderCard(order) {
    const col = document.createElement('div');
    col.className = 'col-12';

    const poDate = formatDate(order.PoDate);
    const approvalDate = formatDate(order.ApprovalDate);
    const committedDelivery = formatDate(order.CommittedDeliveryDate);
    const imageUrl = resolveImageUrl(order.ImageUrl);
    const title = order.Title || 'No Title';
    const poNumber = order.PoNumber || '-';
    const jobCardNo = order.JobCardNo || '-';
    const orderQty = order.OrderQty || '0';
    const packedQty = order.QtyPacked || '0';
    const deliveredQty = order.QtyDelivered || '0';
    const status = order.FinalOrderStatus || 'Pending';
    const jobId = order.JobBookingId || order.jobbookingid || '';
    const source = order.source || order.sourceTag || '';

    // Status badge color
    let statusClass = 'bg-label-warning';
    if (status.toLowerCase() === 'completed') {
      statusClass = 'bg-label-success';
    } else if (status.toLowerCase() === 'cancelled') {
      statusClass = 'bg-label-danger';
    }

    col.innerHTML = `
      <div class="card">
        <div class="card-body p-4">
          <div class="row align-items-start">
            <!-- Product Image -->
            <div class="col-auto">
              <img src="${imageUrl}" alt="Product" class="rounded" style="width: 100px; height: 100px; object-fit: contain; background-color: #87CEEB;" onerror="this.onerror=null;this.src='${resolveImageUrl(null)}';">
            </div>
            
            <!-- Product Details -->
            <div class="col">
              <div class="row">
                <div class="col-12 col-md-8">
                  <h5 class="mb-1">PO No. ${poNumber}</h5>
                  <p class="text-muted mb-2">${title}</p>
                  <p class="mb-0"><strong>Committed Delivery:</strong> ${committedDelivery}</p>
                </div>
                <div class="col-12 col-md-4 text-md-end">
                  <p class="text-muted mb-1">PO Date: ${poDate}</p>
                  <p class="text-muted mb-1">Approval: ${approvalDate}</p>
                  <p class="mb-0"><strong>Job Card No. #${jobCardNo}</strong></p>
                </div>
              </div>
              
              <!-- Order Stats -->
              <div class="row mt-3 align-items-center">
                <div class="col-auto">
                  <p class="mb-0"><strong>Ordered QTY:</strong> ${orderQty}</p>
                </div>
                <div class="col-auto">
                  <p class="mb-0"><strong>Packed QTY:</strong> ${packedQty}</p>
                </div>
                <div class="col-auto">
                  <p class="mb-0"><strong>Delivered QTY:</strong> ${deliveredQty}</p>
                </div>
                <div class="col-auto">
                  <p class="mb-0"><strong>Order status:</strong> <span class="badge ${statusClass}">${status}</span></p>
                </div>
                <div class="col-auto">
                  <button type="button" class="btn btn-sm btn-label-secondary process-details-btn" data-jobid="${jobId}" data-source="${source}">
                    Process Details
                  </button>
                </div>
                <div class="col-auto ms-auto">
                  <a href="javascript:void(0);" class="text-primary delivery-dates-btn" data-jobid="${jobId}" data-source="${source}">Delivery Dates</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    return col;
  }

  function initSearchInputs() {
    Object.entries(TAB_CONFIG).forEach(([tab, config]) => {
      const wrapper = document.querySelector(config.searchWrapper);
      if (!wrapper) return;

      wrapper.innerHTML = buildSearchInputMarkup(config.placeholder || 'Search...');

      const input = wrapper.querySelector('input[type="search"]');
      if (!input) return;

      tabState[tab].searchInput = input;
      
      // If there's a stored search query, set it in the input
      if (tabState[tab].searchQuery) {
        input.value = tabState[tab].searchQuery;
      }
      
      input.addEventListener('input', () => {
        const currentValue = input.value.trim();
        console.log(`[SEARCH INPUT] Input changed for tab ${tab}, value:`, currentValue || '(empty)');
        
        if (!currentValue) {
          // User cleared the search box
          console.log(`[SEARCH INPUT] Search cleared, reloading all orders for tab: ${tab}`);
          tabState[tab].searchQuery = '';
          
          // Reload orders without search query
          loadOrdersForTab(tab, config.containerId);
        } else {
          // User is typing - will trigger search when they finish
          applySearchFilter(tab);
        }
      });
      
      // Listen for the native clear event (when clicking the X button)
      input.addEventListener('search', (e) => {
        const currentValue = e.target.value.trim();
        console.log(`[SEARCH INPUT] Search event fired for tab ${tab}, value:`, currentValue || '(empty - X clicked)');
        
        if (!currentValue) {
          // User clicked the X button or cleared via other means
          console.log(`[SEARCH INPUT] Search cleared via X button, reloading all orders for tab: ${tab}`);
          tabState[tab].searchQuery = '';
          
          // Reload orders without search query
          loadOrdersForTab(tab, config.containerId);
        }
      });
      
      // Also handle when input loses focus and is empty
      input.addEventListener('blur', () => {
        const currentValue = input.value.trim();
        if (!currentValue && tabState[tab].searchQuery) {
          console.log(`[SEARCH INPUT] Input lost focus and is empty, clearing search for tab: ${tab}`);
          tabState[tab].searchQuery = '';
          loadOrdersForTab(tab, config.containerId);
        }
      });
    });
  }

  function buildSearchInputMarkup(placeholder) {
    const iconSvg = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></circle>
        <path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;

    return `
      <div class="input-group">
        <span class="input-group-text">${iconSvg}</span>
        <input type="search" class="form-control" placeholder="${placeholder}" aria-label="${placeholder}">
      </div>
    `;
  }

  function applySearchFilter(tab) {
    const config = TAB_CONFIG[tab];
    const state = tabState[tab];
    if (!config || !config.container || !state) return;

    const query = (state.searchInput ? state.searchInput.value.trim() : '') || state.searchQuery || '';
    console.log(`[SEARCH FILTER] Applying search filter for tab: ${tab}`);
    console.log(`[SEARCH FILTER] Search query:`, query || '(empty - showing all)');
    
    // If query is empty, clear the stored query
    if (!query) {
      console.log(`[SEARCH FILTER] Empty query - clearing stored search`);
      state.searchQuery = '';
      // Don't reload here - let the input event handler do it
      return;
    }
    
    // Store search query in state
    state.searchQuery = query;
    console.log(`[SEARCH FILTER] Stored search query in state: ${query}`);
    
    // Reload orders from API with the search parameter
    console.log(`[SEARCH FILTER] Reloading orders from API with search query: "${query}"`);
    loadOrdersForTab(tab, config.containerId);
  }

  function renderOrdersWithPagination(tab) {
    const config = TAB_CONFIG[tab];
    const state = tabState[tab];
    if (!config || !config.container || !state) return;

    const filtered = state.filteredOrders || [];
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(state.currentPage || 1, totalPages || 1));

    // Get items for current page
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = filtered.slice(startIndex, endIndex);

    const query = (state.searchInput ? state.searchInput.value.trim() : '') || state.searchQuery || '';
    const emptyMessage = query
      ? config.searchEmptyMessage || config.emptyMessage || 'No matching records found.'
      : config.emptyMessage || 'No records found.';

    renderOrderCards(pageItems, config.container, emptyMessage, query);
    renderPagination(tab, currentPage, totalPages, totalItems);
  }

  function renderPagination(tab, currentPage, totalPages, totalItems) {
    const config = TAB_CONFIG[tab];
    if (!config || !config.container) return;

    // Find or create pagination container
    let paginationContainer = config.container.parentElement?.querySelector(`.pagination-container[data-tab="${tab}"]`);
    if (!paginationContainer) {
      paginationContainer = document.createElement('div');
      paginationContainer.className = 'pagination-container mt-4';
      paginationContainer.setAttribute('data-tab', tab);
      config.container.parentElement?.appendChild(paginationContainer);
    }

    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    let pageNumbers = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      pageNumbers += `<li class="page-item"><a class="page-link" href="javascript:void(0);" data-page="1">1</a></li>`;
      if (startPage > 2) {
        pageNumbers += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const active = i === currentPage ? 'active' : '';
      pageNumbers += `<li class="page-item ${active}"><a class="page-link" href="javascript:void(0);" data-page="${i}">${i}</a></li>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pageNumbers += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
      }
      pageNumbers += `<li class="page-item"><a class="page-link" href="javascript:void(0);" data-page="${totalPages}">${totalPages}</a></li>`;
    }

    paginationContainer.innerHTML = `
      <nav aria-label="Page navigation">
        <div class="d-flex justify-content-between align-items-center">
          <div class="text-muted">
            Showing ${Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalItems)} to ${Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of ${totalItems} entries
          </div>
          <ul class="pagination mb-0">
            <li class="page-item ${prevDisabled}">
              <a class="page-link" href="javascript:void(0);" data-page="${currentPage - 1}" ${prevDisabled ? 'tabindex="-1" aria-disabled="true"' : ''}>
                <i class="icon-base ti tabler-chevron-left"></i>
              </a>
            </li>
            ${pageNumbers}
            <li class="page-item ${nextDisabled}">
              <a class="page-link" href="javascript:void(0);" data-page="${currentPage + 1}" ${nextDisabled ? 'tabindex="-1" aria-disabled="true"' : ''}>
                <i class="icon-base ti tabler-chevron-right"></i>
              </a>
            </li>
          </ul>
        </div>
      </nav>
    `;

    // Bind pagination click handlers
    paginationContainer.querySelectorAll('.page-link[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = parseInt(link.dataset.page);
        if (page >= 1 && page <= totalPages && page !== currentPage) {
          tabState[tab].currentPage = page;
          renderOrdersWithPagination(tab);
          // Scroll to top of container
          config.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function matchesSearch(order, query) {
    if (!query) return true;
    if (!order || typeof order !== 'object') return false;

    const searchableFields = [
      order.Title,
      order.PoNumber,
      order.JobCardNo,
      order.FinalOrderStatus,
      order.ISBN,
      order.ISBNNumber,
      order.ProductName,
      order.ProductTitle,
      order.CustomerName,
      order.Author,
      order.PoDate,
      order.ApprovalDate,
      order.CommittedDeliveryDate,
      order.OrderQty,
      order.QtyPacked,
      order.QtyDelivered,
      order.JobBookingId,
      order.jobbookingid
    ];

    return searchableFields.some(value => {
      if (value === undefined || value === null) return false;
      return String(value).toLowerCase().includes(query);
    });
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return '-';
    }
  }

  function getRangeLabel(range) {
    const labels = {
      '30d': 'Last 30 Days',
      '90d': 'Last 90 Days',
      '180d': 'Last 180 Days',
      '365d': 'Last 365 Days',
      'custom': 'Custom Date'
    };
    return labels[range] || 'Last 90 Days';
  }

  function getDateRange(tab) {
    const state = tabState[tab];
    const now = new Date();
    let fromDate, toDate;

    if (state.customDates) {
      fromDate = new Date(state.customDates.from);
      toDate = new Date(state.customDates.to);
      // Set to end of day for toDate
      toDate.setHours(23, 59, 59, 999);
    } else {
      const range = state.dateRange || DEFAULT_RANGE;
      toDate = new Date(now);
      toDate.setHours(23, 59, 59, 999);

      fromDate = new Date(now);
      // Support 30d, 90d, 180d, 365d
      if (range === '30d') {
        fromDate.setDate(fromDate.getDate() - 30);
      } else if (range === '90d') {
        fromDate.setDate(fromDate.getDate() - 90);
      } else if (range === '180d') {
        fromDate.setDate(fromDate.getDate() - 180);
      } else if (range === '365d') {
        fromDate.setDate(fromDate.getDate() - 365);
      } else {
        // Default to last 90 days
        fromDate.setDate(fromDate.getDate() - 90);
      }
      fromDate.setHours(0, 0, 0, 0);
    }

    return { fromDate, toDate };
  }

  function filterOrdersByDateRange(orders, tab) {
    if (!orders || orders.length === 0) return orders;

    const { fromDate, toDate } = getDateRange(tab);
    
    return orders.filter(order => {
      if (!order.PoDate) return false;
      
      try {
        const poDate = new Date(order.PoDate);
        // Check if PoDate is within the range
        return poDate >= fromDate && poDate <= toDate;
      } catch (error) {
        console.warn('Invalid PoDate format:', order.PoDate);
        return false;
      }
    });
  }

  function initDateRangeHandlers() {
    // Handle predefined date range options
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('date-range-option')) {
        e.preventDefault();
        const range = e.target.dataset.range;
        const dateRangeGroup = e.target.closest('.date-range-group');
        const tab = dateRangeGroup.dataset.tab;
        
        if (tab && range) {
          const state = tabState[tab];
          state.dateRange = range;
          state.customDates = null; // Clear custom dates
          
          // Update button text
          const btn = dateRangeGroup.querySelector('.date-range-btn');
          if (btn) {
            btn.textContent = getRangeLabel(range);
          }
          
          // Reload orders
          const config = TAB_CONFIG[tab];
          if (config) {
            loadOrdersForTab(tab, config.containerId);
          }
        }
      }
    });

    // Handle custom date option click - store which tab it's for
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('custom-date-option')) {
        currentCustomDateTab = e.target.dataset.tab;
      }
    });

    // Handle custom date form submission
    const applyCustomDateBtn = document.getElementById('applyCustomDate');
    if (applyCustomDateBtn) {
      applyCustomDateBtn.addEventListener('click', function() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        if (!startDate || !endDate) {
          alert('Please select both start and end dates');
          return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
          alert('Start date must be before end date');
          return;
        }
        
        if (currentCustomDateTab) {
          const state = tabState[currentCustomDateTab];
          state.customDates = {
            from: startDate,
            to: endDate
          };
          state.dateRange = 'custom';
          
          // Update button text
          const dateRangeGroup = document.querySelector(`.date-range-group[data-tab="${currentCustomDateTab}"]`);
          if (dateRangeGroup) {
            const btn = dateRangeGroup.querySelector('.date-range-btn');
            if (btn) {
              btn.textContent = 'Custom Date';
            }
          }
          
          // Close modal
          const modal = bootstrap.Modal.getInstance(document.getElementById('customDateModal'));
          if (modal) {
            modal.hide();
          }
          
          // Reload orders
          const config = TAB_CONFIG[currentCustomDateTab];
          if (config) {
            loadOrdersForTab(currentCustomDateTab, config.containerId);
          }
        }
      });
    }
  }

  function bindModalHandlers() {
    // Process Details button handler
    document.addEventListener('click', async function(e) {
      const btn = e.target.closest('.process-details-btn');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const jobId = btn.getAttribute('data-jobid');
        const source = btn.getAttribute('data-source');
        
        if (!jobId || jobId.trim() === '') {
          alert('Order identifier is missing. Cannot load process details.');
          return;
        }

        try {
          const processes = await loadProcesses(jobId, source);
          displayProcessDetailsModal(processes);
        } catch (error) {
          console.error('Error loading processes:', error);
          alert(error.userMessage || 'Failed to load order processes');
        }
      }
    });

    // Delivery Dates link handler
    document.addEventListener('click', async function(e) {
      const link = e.target.closest('.delivery-dates-btn');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        const jobId = link.getAttribute('data-jobid');
        const source = link.getAttribute('data-source');
        
        if (!jobId || jobId.trim() === '') {
          alert('Order identifier is missing. Cannot load delivery dates.');
          return;
        }

        try {
          const deliveries = await loadDeliveries(jobId, source);
          displayDeliveryDatesModal(deliveries);
        } catch (error) {
          console.error('Error loading deliveries:', error);
          alert(error.userMessage || 'Failed to load delivery data');
        }
      }
    });
  }

  async function loadProcesses(jobId, source) {
    if (!jobId) {
      throw userFacingError('Order identifier is missing.');
    }
    const apiBase = getApiBase();
    let url = `${apiBase}/orders/${encodeURIComponent(jobId)}/processes`;
    if (source) url += `?source=${encodeURIComponent(source)}`;

    const response = await fetch(url, {
      headers: buildAuthHeaders()
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      const body = await safeJson(response);
      throw userFacingError(body?.error || 'Unable to load order process data.');
    }

    return await response.json();
  }

  async function loadDeliveries(jobId, source) {
    if (!jobId) {
      throw userFacingError('Order identifier is missing.');
    }

    const apiBase = getApiBase();
    let url = `${apiBase}/orders/${encodeURIComponent(jobId)}/deliveries?limit=${encodeURIComponent(DEFAULT_LIMIT)}`;
    if (source) url += `&source=${encodeURIComponent(source)}`;

    const response = await fetch(url, {
      headers: buildAuthHeaders()
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      const body = await safeJson(response);
      throw userFacingError(body?.error || 'Unable to load delivery data.');
    }

    const body = await response.json();
    return Array.isArray(body) ? body : body?.items || [];
  }

  function displayProcessDetailsModal(processes) {
    const modalElement = document.getElementById('lastStatusModal');
    const modalContent = document.getElementById('lastStatusContent');
    
    if (!modalElement || !modalContent) {
      console.error('Process details modal elements not found');
      alert('Modal elements not found. Please refresh the page.');
      return;
    }

    if (!Array.isArray(processes) || processes.length === 0) {
      modalContent.innerHTML = '<tr><td colspan="6" class="text-center">No process data available</td></tr>';
    } else {
      let rows = '';
      processes.forEach(p => {
        const processName = p.ProcessName || '-';
        const completionPct = p.CompletionPct !== undefined && p.CompletionPct !== null ? `${p.CompletionPct}%` : '-';
        const processStatus = p.ProcessStatus || '-';
        const planDate = formatDate(p.PlanDate);
        const actualDate = formatDate(p.ActualDate);
        const planQty = p.PlanQty || '-';
        
        rows += `<tr>
          <td>${processName}</td>
          <td>${completionPct}</td>
          <td>${processStatus}</td>
          <td>${planDate}</td>
          <td>${actualDate}</td>
          <td>${planQty}</td>
        </tr>`;
      });
      modalContent.innerHTML = rows;
    }

    // Show modal
    try {
      let modal = bootstrap.Modal.getInstance(modalElement);
      if (!modal) {
        modal = new bootstrap.Modal(modalElement);
      }
      modal.show();
    } catch (error) {
      console.error('Error showing process details modal:', error);
      alert('Failed to display process details modal');
    }
  }

  function displayDeliveryDatesModal(deliveries) {
    const modalElement = document.getElementById('deliveryDatesModal');
    const modalContent = document.getElementById('deliveryDatesContent');
    
    if (!modalElement || !modalContent) {
      console.error('Delivery dates modal elements not found');
      alert('Modal elements not found. Please refresh the page.');
      return;
    }

    if (!Array.isArray(deliveries) || deliveries.length === 0) {
      modalContent.innerHTML = '<tr><td colspan="6" class="text-center">No delivery data available</td></tr>';
    } else {
      let rows = '';
      deliveries.forEach(d => {
        const deliveryId = d.DeliveryId || '-';
        const deliveryTs = formatDate(d.DeliveryTs);
        const challanNo = d.ChallanNo || '-';
        const containerNo = d.ContainerNo || '-';
        const qtyUnits = d.QtyUnits !== undefined && d.QtyUnits !== null ? d.QtyUnits : '-';
        const qtyPacks = d.QtyPacks !== undefined && d.QtyPacks !== null ? d.QtyPacks : '-';
        
        rows += `<tr>
          <td>${deliveryId}</td>
          <td>${deliveryTs}</td>
          <td>${challanNo}</td>
          <td>${containerNo}</td>
          <td>${qtyUnits}</td>
          <td>${qtyPacks}</td>
        </tr>`;
      });
      modalContent.innerHTML = rows;
    }

    // Show modal
    try {
      let modal = bootstrap.Modal.getInstance(modalElement);
      if (!modal) {
        modal = new bootstrap.Modal(modalElement);
      }
      modal.show();
    } catch (error) {
      console.error('Error showing delivery dates modal:', error);
      alert('Failed to display delivery dates modal');
    }
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

  function resolveImageUrl(rawUrl) {
    const fallback = '/assets/img/products/1.png';
    if (!rawUrl) return fallback;
    try {
      const url = String(rawUrl).trim();
      if (!url) return fallback;
      if (/^https?:\/\//i.test(url)) return url;
      return `/${url.replace(/^\/+/, '')}`;
    } catch {
      return fallback;
    }
  }

  async function safeJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function userFacingError(message) {
    const err = new Error(message);
    err.userMessage = message;
    return err;
  }

  function showGlobalError(message) {
    console.error(message);
    document.body.innerHTML = `
      <div class="container mt-5">
        <div class="alert alert-danger" role="alert">
          <h4 class="alert-heading">Error</h4>
          <p>${message}</p>
          <hr>
          <p class="mb-0">
            <a href="auth-login-cover.html" class="btn btn-primary">Go to Login</a>
          </p>
        </div>
      </div>
    `;
  }
});
