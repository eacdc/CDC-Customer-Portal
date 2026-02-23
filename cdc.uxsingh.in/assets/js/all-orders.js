'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const ORDERS_SESSION_KEY = 'cdcAuthSession';
  const DEFAULT_RANGE = '90d';
      const DEFAULT_LIMIT = '1000'; // Fetch more items for pagination
  const DEFAULT_ITEMS_PER_PAGE = 10;
  const AVAILABLE_PAGE_SIZES = [10, 25, 50, 100];

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

  const tabState = {
    all: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [], searchQuery: '', itemsPerPage: DEFAULT_ITEMS_PER_PAGE },
    pending: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [], searchQuery: '', itemsPerPage: DEFAULT_ITEMS_PER_PAGE },
    completed: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [], searchQuery: '', itemsPerPage: DEFAULT_ITEMS_PER_PAGE }
  };

  let currentCustomDateTab = null;

  const session = getStoredSession();

  if (!session?.token) {
    showGlobalError('You must sign in before viewing orders.');
    return;
  }

  // Check for URL search query parameter before initializing
  // Check sessionStorage for search intent
  const storedQuery = sessionStorage.getItem('lastSearchQuery');
  const storedTime = sessionStorage.getItem('lastSearchTime');
  if (storedQuery && storedTime) {
    // Clear it so it doesn't affect subsequent visits
    sessionStorage.removeItem('lastSearchQuery');
    sessionStorage.removeItem('lastSearchTime');
  }
  
  const urlParams = new URLSearchParams(window.location.search);
  const urlSearchQuery = urlParams.get('q');
  
  // If URL doesn't have query but we have stored one, use stored
  const finalSearchQuery = urlSearchQuery || storedQuery;
  
  // Store search query in state before loading orders (use finalSearchQuery which includes fallback)
  if (finalSearchQuery) {
    tabState.all.searchQuery = finalSearchQuery;
    // Switch to 'all' tab if not already active
    const allTab = document.getElementById('dispatch-tab');
    if (allTab && !allTab.classList.contains('active')) {
      allTab.click();
    }
  }
  
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

  // Re-apply ledger filter when CDC Printers ledger dropdown changes
  window.addEventListener('ledgerFilterChange', () => {
    ['all', 'pending', 'completed'].forEach((tab) => {
      const state = tabState[tab];
      if (state && state.orders) {
        state.filteredOrders = applyLedgerFilter(state.orders);
        state.currentPage = 1;
        renderOrdersWithPagination(tab);
      }
    });
  });

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
      // Backend already filters by date; use response as-is
      tabState[tab].orders = orders;
      tabState[tab].filteredOrders = applyLedgerFilter(orders);
      
      tabState[tab].currentPage = 1; // Reset to page 1
      renderOrdersWithPagination(tab);
    } catch (error) {
      console.error('Error loading orders:', error);
      container.innerHTML = `<div class="col-12 text-center"><p class="text-danger">${error.userMessage || 'Failed to load orders.'}</p></div>`;
    }
  }

  function getOrderLedgerName(order) {
    if (!order || typeof order !== 'object') return '';
    const name = (order.LedgerName || order.CustomerName || order.Ledger || '').toString().trim();
    return name;
  }

  function applyLedgerFilter(orders) {
    if (typeof window.getSelectedLedgerNames !== 'function') return orders || [];
    const selected = window.getSelectedLedgerNames();
    if (!Array.isArray(selected) || selected.length === 0) return [];
    const set = new Set(selected.map((s) => String(s).trim()).filter(Boolean));
    if (set.size === 0) return [];
    return (orders || []).filter((order) => {
      const name = getOrderLedgerName(order);
      return name && set.has(name);
    });
  }

  async function loadOrders(tab) {
    const apiBase = getApiBase();
    const state = tabState[tab];
    const dateRange = state.dateRange || DEFAULT_RANGE;
    
    let url = `${apiBase}/orders?tab=${encodeURIComponent(tab)}&limit=${encodeURIComponent(DEFAULT_LIMIT)}`;
    
    // Add search query if present (from input or stored query)
    const searchQuery = (state.searchInput ? state.searchInput.value.trim() : '') || state.searchQuery || '';
    
    if (searchQuery) {
      url += `&q=${encodeURIComponent(searchQuery)}`;
      // Store the search query in state
      state.searchQuery = searchQuery;
    }
    
    if (state.customDates) {
      // Custom date range
      url += `&from=${encodeURIComponent(state.customDates.from)}&to=${encodeURIComponent(state.customDates.to)}`;
    } else {
      // Predefined range
      url += `&range=${encodeURIComponent(dateRange)}`;
    }
    
    const startTime = performance.now();
    const response = await fetch(url, {
      headers: buildAuthHeaders()
    });
    const endTime = performance.now();

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
    
    return items;
  }

  function renderOrderCards(orders, container, emptyMessage, searchQuery = '') {
    if (!container) return;

    // Clear container but preserve search message container
    const existingSearchMsg = container.parentElement?.querySelector('.search-result-message');
    if (existingSearchMsg) {
      existingSearchMsg.remove();
    }

    if (!orders || orders.length === 0) {
      container.innerHTML = `<div class="col-12 text-center"><p>${emptyMessage || 'No orders found.'}</p></div>`;
      return;
    }

    // Add search result message if there's a search query
    if (searchQuery && searchQuery.trim()) {
      const searchMsgDiv = document.createElement('div');
      searchMsgDiv.className = 'col-12 mb-3 search-result-message';
      searchMsgDiv.innerHTML = `<p class="text-muted mb-0"><strong>Search result for '<span class="text-primary">${escapeHtml(searchQuery)}</span>'</strong></p>`;
      container.parentElement?.insertBefore(searchMsgDiv, container);
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
    const finishPlanDate = formatDate(order.FinishPlanDate);
    const segmentName = order.SegmentName || '';
    const imageUrl = resolveImageUrl(order.ImageUrl, segmentName);
    const fallbackImageUrl = resolveImageUrl(null, segmentName);
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
      <div class="card order-card">
        <div class="card-body p-4">
          <div class="row align-items-start">
            <!-- Product Image - Always visible -->
            <div class="col-auto">
              <img src="${imageUrl}" alt="Product" class="rounded" style="width: 100px; height: 100px; object-fit: contain; background-color: #f5f5f5;" decoding="async" onerror="this.onerror=null;this.src='${fallbackImageUrl}';">
            </div>
            
            <!-- Main Content -->
            <div class="col">
              <!-- Always Visible: Job Name, Ordered QTY, Order Status, and Delivered QTY -->
              <div class="order-card-core">
                <h5 class="mb-1">${title}</h5>
                <p class="mb-2"><strong>Ordered QTY:</strong> ${orderQty}</p>
                <p class="mb-2"><strong>Delivered QTY:</strong> ${deliveredQty}</p>
                <p class="mb-0"><strong>Order status:</strong> <span class="badge ${statusClass}">${status}</span></p>
              </div>

              <!-- Always Visible: Show Details Toggle Button (Mobile) and Action Buttons (Desktop) -->
              <div class="order-card-actions d-flex flex-wrap align-items-center gap-3 mt-3">
                <button type="button" class="btn btn-sm btn-label-secondary process-details-btn d-none d-lg-inline-block" data-jobid="${jobId}" data-source="${source}">
                  Process Details
                </button>
                <div class="d-none d-lg-flex align-items-center gap-3">
                  <div class="order-card-date-field">
                    <small class="text-muted text-uppercase d-block" style="font-size: 0.625rem; letter-spacing: 0.04em;">Committed Delivery</small>
                    <span style="font-size: 0.875rem; font-weight: 500;">${committedDelivery}</span>
                  </div>
                  <div class="order-card-date-field">
                    <small class="text-muted text-uppercase d-block" style="font-size: 0.625rem; letter-spacing: 0.04em;">Finish Plan Date</small>
                    <span style="font-size: 0.875rem; font-weight: 500;">${finishPlanDate}</span>
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-link order-card-toggle d-lg-none ms-auto" aria-expanded="false">
                  Show Details
                </button>
              </div>

              <!-- Hidden on Mobile: Extra Details -->
              <div class="order-card-extra mt-4">
                <div class="row">
                  <div class="col-12">
                    <p class="text-muted mb-2">PO No. ${poNumber}</p>
                  </div>
                </div>
                <div class="row">
                  <div class="col-12">
                    <p class="mb-2"><strong>Committed Delivery:</strong> ${committedDelivery}</p>
                  </div>
                </div>
                <div class="row">
                  <div class="col-12">
                    <p class="mb-2"><strong>Finish Plan Date:</strong> ${finishPlanDate}</p>
                  </div>
                </div>
                <div class="row">
                  <div class="col-12">
                    <p class="text-muted mb-1">PO Date: ${poDate}</p>
                  </div>
                </div>
                <div class="row">
                  <div class="col-12">
                    <p class="text-muted mb-1">Approval: ${approvalDate}</p>
                  </div>
                </div>
                <div class="row">
                  <div class="col-12">
                    <p class="mb-2"><strong>Job Card No. #${jobCardNo}</strong></p>
                  </div>
                </div>
                <div class="row">
                  <div class="col-12">
                    <p class="mb-0"><strong>Packed QTY:</strong> ${packedQty}</p>
                  </div>
                </div>

                <!-- Action Buttons at the bottom of expandable section (Mobile only) -->
                <div class="order-card-extra-actions d-flex flex-wrap align-items-center gap-3 mt-4 d-lg-none">
                  <button type="button" class="btn btn-sm btn-label-secondary process-details-btn" data-jobid="${jobId}" data-source="${source}">
                    Process Details
                  </button>
                  <a href="javascript:void(0);" class="text-primary delivery-dates-btn" data-jobid="${jobId}" data-source="${source}">Delivery Dates</a>
                </div>
              </div>
            </div>
          </div>
          <!-- Desktop-only right panel -->
          <div class="order-card-right-panel d-none d-lg-flex">
            <div class="order-card-info-item">
              <small class="text-muted text-uppercase">PO No.</small>
              <span class="fw-semibold">${poNumber}</span>
            </div>
            <div class="order-card-info-item">
              <small class="text-muted text-uppercase">PO Date</small>
              <span>${poDate}</span>
            </div>
            <div class="order-card-info-item">
              <small class="text-muted text-uppercase">Approval Date</small>
              <span>${approvalDate}</span>
            </div>
            <div class="order-card-info-item">
              <small class="text-muted text-uppercase">Job Card No.</small>
              <span class="fw-semibold">#${jobCardNo}</span>
            </div>
            <div class="order-card-info-item">
              <a href="javascript:void(0);" class="btn btn-sm btn-label-primary delivery-dates-btn" data-jobid="${jobId}" data-source="${source}">Delivery Dates</a>
            </div>
          </div>
        </div>
      </div>
    `;

    const cardEl = col.querySelector('.order-card');
    const toggleBtn = cardEl.querySelector('.order-card-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const expanded = cardEl.classList.toggle('order-card-expanded');
        toggleBtn.textContent = expanded ? 'Hide Details' : 'Show Details';
        toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
    }

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
        
        if (!currentValue) {
          // User cleared the search box
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
        
        if (!currentValue) {
          // User clicked the X button or cleared via other means
          tabState[tab].searchQuery = '';
          
          // Reload orders without search query
          loadOrdersForTab(tab, config.containerId);
        }
      });
      
      // Also handle when input loses focus and is empty
      input.addEventListener('blur', () => {
        const currentValue = input.value.trim();
        if (!currentValue && tabState[tab].searchQuery) {
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
    
    // If query is empty, clear the stored query
    if (!query) {
      state.searchQuery = '';
      // Don't reload here - let the input event handler do it
      return;
    }
    
    // Store search query in state
    state.searchQuery = query;
    
    // Reload orders from API with the search parameter
    loadOrdersForTab(tab, config.containerId);
  }

  function renderOrdersWithPagination(tab) {
    const config = TAB_CONFIG[tab];
    const state = tabState[tab];
    if (!config || !config.container || !state) return;

    const filtered = state.filteredOrders || [];
    const totalItems = filtered.length;
    const itemsPerPage = state.itemsPerPage || DEFAULT_ITEMS_PER_PAGE;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const currentPage = Math.max(1, Math.min(state.currentPage || 1, totalPages || 1));

    // Get items for current page
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filtered.slice(startIndex, endIndex);

    const query = (state.searchInput ? state.searchInput.value.trim() : '') || state.searchQuery || '';
    const emptyMessage = query
      ? config.searchEmptyMessage || config.emptyMessage || 'No matching records found.'
      : config.emptyMessage || 'No records found.';

    renderOrderCards(pageItems, config.container, emptyMessage, query);
    renderPagination(tab, currentPage, totalPages, totalItems, itemsPerPage);
  }

  function renderPagination(tab, currentPage, totalPages, totalItems, itemsPerPage) {
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

    if (totalPages <= 1 && totalItems <= itemsPerPage) {
      paginationContainer.innerHTML = '';
      return;
    }

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    // Build page limit selector
    const pageSizeOptions = AVAILABLE_PAGE_SIZES.map(size => 
      `<option value="${size}" ${size === itemsPerPage ? 'selected' : ''}>${size}</option>`
    ).join('');
    
    const pageSizeSelector = `
      <div class="d-flex align-items-center me-3">
        <label for="page-size-select-${tab}" class="form-label mb-0 me-2 text-muted">Show:</label>
        <select id="page-size-select-${tab}" class="form-select form-select-sm" style="width: auto;">
          ${pageSizeOptions}
        </select>
      </div>
    `;

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
          <div class="d-flex align-items-center">
            ${pageSizeSelector}
            <div class="text-muted ms-3">
              Showing ${Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} to ${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems} entries
            </div>
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
          config.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // Bind page size change handler
    const pageSizeSelect = paginationContainer.querySelector(`#page-size-select-${tab}`);
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', (e) => {
        const newSize = parseInt(e.target.value);
        tabState[tab].itemsPerPage = newSize;
        tabState[tab].currentPage = 1; // Reset to first page
        renderOrdersWithPagination(tab);
        config.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
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
      order.FinishPlanDate,
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
          // Add jobId and source to each process for QC check button
          processes.forEach(p => {
            p.JobBookingID = jobId;
            p._source = source;
          });
          displayProcessDetailsModal(processes, jobId, source);
        } catch (error) {
          console.error('Error loading processes:', error);
          alert(error.userMessage || 'Failed to load order processes');
        }
      }
    });

    // QC Check button handler
    document.addEventListener('click', async function(e) {
      const btn = e.target.closest('.qc-check-btn');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const jobId = btn.getAttribute('data-jobid');
        const processId = btn.getAttribute('data-processid');
        const source = btn.getAttribute('data-source');
        
        if (!jobId || !processId) {
          alert('Job ID or Process ID is missing. Cannot load inspection data.');
          return;
        }

        // Disable button and show loading
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Loading...';

        try {
          const inspections = await loadInspections(jobId, processId, source);
          displayInspectionsModal(inspections, processId);
        } catch (error) {
          console.error('Error loading inspections:', error);
          alert(error.userMessage || 'Failed to load inspection data');
        } finally {
          // Re-enable button
          btn.disabled = false;
          btn.innerHTML = originalText;
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

  async function loadInspections(jobId, processId, source) {
    if (!jobId || !processId) {
      throw userFacingError('Job ID or Process ID is missing.');
    }

    const apiBase = getApiBase();
    let url = `${apiBase}/orders/${encodeURIComponent(jobId)}/processes/${encodeURIComponent(processId)}/inspections`;
    if (source) url += `?source=${encodeURIComponent(source)}`;

    const response = await fetch(url, {
      headers: buildAuthHeaders()
    });

    if (response.status === 404) {
      return [];
    }

    if (response.status === 401) {
      throw userFacingError('Your session has expired. Please sign out and sign in again.');
    }

    if (!response.ok) {
      const body = await safeJson(response);
      console.error('[INSPECTIONS] Error response:', response.status, body);
      throw userFacingError(body?.error || 'Unable to load inspection data.');
    }

    const body = await response.json();
    const inspections = Array.isArray(body) ? body : body?.items || [];
    return inspections;
  }

  function displayProcessDetailsModal(processes, jobId, source) {
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
        const processId = p.ProcessID || p.ProcessId || '';
        const processJobId = p.JobBookingID || jobId || '';
        const processSource = p._source || source || '';
        
        // Create Check button if we have both jobId and processId
        const checkButton = processId && processJobId ? 
          `<button class="btn btn-sm btn-primary qc-check-btn" 
                   data-jobid="${processJobId}" 
                   data-processid="${processId}" 
                   data-source="${processSource}">
            Check
          </button>` : 
          '<span class="text-muted">-</span>';
        
        rows += `<tr>
          <td>${processName}</td>
          <td>${completionPct}</td>
          <td>${processStatus}</td>
          <td>${planDate}</td>
          <td>${actualDate}</td>
          <td>${checkButton}</td>
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

  function displayInspectionsModal(inspections, processId) {
    const modalElement = document.getElementById('inspectionsModal');
    const modalHeader = document.getElementById('inspectionsTableHeader');
    const modalContent = document.getElementById('inspectionsContent');
    const processDetailsModal = document.getElementById('lastStatusModal');
    
    if (!modalElement || !modalHeader || !modalContent) {
      console.error('Inspections modal elements not found');
      alert('Modal elements not found. Please refresh the page.');
      return;
    }
    
    // Add blur effect to process details modal if it's open
    if (processDetailsModal) {
      const processModalInstance = bootstrap.Modal.getInstance(processDetailsModal);
      if (processModalInstance && processModalInstance._isShown) {
        processDetailsModal.style.filter = 'blur(3px)';
        processDetailsModal.style.opacity = '0.7';
        processDetailsModal.style.pointerEvents = 'none';
      }
    }

    if (!Array.isArray(inspections) || inspections.length === 0) {
      modalHeader.innerHTML = '';
      modalContent.innerHTML = '<tr><td colspan="10" class="text-center">No inspection data available</td></tr>';
    } else {
      // Get all unique keys from inspection objects to create dynamic headers
      const allKeys = new Set();
      inspections.forEach(inspection => {
        Object.keys(inspection).forEach(key => allKeys.add(key));
      });
      
      // Create table headers dynamically
      const headers = Array.from(allKeys).map(key => {
        // Format header name (convert camelCase to Title Case)
        const headerName = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .trim();
        return `<th>${headerName}</th>`;
      }).join('');
      
      modalHeader.innerHTML = headers;
      
      // Create table rows with alternating row colors for better readability
      let rows = '';
      inspections.forEach((inspection, index) => {
        // Alternate row background colors - light sky blue theme
        const rowBgColor = index % 2 === 0 ? '#ffffff' : '#e3f2fd';
        let row = `<tr style="background-color: ${rowBgColor};">`;
        Array.from(allKeys).forEach(key => {
          let value = inspection[key];
          
          // Format the value
          if (value === null || value === undefined) {
            value = '-';
          } else if (value instanceof Date) {
            value = formatDate(value);
          } else if (typeof value === 'object') {
            value = JSON.stringify(value);
          } else {
            value = String(value);
          }
          
          row += `<td>${escapeHtml(value)}</td>`;
        });
        row += '</tr>';
        rows += row;
      });
      
      modalContent.innerHTML = rows;
    }

    // Show modal
    try {
      let modal = bootstrap.Modal.getInstance(modalElement);
      if (!modal) {
        modal = new bootstrap.Modal(modalElement);
      }
      
      // Add event listeners to handle blur effect when inspection modal opens/closes
      modalElement.addEventListener('show.bs.modal', function() {
        const processDetailsModal = document.getElementById('lastStatusModal');
        if (processDetailsModal) {
          const processModalInstance = bootstrap.Modal.getInstance(processDetailsModal);
          if (processModalInstance && processModalInstance._isShown) {
            processDetailsModal.style.filter = 'blur(3px)';
            processDetailsModal.style.opacity = '0.7';
            processDetailsModal.style.pointerEvents = 'none';
            processDetailsModal.style.transition = 'filter 0.3s ease, opacity 0.3s ease';
          }
        }
      });
      
      modalElement.addEventListener('hidden.bs.modal', function() {
        const processDetailsModal = document.getElementById('lastStatusModal');
        if (processDetailsModal) {
          processDetailsModal.style.filter = 'none';
          processDetailsModal.style.opacity = '1';
          processDetailsModal.style.pointerEvents = 'auto';
        }
      });
      
      modal.show();
    } catch (error) {
      console.error('Error showing inspections modal:', error);
      alert('Failed to display inspections modal');
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

  function resolveImageUrl(rawUrl, segmentName) {
    const defaultBySegment = {
      'Commercial': '/assets/img/products/default-book.jpeg',
      'Packaging': '/assets/img/products/default-packaging.jpeg'
    };
    const fallback = (segmentName && defaultBySegment[segmentName])
      ? defaultBySegment[segmentName]
      : '/assets/img/products/1.png';
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