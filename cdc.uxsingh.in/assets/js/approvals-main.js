/**
 *  Approvals Screen
 */

'use strict';

document.addEventListener('DOMContentLoaded', function (e) {
  const APPROVALS_SESSION_KEY = 'cdcAuthSession';

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(APPROVALS_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  const session = getStoredSession();

  if (!session?.token) {
    showGlobalError('You must sign in before viewing approvals.');
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

  // Date range state management
  const DEFAULT_RANGE = '90d';
  const tabState = {
    all: { dateRange: DEFAULT_RANGE, customDates: null, dataTable: null },
    pending_files: { dateRange: DEFAULT_RANGE, customDates: null, dataTable: null },
    pending_approval: { dateRange: DEFAULT_RANGE, customDates: null, dataTable: null }
  };

  let currentCustomDateTab = null;

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

  // Date filtering is now handled by SQL procedure - no client-side filtering needed

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
          
          // Reload DataTable
          if (state.dataTable) {
            state.dataTable.ajax.reload();
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
    const applyCustomDateBtn = document.getElementById('applyCustomDateApprovals');
    if (applyCustomDateBtn) {
      applyCustomDateBtn.addEventListener('click', function() {
        const startDate = document.getElementById('startDateApprovals').value;
        const endDate = document.getElementById('endDateApprovals').value;
        
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
          const modal = bootstrap.Modal.getInstance(document.getElementById('customDateModalApprovals'));
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

  // Initialize date range handlers
  initDateRangeHandlers();

  // DataTable (js)
  // --------------------------------------------------------------------
  const dt_dashboard_table = document.querySelector('.all-approvals');

  // On PO Table
  if (dt_dashboard_table) {
    var dt_dashboard = new DataTable(dt_dashboard_table, {
      ajax: {
        url: getApiBase() + '/approvals?tab=all',
        headers: buildAuthHeaders(),
        data: function(d) {
          // Add date range parameters
          const state = tabState.all;
          if (state.customDates) {
            d.from = state.customDates.from;
            d.to = state.customDates.to;
          } else {
            d.range = state.dateRange || DEFAULT_RANGE;
          }
        },
        dataSrc: function(json) {
          // Return items directly - date filtering is done in backend
          if (json && json.items) {
            return json.items;
          }
          return json || [];
        },
        error: function(xhr, error, thrown) {
          console.error('Error loading approvals:', error);
          if (xhr.status === 401) {
            showGlobalError('Your session has expired. Please sign out and sign in again.');
          } else {
            alert('Failed to load approvals data');
          }
        }
      },

            // dom: '<"top">rt<"bottom"i p><"clear">',

            paging: true,
            pageLength: 10,         // Show 10 items per page
            lengthChange: false,    // Hide "Show X entries" dropdown
            searching: true,
            info: true,
            responsive: false,
            scrollX: true,

            columns: [
                { data: 'PONumber', defaultContent: '-' },
                { data: 'PODate', defaultContent: '-', render: function(data) {
                  if (!data) return '-';
                  try {
                    const date = new Date(data);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = date.toLocaleString('en-US', { month: 'short' });
                    const year = date.getFullYear();
                    return `${day} ${month} ${year}`;
                  } catch {
                    return data || '-';
                  }
                }},
                { data: 'Item', defaultContent: '-' },
                { data: 'OrderQty', defaultContent: '-' },
                { data: 'FileStatus', defaultContent: '-' },
                { data: 'ApprovalStatus', defaultContent: '-' },
                { data: 'ApprovalLink', defaultContent: '-' }
            ],
            dom: '<"dt-custom-search-vehicles"f>rt<"bottom-all"lip>',
            // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
            initComplete: function() {
              tabState.all.dataTable = dt_dashboard;
              // Move search input to your custom container
              $('.dt-custom-search-vehicles').appendTo('.search-here');

                // Remove the default label wrapper text
                $('.search-here label').contents().filter(function () {
                    return this.nodeType === 3; // remove label text node
                }).remove();

                $('.search-here label').hide();

                // Target the input
                const $input = $('.search-here input[type="search"]');

                // Add placeholder
                $input.attr('placeholder', 'Search...');

                // Optional: Add Bootstrap class for styling
                $input.addClass('form-control');

                // Wrap input with icon (Bootstrap 5 input group)
                $input.wrap('<div class="input-group"></div>');
                $input.before(`<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg></span>`);
            },

            columnDefs: [
                {
                    // File Status Badge
                    targets: 4,
                    render: (data) => {
                        if (!data) return '-';
                        const statusMap = {
                            'Completed': 'success',
                            'Pending': 'warning',
                            'Rejected': 'danger',
                            'Complete': 'success',
                            'Received': 'info'
                        };
                        const badgeClass = statusMap[data] || 'secondary';
                        return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                    }
                },
                {
                    // Approval Status Badge
                    targets: 5,
                    render: (data) => {
                        if (!data) return '-';
                        const statusMap = {
                            'Completed': 'success',
                            'Pending': 'warning',
                            'Rejected': 'danger',
                            'Complete': 'success',
                            'Received': 'info'
                        };
                        const badgeClass = statusMap[data] || 'secondary';
                        return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                    }
                },
                {
                    // Approval Link Button
                    targets: 6,
                    render: (data) => {
                        if (!data || data === '-' || data === 'NA' || data === 'na') return '-';
                        return `<a href="${data}" class="" target="_blank" style="text-decoration: underline;">${data}</a>`;
                    }
                }
            ],
            order: [[1, 'asc']],
            // lengthMenu removed - using fixed pageLength: 10
            language: {
                paginate: {
                    next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
                    previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
                    first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
                    last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
                }
            },
            // responsive: {
            //     details: {
            //         display: DataTable.Responsive.display.modal({
            //             header: function (row) {
            //                 const data = row.data();
            //                 return 'Details of ' + data['po_details'];
            //             }
            //         }),
            //         type: 'column',
            //         renderer: function (api, rowIdx, columns) {
            //             const data = columns
            //                 .map(col => col.title !== ''
            //                     ? `<tr data-dt-row="${col.rowIndex}" data-dt-column="${col.columnIndex}">
            //       <td>${col.title}:</td>
            //       <td>${col.data}</td>
            //     </tr>` : '')
            //                 .join('');

            //             if (data) {
            //                 const table = document.createElement('table');
            //                 table.classList.add('table', 'datatables-basic', 'mb-2');
            //                 const tbody = document.createElement('tbody');
            //                 tbody.innerHTML = data;
            //                 table.appendChild(tbody);
            //                 return table;
            //             }
            //             return false;
            //         }
            //     }
            // }
        });
        // Move the pagination controls to the custom container

        // Wait for the DataTable to initialize, then move pagination
        dt_dashboard.on('draw', function () {
            console.log("last");
            var paginateElement = document.querySelector('.bottom-all');
            var customPaginationContainer = document.querySelector('.custom-table-pagination-layout');

            if (paginateElement && customPaginationContainer) {
                // Move pagination to the custom container
                customPaginationContainer.appendChild(paginateElement);
            }
        });
    }

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

    // approvals pending files code here ...

    // DataTable (js)
    // --------------------------------------------------------------------
    function initPendingFilesTable() {
        const dt_dashboard_table_pf = document.querySelector('.all-approvals-pending-files');

        // On PO Table
        if (dt_dashboard_table_pf) {

            if (dt_dashboard_table_pf) {
                // Destroy if already initialized
                if ($.fn.DataTable.isDataTable(dt_dashboard_table_pf)) {
                    $(dt_dashboard_table_pf).DataTable().destroy();
                }
                var dt_dashboard = new DataTable(dt_dashboard_table_pf, {
                    ajax: {
                        url: getApiBase() + '/approvals?tab=pending_files',
                        headers: buildAuthHeaders(),
                        data: function(d) {
                          // Add date range parameters
                          const state = tabState.pending_files;
                          if (state.customDates) {
                            d.from = state.customDates.from;
                            d.to = state.customDates.to;
                          } else {
                            d.range = state.dateRange || DEFAULT_RANGE;
                          }
                        },
                        dataSrc: function(json) {
                          // Return items directly - date filtering is done in backend
                          if (json && json.items) {
                            return json.items;
                          }
                          return json || [];
                        },
                        error: function(xhr, error, thrown) {
                          console.error('Error loading pending files:', error);
                          if (xhr.status === 401) {
                            showGlobalError('Your session has expired. Please sign out and sign in again.');
                          } else {
                            alert('Failed to load pending files data');
                          }
                        }
                    },

                    // dom: '<"top">rt<"bottom"i p><"clear">',

                    paging: true,
                    pageLength: 10,         // Show 10 items per page
                    lengthChange: false,    // Hide "Show X entries" dropdown
                    searching: true,
                    info: true,
                    responsive: false,
                    scrollX: true,

                    columns: [
                        { data: 'PONumber', defaultContent: '-' },
                        { data: 'PODate', defaultContent: '-', render: function(data) {
                          if (!data) return '-';
                          try {
                            const date = new Date(data);
                            const day = String(date.getDate()).padStart(2, '0');
                            const month = date.toLocaleString('en-US', { month: 'short' });
                            const year = date.getFullYear();
                            return `${day} ${month} ${year}`;
                          } catch {
                            return data || '-';
                          }
                        }},
                        { data: 'Item', defaultContent: '-' },
                        { data: 'OrderQty', defaultContent: '-' },
                        { data: 'FileStatus', defaultContent: '-' }
                    ],
                    dom: '<"dt-custom-search-vehicles-pf"f>rt<"bottom-pf"lip>',
                    // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
                    initComplete: function() {
                      tabState.pending_files.dataTable = dt_dashboard;
                      // Move search input to your custom container
                      $('.dt-custom-search-vehicles-pf').appendTo('.search-here-pf');

                        // Remove the default label wrapper text
                        $('.search-here-pf label').contents().filter(function () {
                            return this.nodeType === 3; // remove label text node
                        }).remove();

                        $('.search-here-pf label').hide();

                        // Target the input
                        const $input = $('.search-here-pf input[type="search"]');

                        // Add placeholder
                        $input.attr('placeholder', 'Search...');

                        // Optional: Add Bootstrap class for styling
                        $input.addClass('form-control');

                        // Wrap input with icon (Bootstrap 5 input group)
                        $input.wrap('<div class="input-group"></div>');
                        $input.before(`<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg></span>`);
                    },

                    columnDefs: [
                        {
                            // File Status Badge
                            targets: 4,
                            render: (data) => {
                                if (!data) return '-';
                                const statusMap = {
                                    'Completed': 'success',
                                    'Pending': 'warning',
                                    'Rejected': 'danger',
                                    'Complete': 'success',
                                    'Received': 'info'
                                };
                                const badgeClass = statusMap[data] || 'secondary';
                                return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                            }
                        }
                    ],
                    order: [[1, 'asc']],
                    // lengthMenu removed - using fixed pageLength: 10
                    language: {
                        paginate: {
                            next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
                            previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
                            first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
                            last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
                        }
                    },
                //     responsive: {
                //         details: {
                //             display: DataTable.Responsive.display.modal({
                //                 header: function (row) {
                //                     const data = row.data();
                //                     return 'Details of ' + data['po_details'];
                //                 }
                //             }),
                //             type: 'column',
                //             renderer: function (api, rowIdx, columns) {
                //                 const data = columns
                //                     .map(col => col.title !== ''
                //                         ? `<tr data-dt-row="${col.rowIndex}" data-dt-column="${col.columnIndex}">
                //   <td>${col.title}:</td>
                //   <td>${col.data}</td>
                // </tr>` : '')
                //                     .join('');

                //                 if (data) {
                //                     const table = document.createElement('table');
                //                     table.classList.add('table', 'datatables-basic', 'mb-2');
                //                     const tbody = document.createElement('tbody');
                //                     tbody.innerHTML = data;
                //                     table.appendChild(tbody);
                //                     return table;
                //                 }
                //                 return false;
                //             }
                //         }
                //     }
                });
                // Move the pagination controls to the custom container

                // Wait for the DataTable to initialize, then move pagination
                dt_dashboard.on('draw', function () {
                    console.log("last");
                    var paginateElement = document.querySelector('.bottom-pf');
                    var customPaginationContainer = document.querySelector('.custom-table-pagination-layout-two');

                    if (paginateElement && customPaginationContainer) {
                        // Move pagination to the custom container
                        customPaginationContainer.appendChild(paginateElement);
                    }
                });
            }

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
    }

    initPendingFilesTable();

    // document.querySelector('#profile-tab').addEventListener('shown.bs.tab', function () {
    //     initPendingFilesTable();
    //     console.log("run");
    // });

    document.querySelector('#profile-tab').addEventListener('shown.bs.tab', function () {
        console.log("Tab shown");

        if (!$.fn.DataTable.isDataTable('.all-approvals-pending-files')) {
            $('.all-approvals-pending-files').DataTable({
                responsive: true,
                pageLength: 10
            });
        } else {
            $('.all-approvals-pending-files').DataTable().columns.adjust().draw();
        }
    });



    // approvals pending approval code here ...

    // DataTable (js)
    // --------------------------------------------------------------------
    function initPendingApprovalsTable() {
        const dt_dashboard_table_pa = document.querySelector('.all-approvals-pending-approvals');

        // On PO Table
        if (dt_dashboard_table_pa) {
            var dt_dashboard = new DataTable(dt_dashboard_table_pa, {
                ajax: {
                    url: getApiBase() + '/approvals?tab=pending_approval',
                    headers: buildAuthHeaders(),
                    data: function(d) {
                      // Add date range parameters
                      const state = tabState.pending_approval;
                      if (state.customDates) {
                        d.from = state.customDates.from;
                        d.to = state.customDates.to;
                      } else {
                        d.range = state.dateRange || DEFAULT_RANGE;
                      }
                    },
                    dataSrc: function(json) {
                      // Return items directly - date filtering is done in backend
                      if (json && json.items) {
                        return json.items;
                      }
                      return json || [];
                    },
                    error: function(xhr, error, thrown) {
                      console.error('Error loading pending approvals:', error);
                      if (xhr.status === 401) {
                        showGlobalError('Your session has expired. Please sign out and sign in again.');
                      } else {
                        alert('Failed to load pending approvals data');
                      }
                    }
                },

                // dom: '<"top">rt<"bottom"i p><"clear">',

                paging: true,
                pageLength: 10,         // Show 10 items per page
                lengthChange: false,    // Hide "Show X entries" dropdown
                searching: true,
                info: true,
                responsive: false,
                scrollX: true,

                columns: [
                    { data: 'PONumber', defaultContent: '-' },
                    { data: 'PODate', defaultContent: '-', render: function(data) {
                      if (!data) return '-';
                      try {
                        const date = new Date(data);
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = date.toLocaleString('en-US', { month: 'short' });
                        const year = date.getFullYear();
                        return `${day} ${month} ${year}`;
                      } catch {
                        return data || '-';
                      }
                    }},
                    { data: 'Item', defaultContent: '-' },
                    { data: 'OrderQty', defaultContent: '-' },
                    { data: 'FileStatus', defaultContent: '-' },
                    { data: 'ApprovalStatus', defaultContent: '-' },
                    { data: 'ApprovalLink', defaultContent: '-' }
                ],
                dom: '<"dt-custom-search-vehicles-pa"f>rt<"bottom-pa"lip>',
                // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
                initComplete: function() {
                  tabState.pending_approval.dataTable = dt_dashboard;
                  // Move search input to your custom container
                  $('.dt-custom-search-vehicles-pa').appendTo('.search-here-pa');

                    // Remove the default label wrapper text
                    $('.search-here-pa label').contents().filter(function () {
                        return this.nodeType === 3; // remove label text node
                    }).remove();

                    $('.search-here-pa label').hide();

                    // Target the input
                    const $input = $('.search-here-pa input[type="search"]');

                    // Add placeholder
                    $input.attr('placeholder', 'Search...');

                    // Optional: Add Bootstrap class for styling
                    $input.addClass('form-control');

                    // Wrap input with icon (Bootstrap 5 input group)
                    $input.wrap('<div class="input-group"></div>');
                    $input.before(`<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg></span>`);
                },

                columnDefs: [
                    // {
                    //     // For Responsive control
                    //     className: 'control',
                    //     orderable: false,
                    //     searchable: false,
                    //     responsivePriority: 1,
                    //     targets: 0,
                    //     render: () => ''
                    // },
                {
                    // File Status Badge
                    targets: 4,
                    render: (data) => {
                        if (!data) return '-';
                        const statusMap = {
                            'Completed': 'success',
                            'Pending': 'warning',
                            'Rejected': 'danger',
                            'Complete': 'success',
                            'Received': 'info'
                        };
                        const badgeClass = statusMap[data] || 'secondary';
                        return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                    }
                },
                {
                    // Approval Status Badge
                    targets: 5,
                    render: (data) => {
                        if (!data) return '-';
                        const statusMap = {
                            'Completed': 'success',
                            'Pending': 'warning',
                            'Rejected': 'danger',
                            'Complete': 'success',
                            'Received': 'info'
                        };
                        const badgeClass = statusMap[data] || 'secondary';
                        return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                    }
                },
                {
                    // Approval Link Button
                    targets: 6,
                    render: (data) => {
                        if (!data || data === '-' || data === 'NA' || data === 'na') return '-';
                        return `<a href="${data}" class="" target="_blank" style="text-decoration: underline;">${data}</a>`;
                    }
                }
                ],
                order: [[1, 'asc']],
                // lengthMenu removed - using fixed pageLength: 10
                language: {
                    paginate: {
                        next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
                        previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
                        first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
                        last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
                    }
                },
                // responsive: {
                //     details: {
                //         display: DataTable.Responsive.display.modal({
                //             header: function (row) {
                //                 const data = row.data();
                //                 return 'Details of ' + data['po_details'];
                //             }
                //         }),
                //         type: 'column',
                //         renderer: function (api, rowIdx, columns) {
                //             const data = columns
                //                 .map(col => col.title !== ''
                //                     ? `<tr data-dt-row="${col.rowIndex}" data-dt-column="${col.columnIndex}">
                //   <td>${col.title}:</td>
                //   <td>${col.data}</td>
                // </tr>` : '')
                //                 .join('');

                //             if (data) {
                //                 const table = document.createElement('table');
                //                 table.classList.add('table', 'datatables-basic', 'mb-2');
                //                 const tbody = document.createElement('tbody');
                //                 tbody.innerHTML = data;
                //                 table.appendChild(tbody);
                //                 return table;
                //             }
                //             return false;
                //         }
                //     }
                // }
            });
            // Move the pagination controls to the custom container

            // Wait for the DataTable to initialize, then move pagination
            dt_dashboard.on('draw', function () {
                console.log("last");
                var paginateElement = document.querySelector('.bottom-pa');
                var customPaginationContainer = document.querySelector('.custom-table-pagination-layout-three');

                if (paginateElement && customPaginationContainer) {
                    // Move pagination to the custom container
                    customPaginationContainer.appendChild(paginateElement);
                }
            });
        }

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

    initPendingApprovalsTable();

    // document.querySelector('#contact-tab').addEventListener('shown.bs.tab', function () {
    //     initPendingApprovalsTable();
    //     console.log("run2");
    // });

    document.querySelector('#contact-tab').addEventListener('shown.bs.tab', function () {
        console.log("Tab shown");

        if (!$.fn.DataTable.isDataTable('.all-approvals-pending-approvals')) {
            $('.all-approvals-pending-approvals').DataTable({
                responsive: true,
                pageLength: 10
            });
        } else {
            $('.all-approvals-pending-approvals').DataTable().columns.adjust().draw();
        }
    });
});