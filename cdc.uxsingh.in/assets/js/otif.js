'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const OTIF_SESSION_KEY = 'cdcAuthSession';
  const DEFAULT_RANGE = '1m';
  const DEFAULT_LIMIT = '1000';

  const searchWrapper = '.search-here';
  const placeholder = 'Search OTIF...';

  const state = {
    dateRange: DEFAULT_RANGE,
    customDates: null,
    dataTable: null
  };

  let currentCustomDateTab = null;

  const session = getStoredSession();

  if (!session?.token) {
    showGlobalError('You must sign in before viewing OTIF data.');
    return;
  }

  initDateRangeHandlers();
  initOtifTable();

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(OTIF_SESSION_KEY);
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

  function formatDate(dateString) {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
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

  function getDateRange() {
    const now = new Date();
    let fromDate, toDate;

    if (state.customDates) {
      fromDate = new Date(state.customDates.from);
      toDate = new Date(state.customDates.to);
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
        fromDate.setMonth(fromDate.getMonth() - 1);
      }
      fromDate.setHours(0, 0, 0, 0);
    }

    return { fromDate, toDate };
  }

  function filterOtifByDateRange(otifData) {
    if (!otifData || otifData.length === 0) return otifData;

    const { fromDate, toDate } = getDateRange();
    
    return otifData.filter(item => {
      if (!item.PODate) return false;
      
      try {
        const poDate = new Date(item.PODate);
        return poDate >= fromDate && poDate <= toDate;
      } catch (error) {
        console.warn('Invalid PODate format:', item.PODate);
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
        
        if (tab === 'otif' && range) {
          state.dateRange = range;
          state.customDates = null;
          
          // Update button text
          const btn = dateRangeGroup.querySelector('.date-range-btn');
          if (btn) {
            btn.textContent = getRangeLabel(range);
          }
          
          // Reload DataTable
          if (state.dataTable) {
            state.dataTable.ajax.reload();
          }
        }
      }
    });

    // Handle custom date option click
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('custom-date-option')) {
        currentCustomDateTab = e.target.dataset.tab;
      }
    });

    // Handle custom date form submission
    const applyCustomDateBtn = document.getElementById('applyCustomDateOtif');
    if (applyCustomDateBtn) {
      applyCustomDateBtn.addEventListener('click', function() {
        const startDate = document.getElementById('startDateOtif').value;
        const endDate = document.getElementById('endDateOtif').value;
        
        if (!startDate || !endDate) {
          alert('Please select both start and end dates');
          return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
          alert('Start date must be before end date');
          return;
        }
        
        if (currentCustomDateTab === 'otif') {
          state.customDates = {
            from: startDate,
            to: endDate
          };
          state.dateRange = 'custom';
          
          // Update button text
          const dateRangeGroup = document.querySelector(`.date-range-group[data-tab="otif"]`);
          if (dateRangeGroup) {
            const btn = dateRangeGroup.querySelector('.date-range-btn');
            if (btn) {
              btn.textContent = 'Custom Date';
            }
          }
          
          // Close modal
          const modal = bootstrap.Modal.getInstance(document.getElementById('customDateModalOtif'));
          if (modal) {
            modal.hide();
          }
          
          // Reload DataTable
          if (state.dataTable) {
            state.dataTable.ajax.reload();
          }
        }
      });
    }
  }

  function initOtifTable() {
    const dt_table = document.querySelector('.otif-data');

    if (dt_table) {
      // Destroy existing DataTable if any (keep DOM structure)
      if ($.fn.DataTable.isDataTable(dt_table)) {
        $(dt_table).DataTable().destroy(false);
      }

      // Ensure thead exists with all column headers
      let thead = dt_table.querySelector('thead');
      if (!thead) {
        console.log('Creating thead for OTIF table');
        thead = document.createElement('thead');
        const tr = document.createElement('tr');
        const columnTitles = [
          'Product', 'PO Number', 'PO Date', 'Jobcard No.', 'QTY', 
          'Approval Date', 'Delivered Date', 'Last GPN Date', 
          'Committed Dlv Date', 'Qty Delivered', 'Order Status', 
          'Delay Days', 'Approval To GPN Days'
        ];
        
        columnTitles.forEach(title => {
          const th = document.createElement('th');
          th.textContent = title;
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        dt_table.insertBefore(thead, dt_table.firstChild);
      } else {
        console.log('OTIF table thead already exists with', thead.querySelectorAll('th').length, 'columns');
      }

      // Debug: Log table structure before initialization
      console.log('Initializing OTIF DataTable');
      console.log('Table HTML:', dt_table.outerHTML.substring(0, 500));
      console.log('Has thead:', !!dt_table.querySelector('thead'));
      console.log('Number of th elements:', dt_table.querySelectorAll('thead th').length);

      state.dataTable = new DataTable(dt_table, {
        ajax: {
          url: getApiBase() + '/otif',
          headers: buildAuthHeaders(),
          data: function(d) {
            // Add date range parameters
            if (state.customDates) {
              d.from = state.customDates.from;
              d.to = state.customDates.to;
            } else {
              d.range = state.dateRange || DEFAULT_RANGE;
            }
            d.limit = DEFAULT_LIMIT;
          },
          dataSrc: function(json) {
            if (json && json.items) {
              const filtered = filterOtifByDateRange(json.items);
              return filtered;
            }
            return filterOtifByDateRange(json || []);
          },
          error: function(xhr, error, thrown) {
            console.error('Error loading OTIF data:', error);
            if (xhr.status === 401) {
              showGlobalError('Your session has expired. Please sign out and sign in again.');
            } else {
              alert('Failed to load OTIF data');
            }
          }
        },

        paging: true,
        pageLength: 10,
        lengthChange: false,
        searching: true,
        info: true,
        responsive: false,
        scrollX: false,
        autoWidth: true,

        columns: [
          {
            // PRODUCT - ItemName with image
            data: null,
            className: 'text-start align-middle',
            render: function(data, type, row) {
              const itemName = row.ItemName || 'No Item';
              const imageUrl = resolveImageUrl(row.ImageUrl);
              return `
                <div class="d-flex align-items-center gap-2">
                  <img src="${imageUrl}" alt="${itemName}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" onerror="this.onerror=null;this.src='${resolveImageUrl(null)}';">
                  <span>${itemName}</span>
                </div>
              `;
            }
          },
          {
            // PO NUMBER
            data: 'PONumber',
            className: 'text-center align-middle',
            defaultContent: '-'
          },
          {
            // PO DATE
            data: 'PODate',
            className: 'text-center align-middle',
            defaultContent: '-',
            render: function(data) {
              return formatDate(data);
            }
          },
          {
            // JOBCARD NO.
            data: 'JobCardNumber',
            className: 'text-center align-middle',
            defaultContent: '-'
          },
          {
            // QTY
            data: 'OrderQty',
            className: 'text-center align-middle',
            defaultContent: '-'
          },
          {
            // APPROVAL DATE
            data: 'ApprovalDate',
            className: 'text-center align-middle',
            defaultContent: '-',
            render: function(data) {
              return formatDate(data);
            }
          },
          {
            // DELIVERED DATE
            data: 'LastDeliveryDate',
            className: 'text-center align-middle',
            defaultContent: '-',
            render: function(data) {
              return formatDate(data);
            }
          },
          {
            // LAST GPN DATE
            data: 'LastGpnDate',
            className: 'text-center align-middle',
            defaultContent: '-',
            render: function(data) {
              return formatDate(data);
            }
          },
          {
            // COMMITTED DLV DATE
            data: 'CommittedDeliveryDate',
            className: 'text-center align-middle',
            defaultContent: '-',
            render: function(data) {
              return formatDate(data);
            }
          },
          {
            // QTY DELIVERED
            data: 'QtyDelivered',
            className: 'text-center align-middle',
            defaultContent: '-'
          },
          {
            // ORDER STATUS
            data: 'OrderStatus',
            className: 'text-center align-middle',
            defaultContent: '-',
            render: function(data) {
              if (!data) return '-';
              let statusClass = 'bg-label-warning';
              if (data.toLowerCase() === 'closed' || data.toLowerCase() === 'completed') {
                statusClass = 'bg-label-success';
              } else if (data.toLowerCase() === 'cancelled') {
                statusClass = 'bg-label-danger';
              }
              return `<span class="badge ${statusClass}">${data}</span>`;
            }
          },
          {
            // DELAY DAYS (if negative then 0)
            data: 'DelayDays',
            className: 'text-center align-middle',
            defaultContent: '-',
            render: function(data) {
              if (data === null || data === undefined) return '-';
              const value = typeof data === 'number' ? data : parseInt(data);
              const displayValue = value < 0 ? 0 : value;
              return displayValue;
            }
          },
          {
            // APPROVAL TO GPN DAYS (if negative then 0)
            data: 'ApprovalToGpnDays',
            className: 'text-center align-middle',
            defaultContent: '-',
            render: function(data) {
              if (data === null || data === undefined) return '-';
              const value = typeof data === 'number' ? data : parseInt(data);
              const displayValue = value < 0 ? 0 : value;
              return displayValue;
            }
          }
        ],

        columnDefs: [
          { targets: '_all', orderable: true }
        ],

        dom: '<"dt-custom-search-otif"f>rt<"bottom-otif"lip>',
        
        drawCallback: function() {
          // Table drawn successfully
          console.log('Table drawn, checking headers');
          console.log('thead visible:', $('.otif-data thead').is(':visible'));
          console.log('thead length:', $('.otif-data thead').length);
          console.log('th count:', $('.otif-data thead th').length);
        },

        initComplete: function() {
          console.log('DataTable initialized successfully');
          console.log('thead visible:', $('.otif-data thead').is(':visible'));
          console.log('thead display:', $('.otif-data thead').css('display'));
          console.log('th elements:', $('.otif-data thead th').length);
          
          // Move search input to custom container
          $('.dt-custom-search-otif').appendTo(searchWrapper);

          // Remove default label text
          $(searchWrapper + ' label').contents().filter(function() {
            return this.nodeType === 3;
          }).remove();

          $(searchWrapper + ' label').hide();

          // Style the search input
          const $input =           $(searchWrapper + ' input[type="search"]');
          $input.attr('placeholder', placeholder);
          $input.addClass('form-control');
          $input.wrap('<div class="input-group"></div>');
          $input.before(`<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg></span>`);
        },

        order: [[2, 'asc']], // Sort by PO Date by default

        language: {
          paginate: {
            next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
            previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
            first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
            last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
          }
        }
      });

      // Move pagination to custom container
      state.dataTable.on('draw', function() {
        const paginateElement = document.querySelector('.bottom-otif');
        const customPaginationContainer = document.querySelector('.custom-table-pagination-layout-otif');

        if (paginateElement && customPaginationContainer) {
          customPaginationContainer.appendChild(paginateElement);
        }
      });
    }

    // Layout fixes
    setTimeout(() => {
      const elementsToModify = [
        { selector: '.dt-layout-start', classToAdd: 'my-0' },
        { selector: '.dt-layout-end', classToAdd: 'my-0' },
        { selector: '.dt-layout-table', classToRemove: 'row mt-2', classToAdd: 'mt-n2' },
        { selector: '.dt-layout-full', classToRemove: 'col-md col-12', classToAdd: 'table-responsive' }
      ];

      elementsToModify.forEach(({ selector, classToRemove, classToAdd }) => {
        document.querySelectorAll(selector).forEach(element => {
          if (classToRemove) {
            classToRemove.split(' ').forEach(className => element.classList.remove(className));
          }
          if (classToAdd) {
            classToAdd.split(' ').forEach(className => element.classList.add(className));
          }
        });
      });
    }, 100);
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
