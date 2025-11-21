'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const ORDERS_SESSION_KEY = 'cdcAuthSession';
  const DEFAULT_RANGE = '1m';
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
    all: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [] },
    pending: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [] },
    completed: { orders: [], searchInput: null, dateRange: DEFAULT_RANGE, customDates: null, currentPage: 1, filteredOrders: [] }
  };

  let currentCustomDateTab = null;

  const session = getStoredSession();

  if (!session?.token) {
    showGlobalError('You must sign in before viewing orders.');
    return;
  }

  initSearchInputs();
  initDateRangeHandlers();

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
      : 'https://cdcapi.onrender.com/api';
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
      tabState[tab].filteredOrders = filteredOrders; // Initialize filtered orders
      tabState[tab].currentPage = 1; // Reset to page 1
      applySearchFilter(tab);
    } catch (error) {
      console.error('Error loading orders:', error);
      container.innerHTML = `<div class="col-12 text-center"><p class="text-danger">${error.userMessage || 'Failed to load orders.'}</p></div>`;
    }
  }

  async function loadOrders(tab) {
    const apiBase = getApiBase();
    const state = tabState[tab];
    const dateRange = state.dateRange || DEFAULT_RANGE;
    
    let url = `${apiBase}/orders?tab=${encodeURIComponent(tab)}&limit=${encodeURIComponent(DEFAULT_LIMIT)}`;
    
    if (state.customDates) {
      // Custom date range
      url += `&from=${encodeURIComponent(state.customDates.from)}&to=${encodeURIComponent(state.customDates.to)}`;
    } else {
      // Predefined range
      url += `&range=${encodeURIComponent(dateRange)}`;
    }

    const response = await fetch(url, {
      headers: buildAuthHeaders()
    });

    if (response.status === 401) {
      throw userFacingError(
        'Your session has expired. Please sign out and sign in again.'
      );
    }

    if (!response.ok) {
      const body = await safeJson(response);
      throw userFacingError(body?.error || 'Unable to load orders.');
    }

    const body = await response.json();
    return body?.items || [];
  }

  function renderOrderCards(orders, container, emptyMessage) {
    if (!container) return;

    if (!orders || orders.length === 0) {
      container.innerHTML = `<div class="col-12 text-center"><p>${emptyMessage || 'No orders found.'}</p></div>`;
      return;
    }

    container.innerHTML = '';

    orders.forEach(order => {
      const card = createOrderCard(order);
      container.appendChild(card);
    });
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
              <img src="${imageUrl}" alt="Product" class="rounded" style="width: 100px; height: 100px; object-fit: cover;" onerror="this.onerror=null;this.src='${resolveImageUrl(null)}';">
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
      input.addEventListener('input', () => applySearchFilter(tab));
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

    const query = state.searchInput ? state.searchInput.value.trim().toLowerCase() : '';
    const source = Array.isArray(state.orders) ? state.orders : [];

    const filtered = query
      ? source.filter(order => matchesSearch(order, query))
      : source;

    // Update filtered orders and reset to page 1
    state.filteredOrders = filtered;
    state.currentPage = 1;

    renderOrdersWithPagination(tab);
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

    const query = state.searchInput ? state.searchInput.value.trim().toLowerCase() : '';
    const emptyMessage = query
      ? config.searchEmptyMessage || config.emptyMessage || 'No matching records found.'
      : config.emptyMessage || 'No records found.';

    renderOrderCards(pageItems, config.container, emptyMessage);
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
      '1m': 'Last Month',
      '3m': 'Last Quarter',
      '1y': 'Last Year',
      'custom': 'Custom Date'
    };
    return labels[range] || 'Last Month';
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
      if (range === '1m') {
        fromDate.setMonth(fromDate.getMonth() - 1);
      } else if (range === '3m') {
        fromDate.setMonth(fromDate.getMonth() - 3);
      } else if (range === '1y') {
        fromDate.setFullYear(fromDate.getFullYear() - 1);
      } else {
        // Default to last month
        fromDate.setMonth(fromDate.getMonth() - 1);
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
      modalContent.innerHTML = '<tr><td colspan="7" class="text-center">No process data available</td></tr>';
    } else {
      let rows = '';
      processes.forEach(p => {
        const processName = p.ProcessName || '-';
        const completionPct = p.CompletionPct !== undefined && p.CompletionPct !== null ? `${p.CompletionPct}%` : '-';
        const processStatus = p.ProcessStatus || '-';
        const planDate = formatDate(p.PlanDate);
        const actualDate = formatDate(p.ActualDate);
        const planQty = p.PlanQty || '-';
        const actualQty = p.ActualQty || '-';
        
        rows += `<tr>
          <td>${processName}</td>
          <td>${completionPct}</td>
          <td>${processStatus}</td>
          <td>${planDate}</td>
          <td>${actualDate}</td>
          <td>${planQty}</td>
          <td>${actualQty}</td>
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
