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

  // Bind Export-to-Excel handler
  bindExportHandlers();

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
    // Ledger filter is ONLY for @cdcprinters.com users.
    const email = (session?.email || '').trim().toLowerCase();
    const isCdcUser = email.endsWith('@cdcprinters.com');
    if (!isCdcUser) {
      return orders || [];
    }

    if (typeof window.getSelectedLedgerNames !== 'function') return orders || [];
    const selected = window.getSelectedLedgerNames();
    if (!Array.isArray(selected) || selected.length === 0) return orders || [];

    const set = new Set(selected.map((s) => String(s).trim()).filter(Boolean));
    if (set.size === 0) return orders || [];

    const filtered = (orders || []).filter((order) => {
      const name = getOrderLedgerName(order);
      return name && set.has(name);
    });

    console.log('[ORDERS] Ledger filter applied:', {
      isCdcUser,
      email,
      selectedLedgers: Array.from(set),
      beforeCount: (orders || []).length,
      afterCount: filtered.length
    });

    return filtered;
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

    // Log exact request used to load orders (backend uses this to call dbo.portal_orders_list2)
    const queryParams = {
      tab,
      limit: DEFAULT_LIMIT,
      ...(searchQuery && { q: searchQuery }),
      ...(state.customDates
        ? { from: state.customDates.from, to: state.customDates.to }
        : { range: dateRange })
    };
    console.log('[ORDERS] Request (calls dbo.portal_orders_list2):', {
      url,
      method: 'GET',
      queryParams
    });

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

    // Debug log: what the Orders API returned to the frontend
    console.log('[ORDERS API] Frontend received response:', {
      url,
      status: response.status,
      durationMs: (endTime - startTime).toFixed(2),
      rawBody: body,
      itemCount: items.length
    });
    
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
    const containerNo = order.ContainerNo ?? order.containerno ?? '';

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
                  <a href="javascript:void(0);" class="btn btn-sm btn-label-primary shipment-details-btn" data-jobid="${jobId}" data-source="${source}" data-container-no="${containerNo}">Shipment Details</a>
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
            <div class="order-card-info-item d-flex flex-wrap gap-2 align-items-center">
              <a href="javascript:void(0);" class="btn btn-sm btn-label-primary shipment-details-btn" data-jobid="${jobId}" data-source="${source}" data-container-no="${containerNo}">Shipment Details</a>
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
      const date = dateString instanceof Date ? dateString : new Date(dateString);
      if (isNaN(date.getTime())) return String(dateString);
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

    // Shipment Details button handler
    document.addEventListener('click', async function(e) {
      const btn = e.target.closest('.shipment-details-btn');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const jobId = btn.getAttribute('data-jobid');
        const source = btn.getAttribute('data-source');
        const containerNo = (btn.getAttribute('data-container-no') || '').trim();
        
        if (!containerNo) {
          alert('No container number for this order. Shipment details are not available.');
          return;
        }
        if (!jobId || jobId.trim() === '') {
          alert('Order identifier is missing. Cannot load shipment details.');
          return;
        }

        try {
          const rows = await loadShipmentDetails(jobId, containerNo, source);
          displayShipmentDetailsModal(rows, containerNo);
        } catch (error) {
          console.error('Error loading shipment details:', error);
          alert(error.userMessage || 'Failed to load shipment details.');
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

  async function loadShipmentDetails(jobId, containerNo, source) {
    if (!jobId || !containerNo) {
      throw userFacingError('Order identifier or container number is missing.');
    }
    const apiBase = getApiBase();
    let url = `${apiBase}/orders/${encodeURIComponent(jobId)}/shipment-details?containerNo=${encodeURIComponent(containerNo)}`;
    if (source) url += `&source=${encodeURIComponent(source)}`;

    const response = await fetch(url, {
      headers: buildAuthHeaders()
    });

    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      const body = await safeJson(response);
      throw userFacingError(body?.error || 'Unable to load shipment details.');
    }
    const body = await response.json();
    return Array.isArray(body) ? body : [];
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

  function displayShipmentDetailsModal(rows, containerNo) {
    const modalElement = document.getElementById('shipmentDetailsModal');
    const headerRow = document.getElementById('shipmentDetailsTableHeader');
    const tbody = document.getElementById('shipmentDetailsContent');

    if (!modalElement || !headerRow || !tbody) {
      console.error('Shipment details modal elements not found');
      alert('Modal elements not found. Please refresh the page.');
      return;
    }

    // Fixed column order + customer-facing labels. Keys match the explicit
    // SELECT from GET /orders/:jobId/shipment-details.
    const SHIPMENT_COLUMNS = [
      { key: 'ContainerNumber', label: 'Container Number' },
      { key: 'DestinationPort', label: 'Destination Port' },
      { key: 'OriginDepartureActualDate', label: 'Original sailing date', isDate: true },
      { key: 'DestinationArrivalOriginalPlannedDate', label: 'ETA', isDate: true },
      { key: 'DestinationArrivalActualDate', label: 'Destination Arrival Actual', isDate: true },
      { key: 'DestinationArrivalPlannedDate', label: 'Revised ETA', isDate: true },
      { key: 'GateInDate', label: 'Gate In Date', isDate: true },
      { key: 'DepartureDate', label: 'Departure Date', isDate: true },
      { key: 'Link', label: 'Track', isLink: true },
      { key: 'CreatedAt', label: 'Created At', isDate: true }
    ];

    const pickRowValue = (row, key) => {
      if (!row || typeof row !== 'object') return null;
      if (row[key] !== undefined && row[key] !== null) return row[key];
      const lower = String(key).toLowerCase();
      const match = Object.keys(row).find((k) => String(k).toLowerCase() === lower);
      return match ? row[match] : null;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      headerRow.innerHTML = '<th>Container Number</th>';
      const displayNo = containerNo ? escapeHtml(String(containerNo).trim()) : '—';
      tbody.innerHTML = `<tr><td data-label="Container Number" class="text-center">${displayNo}</td></tr>`;
    } else {
      const isUrl = (v) => typeof v === 'string' && /^https?:\/\/\S+/i.test(v.trim());
      headerRow.innerHTML = SHIPMENT_COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
      tbody.innerHTML = rows.map((row) => {
        return `<tr>${SHIPMENT_COLUMNS.map((col) => {
          const v = pickRowValue(row, col.key);
          const labelAttr = ` data-label="${escapeHtml(col.label)}"`;
          if (col.isLink && isUrl(v)) {
            const url = String(v).trim();
            const safeUrl = escapeHtml(url);
            return `<td${labelAttr}><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="d-inline-flex align-items-center gap-1 text-primary" title="Track"><i class="icon-base ti tabler-map-pin"></i> Track</a></td>`;
          }
          if (v === undefined || v === null || v === '') {
            return `<td${labelAttr}>-</td>`;
          }
          if (col.isDate || v instanceof Date) {
            return `<td${labelAttr}>${escapeHtml(formatDate(v))}</td>`;
          }
          const display = typeof v === 'object' ? JSON.stringify(v) : String(v);
          return `<td${labelAttr}>${escapeHtml(display)}</td>`;
        }).join('')}</tr>`;
      }).join('');
    }

    try {
      let modal = bootstrap.Modal.getInstance(modalElement);
      if (!modal) {
        modal = new bootstrap.Modal(modalElement);
      }
      modal.show();
    } catch (error) {
      console.error('Error showing shipment details modal:', error);
      alert('Failed to display shipment details modal');
    }
  }

  function escapeHtml(str) {
    if (str == null) return '';
    const s = String(str);
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ===================== Excel Export =====================

  const EXPORT_CHUNK_SIZE = 500; // Must match backend MAX_JOBS

  function bindExportHandlers() {
    document.addEventListener('click', async function (e) {
      const btn = e.target.closest('.export-excel-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const tab = btn.getAttribute('data-tab');
      if (!tab || !tabState[tab]) {
        alert('Unknown tab. Cannot export.');
        return;
      }

      if (typeof XLSX === 'undefined' || !XLSX || !XLSX.utils) {
        alert('Excel library failed to load. Please refresh the page and try again.');
        return;
      }

      await exportTabToExcel(tab, btn);
    });
  }

  async function exportTabToExcel(tab, btn) {
    const state = tabState[tab];
    const orders = Array.isArray(state?.filteredOrders) && state.filteredOrders.length
      ? state.filteredOrders
      : (state?.orders || []);

    if (!orders.length) {
      alert('No orders to export for the selected date range.');
      return;
    }

    // Only Commercial-bucket orders (segment in Commercial/Books/Book) are
    // covered by the production-summary API. Packaging and Other (e.g.
    // "Leaflet | Cards") jobs are intentionally excluded from this export so
    // they never hit the backend and never appear in the workbook.
    let packagingExcludedCount = 0;
    let otherExcludedCount = 0;
    const exportableOrders = [];
    const segmentDiagnostics = new Map(); // segmentValue -> { bucket, count, sampleJobs[] }
    orders.forEach((o) => {
      const rawSegment = o?.SegmentName ?? o?.segmentname ?? null;
      const bucket = orderSegmentBucket(o);
      const diagKey = rawSegment === null || rawSegment === undefined ? '<null>' : String(rawSegment);
      if (!segmentDiagnostics.has(diagKey)) {
        segmentDiagnostics.set(diagKey, { bucket, count: 0, sampleJobs: [] });
      }
      const diag = segmentDiagnostics.get(diagKey);
      diag.count++;
      if (diag.sampleJobs.length < 3) diag.sampleJobs.push(o?.JobCardNo || o?.JobBookingNo || '?');

      if (bucket === 'commercial') {
        exportableOrders.push(o);
      } else if (bucket === 'packaging') {
        packagingExcludedCount++;
      } else {
        otherExcludedCount++;
      }
    });

    // Diagnostic log: tells us at a glance what raw SegmentName values came
    // back from the API and how each one was bucketed. If a job appears in
    // the wrong bucket, look at the "Raw SegmentName" cell — that is the
    // value coming straight out of dbo.portal_orders_list2.
    console.table(
      Array.from(segmentDiagnostics.entries()).map(([segment, info]) => ({
        'Raw SegmentName': segment,
        'Bucket': info.bucket,
        'Count': info.count,
        'Sample Jobs': info.sampleJobs.join(', ')
      }))
    );

    if (!exportableOrders.length) {
      alert('No exportable orders in this view — only commercial (book) orders are included in the Excel export.');
      return;
    }

    // Build payload jobs (drop any rows that can't be uniquely identified)
    const payloadJobs = exportableOrders
      .map((o) => ({
        order: o,
        jobBookingNo: String(o.JobCardNo ?? o.JobBookingNo ?? '').trim(),
        source: String(o._source ?? o.source ?? o.sourceTag ?? '').trim().toLowerCase(),
        containerNo: String(o.ContainerNo ?? o.containerno ?? '').trim()
      }))
      .filter((j) => j.jobBookingNo && (j.source === 'db1' || j.source === 'db2'));

    if (!payloadJobs.length) {
      alert('No exportable orders found (missing job number or source).');
      return;
    }

    // Diagnostic: show how many jobs we're sending per source database, and
    // a few sample job numbers from each. Useful when one DB's data is
    // missing from the export — if e.g. all KOL jobs end up grouped under
    // an empty source, we'll see "(empty)" entries here.
    const sourceCounts = payloadJobs.reduce((acc, j) => {
      const key = j.source || '(empty)';
      if (!acc[key]) acc[key] = { count: 0, samples: [] };
      acc[key].count++;
      if (acc[key].samples.length < 3) acc[key].samples.push(j.jobBookingNo);
      return acc;
    }, {});
    console.table(
      Object.entries(sourceCounts).map(([source, info]) => ({
        Source: source,
        Count: info.count,
        'Sample Job Nos': info.samples.join(', ')
      }))
    );

    const originalBtnHtml = btn ? btn.innerHTML : '';
    const setBtnState = (html, disabled) => {
      if (!btn) return;
      btn.innerHTML = html;
      btn.disabled = !!disabled;
    };

    setBtnState(
      `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Preparing export...`,
      true
    );

    try {
      const chunks = chunkArray(payloadJobs, EXPORT_CHUNK_SIZE);
      const allItems = [];
      let totalProductionFailures = 0;
      let totalShipmentMatches = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunks.length > 1) {
          setBtnState(
            `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Fetching ${i * EXPORT_CHUNK_SIZE + 1}-${i * EXPORT_CHUNK_SIZE + chunk.length} of ${payloadJobs.length}...`,
            true
          );
        }

        const body = {
          jobs: chunk.map((j) => ({
            jobBookingNo: j.jobBookingNo,
            source: j.source,
            containerNo: j.containerNo
          }))
        };

        const data = await postExportSummary(body);
        const items = Array.isArray(data?.items) ? data.items : [];
        totalProductionFailures += Number(data?.productionFailures || 0);
        totalShipmentMatches += Number(data?.shipmentMatches || 0);

        chunk.forEach((j, idx) => {
          allItems.push({ order: j.order, item: items[idx] || null });
        });
      }

      setBtnState(
        `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Building Excel...`,
        true
      );

      const filename = buildExportFilename(tab, state);
      buildAndDownloadWorkbook(allItems, filename);

      // Surface the exact jobs that came back without proc data, grouped
      // by source DB. Paste these into SSMS to debug why the proc isn't
      // returning rows for them (CompanyID mismatch, deleted job, format
      // edge case, etc.).
      const failedJobs = allItems
        .filter(({ item }) => item?.productionError)
        .map(({ order, item }) => ({
          jobBookingNo: item?.jobBookingNo
            || order?.JobBookingNo
            || order?.JobCardNo
            || '',
          source: item?.source || order?._source || '',
          error: item?.productionError || ''
        }));
      if (failedJobs.length) {
        const failedBySource = failedJobs.reduce((acc, f) => {
          (acc[f.source || '(unknown)'] ||= []).push(f.jobBookingNo);
          return acc;
        }, {});
        console.warn(
          `[EXPORT] ${failedJobs.length} job(s) had no proc data (see table below).`,
          failedBySource
        );
        console.table(failedJobs);
      }

      console.log('[EXPORT] Completed', {
        tab,
        totalOrders: orders.length,
        packagingExcluded: packagingExcludedCount,
        otherExcluded: otherExcludedCount,
        exportedRows: allItems.length,
        productionFailures: totalProductionFailures,
        shipmentMatches: totalShipmentMatches
      });

      const notices = [];
      if (packagingExcludedCount > 0) {
        notices.push(`${packagingExcludedCount} packaging order${packagingExcludedCount === 1 ? '' : 's'} excluded from the export.`);
      }
      if (otherExcludedCount > 0) {
        notices.push(`${otherExcludedCount} non-commercial order${otherExcludedCount === 1 ? '' : 's'} (e.g. leaflets, cards) excluded from the export.`);
      }
      if (totalProductionFailures > 0) {
        notices.push(`${totalProductionFailures} of ${allItems.length} job${allItems.length === 1 ? '' : 's'} had no data from the stored procedure; those rows show only the JobBookingNo and the rest of the columns are blank. See browser console for the full list.`);
      }
      if (notices.length) {
        setTimeout(() => alert(`Export complete.\n\n• ${notices.join('\n• ')}`), 200);
      }
    } catch (err) {
      console.error('[EXPORT] Failed', err);
      alert(err?.userMessage || err?.message || 'Failed to export orders to Excel.');
    } finally {
      setBtnState(originalBtnHtml, false);
    }
  }

  async function postExportSummary(body) {
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/orders/export-summary`, {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (response.status === 401) {
      throw userFacingError('Your session has expired. Please sign out and sign in again.');
    }
    if (!response.ok) {
      const errBody = await safeJson(response);
      throw userFacingError(errBody?.error || `Export request failed (HTTP ${response.status}).`);
    }
    return await response.json();
  }

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function buildExportFilename(tab, state) {
    const tabLabel = tab.charAt(0).toUpperCase() + tab.slice(1);
    let rangeLabel;
    if (state?.customDates?.from && state?.customDates?.to) {
      rangeLabel = `${state.customDates.from}_to_${state.customDates.to}`;
    } else {
      rangeLabel = (getRangeLabel(state?.dateRange || DEFAULT_RANGE) || 'Last 90 Days').replace(/\s+/g, '_');
    }
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `orders_${tabLabel}_${rangeLabel}_${yyyy}-${mm}-${dd}.xlsx`;
  }

  function buildAndDownloadWorkbook(records, filename) {
    const rows = records.map(({ order, item }) => flattenForExport(order, item));

    // Collect the union of all keys so every row aligns in the sheet, even if
    // some orders have shipment columns that others don't.
    const headerSet = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
    const headers = Array.from(headerSet);

    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });

    // Reasonable column widths based on header label length.
    sheet['!cols'] = headers.map((h) => ({
      wch: Math.min(Math.max(12, h.length + 2), 40)
    }));

    // Make TrackingLink cells clickable. SheetJS attaches a hyperlink when
    // a cell has a `.l` property; Excel renders it as the usual blue
    // underlined link. Excel only supports one hyperlink per cell, so for
    // multi-container jobs (pipe-separated URLs in one cell) we link to
    // the first URL in the list. Any additional URLs are still visible as
    // text in the cell — the customer can copy/paste them.
    const trackingColIndex = headers.indexOf('TrackingLink');
    if (trackingColIndex !== -1) {
      // Match the first http(s) URL in the cell, stopping at whitespace
      // or a '|' separator so a trailing pipe doesn't get glued to the
      // hyperlink target.
      const FIRST_URL_RE = /https?:\/\/[^\s|]+/i;
      for (let r = 0; r < rows.length; r++) {
        // +1 because row 0 in the sheet is the header row.
        const cellAddr = XLSX.utils.encode_cell({ c: trackingColIndex, r: r + 1 });
        const cell = sheet[cellAddr];
        if (!cell || !cell.v) continue;
        const match = String(cell.v).match(FIRST_URL_RE);
        if (match) {
          cell.l = { Target: match[0], Tooltip: 'Click to track shipment' };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Orders');
    XLSX.writeFile(wb, filename);
  }

  function flattenForExport(order, item) {
    const prod = item?.production || {};
    const shipment = item?.shipment || {};

    // Columns are emitted in the exact order dbo.GetJobFullDetails_Client
    // returns them, with the exact SP column names as headers. No columns
    // from portal_orders_list2 (Title, PoNumber, LedgerName, etc.) are
    // included — only what the proc itself returns. If you add/remove a
    // column in the SP, mirror the change here.
    const row = {
      // When the proc returned no data for this job (productionError), prod
      // is empty. Falling back to the order's own job-no fields here means
      // the row still identifies itself instead of being a totally blank
      // line — the Production Fetch Error column on the far right will
      // explain why all the other proc columns are empty.
      JobBookingNo: pickString(prod.JobBookingNo, order?.JobBookingNo, order?.JobCardNo),
      JobName: pickString(prod.JobName),
      TotalOrderQty: pickNumber(prod.TotalOrderQty),
      TextPages: pickNumber(prod.TextPages),
      TextColor: pickLeadingInt(prod.TextColor),
      CloseSize: pickString(prod.CloseSize),
      BindingStyle: pickString(prod.BindingStyle),
      FileReceivedDate: formatDateForExcel(prod.FileReceivedDate),
      SoftCopyApprovalSentDate: formatDateForExcel(prod.SoftCopyApprovalSentDate),
      FinalApprovalDate: formatDateForExcel(prod.FinalApprovalDate),
      FinallyApproved: pickString(prod.FinallyApproved),
      TextPaperQuality: pickString(prod.TextPaperQuality),
      CoverPaperQuality: pickString(prod.CoverPaperQuality),
      TextPrintCompletionPct: pickNumber(prod.TextPrintCompletionPct),
      TextPrintingEndDate: formatDateForExcel(prod.TextPrintingEndDate),
      CoverPrintCompletionPct: pickNumber(prod.CoverPrintCompletionPct),
      CoverPrintingEndDate: formatDateForExcel(prod.CoverPrintingEndDate),
      BindingCompletionPct: pickNumber(prod.BindingCompletionPct),
      BindingEndDate: formatDateForExcel(prod.BindingEndDate),
      GpnQty: pickNumber(prod.GpnQty),
      LastGpnDate: formatDateForExcel(prod.LastGpnDate),
      DispatchedQty: pickNumber(prod.DispatchedQty),
      // Shipment columns. We keep only customer-facing fields, all named
      // exactly as dbo.GetJobFullDetails_Client returns them today. The
      // proc has been updated to emit OriginalETA / RevisedETA /
      // TrackingLink directly (instead of the older
      // DestinationArrivalOriginalPlannedDate / ...PlannedDate / Link),
      // so we read those keys 1:1 from the SP row. Everything else the
      // proc returns (Id, internal Status code, rn, duplicate
      // ContainerNumber, CreatedAt, Shipment_ContainerNumber) is
      // intentionally dropped.
      ContainerNo: pickString(prod.ContainerNo),
      DestinationPort: pickString(shipment.DestinationPort),
      GateInDate: formatDateForExcel(shipment.GateInDate),
      DepartureDate: formatDateForExcel(shipment.DepartureDate),
      OriginalETA: formatDateForExcel(shipment.OriginalETA),
      RevisedETA: formatDateForExcel(shipment.RevisedETA),
      TrackingLink: pickString(shipment.TrackingLink)
    };

    return row;
  }

  function orderSegmentBucket(order) {
    if (!order || typeof order !== 'object') return 'other';
    return getSegmentBucket(order.SegmentName ?? order.segmentname ?? '');
  }

  function pickString(...values) {
    for (const v of values) {
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return '';
  }

  function pickNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }

  // Strip away non-digit suffixes/prefixes and return the leading integer.
  // Used for columns whose SQL value is a label-with-number ("4 F-", "1 F-",
  // etc.) but should appear in Excel as a plain number (4, 1).
  function pickLeadingInt(value) {
    if (value === null || value === undefined || value === '') return '';
    const m = String(value).match(/\d+/);
    if (!m) return '';
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : '';
  }

  function mapSourceToDb(source) {
    const s = String(source || '').trim().toLowerCase();
    if (s === 'db1') return 'KOL';
    if (s === 'db2') return 'AHM';
    return '';
  }

  function formatDateForExcel(value) {
    if (value === null || value === undefined || value === '') return '';
    if (value instanceof Date) return formatSingleDate(value);
    const str = String(value).trim();
    if (!str) return '';
    // dbo.GetJobFullDetails_Client returns pipe-joined dates when a job
    // has multiple containers (e.g. "2026-06-01 00:00:00.000 |
    // 2026-06-15 00:00:00.000"). Split, format each piece, rejoin with
    // " | " to match the separator used elsewhere in the row.
    if (str.includes('|')) {
      return str
        .split('|')
        .map((s) => formatDateForExcel(s.trim()))
        .filter((s) => s !== '')
        .join(' | ');
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return formatSingleDate(d);
  }

  function formatSingleDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  function prettifyKey(key) {
    if (!key) return '';
    return String(key)
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ===================== End Excel Export =====================

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

  // Map the raw SegmentName from portal_orders_list2 into one of three buckets
  // used by image lookup and the Excel-export filter.
  //   - 'commercial' : Commercial / Books / Book  (the only bucket included in exports)
  //   - 'packaging'  : Packaging
  //   - 'other'      : anything else, missing, or unknown (e.g. "Leaflet | Cards")
  const COMMERCIAL_SEGMENTS = new Set(['commercial', 'books', 'book']);
  const PACKAGING_SEGMENTS = new Set(['packaging']);
  function getSegmentBucket(segmentName) {
    const seg = String(segmentName ?? '').trim().toLowerCase();
    if (!seg) return 'other';
    if (COMMERCIAL_SEGMENTS.has(seg)) return 'commercial';
    if (PACKAGING_SEGMENTS.has(seg)) return 'packaging';
    return 'other';
  }

  function resolveImageUrl(rawUrl, segmentName) {
    const defaultByBucket = {
      commercial: '/assets/img/products/default-book.jpeg',
      packaging: '/assets/img/products/default-packaging.jpeg',
      other: '/assets/img/products/default-other.svg'
    };
    const fallback = defaultByBucket[getSegmentBucket(segmentName)] || defaultByBucket.other;
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