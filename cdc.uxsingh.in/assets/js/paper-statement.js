/**
 *  Paper Statement Screen
 *  Received/Issued: live data from GET /api/paper-ledger (GetPaperLedger_ByClient_Manu).
 *  Summary: live data from GET /api/paper-ledger-summary (GetPaperLedgerSummary_ByClient_Manu).
 */

'use strict';

document.addEventListener('DOMContentLoaded', function () {
  const ORDERS_SESSION_KEY = 'cdcAuthSession';
  const DEFAULT_RANGE = '90d';

  const session = getStoredSession();
  if (!session?.token) {
    const container = document.querySelector('.paper-statement-received')?.closest('.tab-pane');
    if (container) {
      const card = container.querySelector('.card-datatable');
      if (card) card.innerHTML = '<div class="p-4 text-center text-danger">Please sign in to view paper statement.</div>';
    }
    initSummaryTable([]);
    return;
  }

  let paperLedgerData = [];
  let summaryData = [];
  let dateRange = DEFAULT_RANGE;
  let customDates = null;
  let receivedDataTable = null;
  let issuedDataTable = null;
  let summaryDataTable = null;

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(ORDERS_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getApiBase() {
    if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
    if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/$/, '');
    const host = window.location.hostname;
    const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
    return (isLocalHost ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
  }

  function buildAuthHeaders() {
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (session?.token) headers['Authorization'] = 'Bearer ' + session.token;
    if (session?.sessionId) headers['X-Session-Id'] = session.sessionId;
    return headers;
  }

  function getDateParams() {
    if (customDates && customDates.from && customDates.to) {
      return { from: customDates.from, to: customDates.to };
    }
    return { range: dateRange };
  }

  async function fetchPaperLedger() {
    const apiBase = getApiBase();
    const params = getDateParams();
    let url = apiBase + '/paper-ledger';
    if (params.from && params.to) {
      url += '?from=' + encodeURIComponent(params.from) + '&to=' + encodeURIComponent(params.to);
    } else {
      url += '?range=' + encodeURIComponent(params.range || DEFAULT_RANGE);
    }
    const response = await fetch(url, { headers: buildAuthHeaders() });
    if (response.status === 401) throw new Error('Session expired. Please sign in again.');
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error || 'Failed to load paper ledger');
    }
    const body = await response.json();
    return body?.items || [];
  }

  async function fetchPaperLedgerSummary() {
    const apiBase = getApiBase();
    const params = getDateParams();
    let url = apiBase + '/paper-ledger-summary';
    if (params.from && params.to) {
      url += '?from=' + encodeURIComponent(params.from) + '&to=' + encodeURIComponent(params.to);
    } else {
      url += '?range=' + encodeURIComponent(params.range || DEFAULT_RANGE);
    }
    const response = await fetch(url, { headers: buildAuthHeaders() });
    if (response.status === 401) throw new Error('Session expired. Please sign in again.');
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error || 'Failed to load paper ledger summary');
    }
    const body = await response.json();
    return body?.items || [];
  }

  function getRowLedgerName(row) {
    if (!row || typeof row !== 'object') return '';
    return (row.LedgerName || row.CustomerName || row.Ledger || '').toString().trim();
  }

  function applyLedgerFilter(rows) {
    var email = (session?.email || '').trim().toLowerCase();
    var isCdcUser = email.endsWith('@cdcprinters.com');
    if (!isCdcUser) return rows || [];

    if (typeof window.getSelectedLedgerNames !== 'function') return rows || [];
    var selected = window.getSelectedLedgerNames();
    if (!Array.isArray(selected) || selected.length === 0) return rows || [];
    var set = new Set(selected.map(function (s) { return String(s).trim(); }).filter(Boolean));
    if (set.size === 0) return rows || [];
    return (rows || []).filter(function (row) {
      var name = getRowLedgerName(row);
      return name && set.has(name);
    });
  }

  function formatVoucherDate(val) {
    if (val == null || val === '') return '';
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function applyDtLayoutStyles(selector) {
    setTimeout(function () {
      [' .dt-layout-start', ' .dt-layout-end', ' .dt-layout-table', ' .dt-layout-full'].forEach(function (sel, i) {
        const el = document.querySelector(selector + ' ' + sel);
        if (!el) return;
        if (i === 2) { el.classList.remove('row', 'mt-2'); el.classList.add('mt-n2'); }
        if (i === 3) { el.classList.remove('col-md', 'col-12'); el.classList.add('table-responsive'); }
        el.classList.add('my-0');
      });
    }, 100);
  }

  function applyOrdersPaginationStyle(containerId, bottomClass) {
    var $target = $('#' + containerId);
    var $bottom = $target.find('.' + bottomClass);
    if (!$bottom.length) return;
    if (!$target.find('nav').length) {
      var $nav = $('<nav aria-label="Page navigation"></nav>');
      var $inner = $('<div class="d-flex justify-content-between align-items-center"></div>');
      $bottom.detach();
      $inner.append($bottom);
      $nav.append($inner);
      $target.empty().append($nav);
    }
    $target.find('.dt-length label').text('Show:');
    $target.find('.dt-length select').addClass('form-select form-select-sm').css('width', 'auto');
    $target.find('.dt-info').addClass('text-muted ms-3');
    $target.find('.dt-paging .pagination').addClass('mb-0');
  }

  function moveBottomToTarget($bottom, containerId, bottomClass) {
    var $target = $('#' + containerId);
    if (!$bottom.length || !$target.length) return;
    var $inner = $target.find('nav > div.d-flex');
    if ($inner.length) {
      $inner.find('.' + bottomClass).remove();
      $inner.append($bottom);
    } else {
      $target.append($bottom);
    }
    applyOrdersPaginationStyle(containerId, bottomClass);
  }

  function initReceivedTable(data) {
    const el = document.querySelector('.paper-statement-received');
    if (!el) return;
    if (receivedDataTable && $.fn.DataTable.isDataTable(el)) {
      receivedDataTable.clear();
      receivedDataTable.rows.add(data);
      receivedDataTable.draw();
      return;
    }
    receivedDataTable = new DataTable(el, {
      data: data,
      columns: [
        { data: 'ItemName', title: 'Item Name' },
        { data: 'VoucherDate', title: 'Receipt Date', render: formatVoucherDate },
        { data: 'VoucherNo', title: 'Voucher No' },
        { data: 'QtyReceived', title: 'Qty Received', render: function (v) { return v != null ? Number(v) : ''; } }
      ],
      paging: true,
      lengthChange: true,
      searching: true,
      info: true,
      responsive: false,
      scrollX: true,
      dom: '<"dt-custom-search-ps-received"f>rt<"bottom-received"lip>',
      order: [[1, 'desc']],
      lengthMenu: [[10, 20, 30, 50, -1], [10, 20, 30, 50, 'All']],
      language: {
        paginate: {
          next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
          previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
          first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
          last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
        }
      },
      initComplete: function () {
        var $wrap = $('.dt-custom-search-ps-received').appendTo('.search-here');
        $('.search-here label').contents().filter(function () { return this.nodeType === 3; }).remove();
        $('.search-here label').hide();
        var $input = $('.search-here input[type="search"]');
        $input.attr('placeholder', 'Search...').addClass('form-control');
        $input.wrap('<div class="input-group"></div>');
        $input.before('<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>');
        moveBottomToTarget($('.bottom-received'), 'ps-pagination-received', 'bottom-received');
      }
    });
    receivedDataTable.on('draw', function () {
      var $bottom = $('.bottom-received').filter(function () { return !$(this).closest('#ps-pagination-received').length; });
      if ($bottom.length) moveBottomToTarget($bottom, 'ps-pagination-received', 'bottom-received');
      else applyOrdersPaginationStyle('ps-pagination-received', 'bottom-received');
    });
    applyDtLayoutStyles('.paper-statement-received');
  }

  function initIssuedTable(data) {
    const el = document.querySelector('.paper-statement-issued');
    if (!el) return;
    if (issuedDataTable && $.fn.DataTable.isDataTable(el)) {
      issuedDataTable.clear();
      issuedDataTable.rows.add(data);
      issuedDataTable.draw();
      return;
    }
    issuedDataTable = new DataTable(el, {
      data: data,
      columns: [
        { data: 'ItemName', title: 'Item Name' },
        { data: 'VoucherDate', title: 'Issue Date', render: formatVoucherDate },
        { data: 'VoucherNo', title: 'Voucher No' },
        { data: 'QtyIssued', title: 'Qty Issued', render: function (v) { return v != null ? Number(v) : ''; } }
      ],
      paging: true,
      lengthChange: true,
      searching: true,
      info: true,
      responsive: false,
      scrollX: true,
      dom: '<"dt-custom-search-ps-issued"f>rt<"bottom-issued"lip>',
      order: [[1, 'desc']],
      lengthMenu: [[10, 20, 30, 50, -1], [10, 20, 30, 50, 'All']],
      language: {
        paginate: {
          next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
          previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
          first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
          last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
        }
      },
      initComplete: function () {
        $('.dt-custom-search-ps-issued').appendTo('.search-here-issued');
        $('.search-here-issued label').contents().filter(function () { return this.nodeType === 3; }).remove();
        $('.search-here-issued label').hide();
        var $input = $('.search-here-issued input[type="search"]');
        $input.attr('placeholder', 'Search...').addClass('form-control');
        $input.wrap('<div class="input-group"></div>');
        $input.before('<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>');
        moveBottomToTarget($('.bottom-issued'), 'ps-pagination-issued', 'bottom-issued');
      }
    });
    issuedDataTable.on('draw', function () {
      var $bottom = $('.bottom-issued').filter(function () { return !$(this).closest('#ps-pagination-issued').length; });
      if ($bottom.length) moveBottomToTarget($bottom, 'ps-pagination-issued', 'bottom-issued');
      else applyOrdersPaginationStyle('ps-pagination-issued', 'bottom-issued');
    });
    applyDtLayoutStyles('.paper-statement-issued');
  }

  function setLoading(loading) {
    var cards = document.querySelectorAll('#home .card-datatable, #profile .card-datatable, #contact .card-datatable');
    cards.forEach(function (card) {
      if (!card) return;
      if (loading) card.classList.add('opacity-50');
      else card.classList.remove('opacity-50');
    });
  }

  function getRangeLabel(range) {
    var labels = { '30d': 'Last 30 Days', '90d': 'Last 90 Days', '180d': 'Last 180 Days', '365d': 'Last 365 Days', 'custom': 'Custom Date' };
    return labels[range] || 'Last 90 Days';
  }

  function updateAllDateRangeButtons() {
    var label = getRangeLabel(dateRange);
    document.querySelectorAll('.date-range-group .date-range-btn').forEach(function (btn) {
      btn.textContent = label;
    });
  }

  function loadPaperLedgerAndRender() {
    setLoading(true);
    Promise.all([fetchPaperLedger(), fetchPaperLedgerSummary()])
      .then(function (results) {
        var ledgerItems = results[0] || [];
        var summaryItems = results[1] || [];
        paperLedgerData = ledgerItems;
        summaryData = summaryItems;
        var received = paperLedgerData.filter(function (r) { return r.RowType === 'Receipt'; });
        var issued = paperLedgerData.filter(function (r) { return r.RowType === 'Issue'; });
        received = applyLedgerFilter(received);
        issued = applyLedgerFilter(issued);
        var summaryFiltered = applyLedgerFilter(summaryData);
        initReceivedTable(received);
        initIssuedTable(issued);
        initSummaryTable(summaryFiltered);
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : 'Failed to load paper statement';
        var container = document.querySelector('#home .card-datatable');
        if (container) container.innerHTML = '<div class="p-4 text-center text-danger">' + msg + '</div>';
        initReceivedTable([]);
        initIssuedTable([]);
        initSummaryTable([]);
      })
      .finally(function () { setLoading(false); });
  }

  function initDateRangeHandlers() {
    document.addEventListener('click', function (e) {
      if (e.target.classList.contains('date-range-option')) {
        e.preventDefault();
        var range = e.target.dataset.range;
        if (range) {
          dateRange = range;
          customDates = null;
          updateAllDateRangeButtons();
          loadPaperLedgerAndRender();
        }
      }
    });

    var applyBtn = document.getElementById('paperStatementApplyCustomDate');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        var startDate = document.getElementById('paperStatementStartDate').value;
        var endDate = document.getElementById('paperStatementEndDate').value;
        if (!startDate || !endDate) {
          alert('Please select both start and end dates');
          return;
        }
        if (new Date(startDate) > new Date(endDate)) {
          alert('Start date must be before end date');
          return;
        }
        customDates = { from: startDate, to: endDate };
        dateRange = 'custom';
        updateAllDateRangeButtons();
        var modal = bootstrap.Modal.getInstance(document.getElementById('paperStatementCustomDateModal'));
        if (modal) modal.hide();
        loadPaperLedgerAndRender();
      });
    }
  }
  initDateRangeHandlers();

  window.addEventListener('ledgerFilterChange', function () {
    if (!paperLedgerData && !summaryData) return;
    var received = (paperLedgerData || []).filter(function (r) { return r.RowType === 'Receipt'; });
    var issued = (paperLedgerData || []).filter(function (r) { return r.RowType === 'Issue'; });
    received = applyLedgerFilter(received);
    issued = applyLedgerFilter(issued);
    var summaryFiltered = applyLedgerFilter(summaryData || []);
    initReceivedTable(received);
    initIssuedTable(issued);
    initSummaryTable(summaryFiltered);
  });

  loadPaperLedgerAndRender();

  document.querySelector('#profile-tab').addEventListener('shown.bs.tab', function () {
    if (issuedDataTable && $.fn.DataTable.isDataTable('.paper-statement-issued')) {
      issuedDataTable.columns.adjust().draw();
    }
  });

  function formatQty(val) {
    return val != null && val !== '' ? Number(val) : '';
  }

  function initSummaryTable(data) {
    var el = document.querySelector('.paper-statement-summary');
    if (!el) return;
    data = data || [];
    if (summaryDataTable && $.fn.DataTable.isDataTable(el)) {
      summaryDataTable.clear();
      summaryDataTable.rows.add(data);
      summaryDataTable.draw();
      return;
    }
    summaryDataTable = new DataTable(el, {
      data: data,
      columns: [
        { data: 'ItemName', title: 'Item Name' },
        { data: 'Opening', title: 'Opening', render: formatQty },
        { data: 'Receipt', title: 'Receipt', render: formatQty },
        { data: 'Issued', title: 'Issued', render: formatQty },
        { data: 'Closing', title: 'Closing', render: formatQty }
      ],
      paging: true,
      lengthChange: true,
      searching: true,
      info: true,
      responsive: false,
      scrollX: true,
      dom: '<"dt-custom-search-ps-summary"f>rt<"bottom-summary"lip>',
      order: [[0, 'asc']],
      lengthMenu: [[10, 20, 30, 50, -1], [10, 20, 30, 50, 'All']],
      language: {
        paginate: {
          next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
          previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
          first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
          last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
        }
      },
      initComplete: function () {
        $('.dt-custom-search-ps-summary').appendTo('.search-here-summary');
        $('.search-here-summary label').contents().filter(function () { return this.nodeType === 3; }).remove();
        $('.search-here-summary label').hide();
        var $input = $('.search-here-summary input[type="search"]');
        $input.attr('placeholder', 'Search...').addClass('form-control');
        $input.wrap('<div class="input-group"></div>');
        $input.before('<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>');
        moveBottomToTarget($('.bottom-summary'), 'ps-pagination-summary', 'bottom-summary');
      }
    });
    summaryDataTable.on('draw', function () {
      var $bottom = $('.bottom-summary').filter(function () { return !$(this).closest('#ps-pagination-summary').length; });
      if ($bottom.length) moveBottomToTarget($bottom, 'ps-pagination-summary', 'bottom-summary');
      else applyOrdersPaginationStyle('ps-pagination-summary', 'bottom-summary');
    });
    applyDtLayoutStyles('.paper-statement-summary');
  }

  document.querySelector('#contact-tab').addEventListener('shown.bs.tab', function () {
    if (summaryDataTable && $.fn.DataTable.isDataTable('.paper-statement-summary')) {
      summaryDataTable.columns.adjust().draw();
    }
  });
});
