'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const DISPATCHES_SESSION_KEY = 'cdcAuthSession';
  const DEFAULT_RANGE = '90d';
  const DEFAULT_LIMIT = '1000'; // Fetch more items for pagination
  const ITEMS_PER_PAGE = 10;

  const containerId = 'dispatches-container';
  const searchWrapper = '.search-here';
  const placeholder = 'Search dispatches...';
  const emptyMessage = 'No dispatches found.';
  const searchEmptyMessage = 'No dispatches match your search.';

  const state = {
    dispatches: [],
    filteredDispatches: [],
    searchInput: null,
    dateRange: DEFAULT_RANGE,
    customDates: null,
    nextCursor: null,
    currentPage: 1
  };

  let currentCustomDateTab = null;

  const session = getStoredSession();

  if (!session?.token) {
    showGlobalError('You must sign in before viewing dispatches.');
    return;
  }

  initSearchInput();
  initDateRangeHandlers();

  // Load dispatches
  loadDispatches();

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(DISPATCHES_SESSION_KEY);
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

  async function loadDispatches() {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div class="col-12 text-center"><p>Loading...</p></div>';

    try {
      // Reset cursor when loading with new date range
      state.nextCursor = null;
      console.log('[DISPATCHES] Loading dispatches with state:', {
        dateRange: state.dateRange,
        customDates: state.customDates,
        defaultRange: DEFAULT_RANGE
      });
      
      const dispatches = await fetchDispatches();
      console.log('[DISPATCHES] Loaded dispatches:', {
        count: dispatches.length,
        dateRange: state.dateRange,
        sampleDates: dispatches.slice(0, 5).map(d => ({
          DispatchDate: d.DispatchDate,
          dateObj: d.DispatchDate ? new Date(d.DispatchDate) : null
        }))
      });
      
      state.dispatches = dispatches;
      state.filteredDispatches = dispatches; // Initialize filtered dispatches
      state.currentPage = 1; // Reset to page 1
      applySearchFilter();
    } catch (error) {
      console.error('[DISPATCHES] Error loading dispatches:', error);
      container.innerHTML = `<div class="col-12 text-center"><p class="text-danger">${error.userMessage || 'Failed to load dispatches.'}</p></div>`;
    }
  }

  async function fetchDispatches() {
    const apiBase = getApiBase();
    const dateRange = state.dateRange || DEFAULT_RANGE;
    
    console.log('[DISPATCHES] Date filter state:', {
      dateRange,
      customDates: state.customDates,
      defaultRange: DEFAULT_RANGE
    });
    
    let url = `${apiBase}/dispatches?limit=${encodeURIComponent(DEFAULT_LIMIT)}`;
    
    if (state.customDates) {
      // Custom date range - backend supports from/to parameters
      url += `&from=${encodeURIComponent(state.customDates.from)}&to=${encodeURIComponent(state.customDates.to)}`;
      console.log('[DISPATCHES] Using custom date range:', {
        from: state.customDates.from,
        to: state.customDates.to,
        fromDate: new Date(state.customDates.from),
        toDate: new Date(state.customDates.to)
      });
    } else {
      // Predefined range (1m, 3m, 1y, etc.)
      url += `&range=${encodeURIComponent(dateRange)}`;
      console.log('[DISPATCHES] Using predefined range:', dateRange);
    }

    if (state.nextCursor) {
      url += `&cursor=${encodeURIComponent(state.nextCursor)}`;
      console.log('[DISPATCHES] Using cursor for pagination');
    }

    console.log('[DISPATCHES] Fetching from URL:', url);

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
      console.error('[DISPATCHES] API error:', response.status, body);
      throw userFacingError(body?.error || 'Unable to load dispatches.');
    }

    const body = await response.json();
    console.log('[DISPATCHES] API response:', {
      itemCount: body?.items?.length || 0,
      hasNextCursor: !!body?.nextCursor,
      firstItem: body?.items?.[0] ? {
        DispatchDate: body.items[0].DispatchDate,
        PODate: body.items[0].PODate,
        JobNum: body.items[0].JobNum,
        DispatchId: body.items[0].DispatchId
      } : null,
      allDispatchDates: body?.items?.map(item => ({
        DispatchDate: item.DispatchDate,
        formatted: item.DispatchDate ? new Date(item.DispatchDate).toISOString() : null
      })) || []
    });
    
    state.nextCursor = body?.nextCursor || null;
    return body?.items || [];
  }

  function renderDispatchCards(dispatches, container, emptyMessage) {
    if (!container) return;

    if (!dispatches || dispatches.length === 0) {
      container.innerHTML = `<div class="col-12 text-center"><p>${emptyMessage || 'No dispatches found.'}</p></div>`;
      return;
    }

    container.innerHTML = '';

    dispatches.forEach(dispatch => {
      const card = createDispatchCard(dispatch);
      container.appendChild(card);
    });
  }

  function createDispatchCard(dispatch) {
    const col = document.createElement('div');
    col.className = 'col-12';

    const dispatchDate = formatDate(dispatch.DispatchDate);
    const poDate = formatDate(dispatch.PODate);
    const imageUrl = resolveImageUrl(dispatch.ImageUrl);
    const item = dispatch.Item || 'No Item';
    const jobNum = dispatch.JobNum || '-';
    const qtyDispatched = dispatch.QtyDispatched || '0';
    const dispatchId = dispatch.DispatchId || '-';

    col.innerHTML = `
      <div class="card">
        <div class="card-body p-4">
          <div class="row align-items-start">
            <!-- Product Image -->
            <div class="col-auto">
              <img src="${imageUrl}" alt="Product" class="rounded" style="width: 100px; height: 100px; object-fit: cover;" onerror="this.onerror=null;this.src='${resolveImageUrl(null)}';">
            </div>
            
            <!-- Dispatch Details -->
            <div class="col">
              <div class="row">
                <div class="col-12 col-md-8">
                  <h5 class="mb-1">Job Num: ${jobNum}</h5>
                  <p class="text-muted mb-2">${item}</p>
                  <p class="mb-0"><strong>Dispatch Date:</strong> ${dispatchDate}</p>
                </div>
                <div class="col-12 col-md-4 text-md-end">
                  <p class="text-muted mb-1">PO Date: ${poDate}</p>
                  <p class="mb-0"><strong>Dispatch ID: #${dispatchId}</strong></p>
                </div>
              </div>
              
              <!-- Dispatch Stats -->
              <div class="row mt-3 align-items-center">
                <div class="col-auto">
                  <p class="mb-0"><strong>Qty Dispatched:</strong> ${qtyDispatched}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    return col;
  }

  function initSearchInput() {
    const wrapper = document.querySelector(searchWrapper);
    if (!wrapper) return;

    wrapper.innerHTML = buildSearchInputMarkup(placeholder);

    const input = wrapper.querySelector('input[type="search"]');
    if (!input) return;

    state.searchInput = input;
    input.addEventListener('input', () => applySearchFilter());
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

  function applySearchFilter() {
    const container = document.getElementById(containerId);
    if (!container || !state) return;

    const query = state.searchInput ? state.searchInput.value.trim().toLowerCase() : '';
    const source = Array.isArray(state.dispatches) ? state.dispatches : [];

    const filtered = query
      ? source.filter(dispatch => matchesSearch(dispatch, query))
      : source;

    // Update filtered dispatches and reset to page 1
    state.filteredDispatches = filtered;
    state.currentPage = 1;

    renderDispatchesWithPagination();
  }

  function renderDispatchesWithPagination() {
    const container = document.getElementById(containerId);
    if (!container || !state) return;

    const filtered = state.filteredDispatches || [];
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(state.currentPage || 1, totalPages || 1));

    // Get items for current page
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = filtered.slice(startIndex, endIndex);

    const query = state.searchInput ? state.searchInput.value.trim().toLowerCase() : '';
    const emptyMsg = query
      ? searchEmptyMessage || emptyMessage || 'No matching records found.'
      : emptyMessage || 'No records found.';

    renderDispatchCards(pageItems, container, emptyMsg);
    renderPagination(currentPage, totalPages, totalItems);
  }

  function renderPagination(currentPage, totalPages, totalItems) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Find or create pagination container
    let paginationContainer = container.parentElement?.querySelector('.pagination-container');
    if (!paginationContainer) {
      paginationContainer = document.createElement('div');
      paginationContainer.className = 'pagination-container mt-4';
      container.parentElement?.appendChild(paginationContainer);
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
          state.currentPage = page;
          renderDispatchesWithPagination();
          // Scroll to top of container
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function matchesSearch(dispatch, query) {
    if (!query) return true;
    if (!dispatch || typeof dispatch !== 'object') return false;

    const searchableFields = [
      dispatch.Item,
      dispatch.JobNum,
      dispatch.DispatchId,
      dispatch.PONumber,
      dispatch.VoucherNumber,
      dispatch.DispatchDate,
      dispatch.PODate,
      dispatch.QtyDispatched
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
          state.dateRange = range;
          state.customDates = null; // Clear custom dates
          
          // Update button text
          const btn = dateRangeGroup.querySelector('.date-range-btn');
          if (btn) {
            btn.textContent = getRangeLabel(range);
          }
          
          // Reload dispatches
          loadDispatches();
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
    const applyCustomDateBtn = document.getElementById('applyCustomDateDispatches');
    if (applyCustomDateBtn) {
      applyCustomDateBtn.addEventListener('click', function() {
        const startDate = document.getElementById('startDateDispatches').value;
        const endDate = document.getElementById('endDateDispatches').value;
        
        if (!startDate || !endDate) {
          alert('Please select both start and end dates');
          return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
          alert('Start date must be before end date');
          return;
        }
        
        if (currentCustomDateTab) {
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
          const modal = bootstrap.Modal.getInstance(document.getElementById('customDateModalDispatches'));
          if (modal) {
            modal.hide();
          }
          
          // Reload dispatches
          loadDispatches();
        }
      });
    }
  }

  function buildAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
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
