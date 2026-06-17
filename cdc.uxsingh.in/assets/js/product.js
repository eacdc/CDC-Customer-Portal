/**
 *  Products Screen
 *  - Column chart: month-wise total order quantity (dbo.portal_order_history_chart)
 *  - Table: per-product summary (dbo.portal_products_list)
 */
'use strict';

document.addEventListener('DOMContentLoaded', function () {
  const SESSION_KEY = 'cdcAuthSession';
  const qtyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

  const session = getStoredSession();
  if (!session?.token) {
    showChartMessage('Sign in to view products.');
    renderTable([]);
    return;
  }

  loadProducts();

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  async function loadProducts() {
    showChartMessage('Loading order history...');
    try {
      const response = await fetch(`${getApiBase()}/products`, {
        headers: buildAuthHeaders()
      });

      if (response.status === 401) {
        showChartMessage('Your session has expired. Please sign in again.');
        renderTable([]);
        return;
      }
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body?.error || 'Unable to load products.');
      }

      const body = await response.json();
      const chart = Array.isArray(body?.chart) ? body.chart : [];
      const products = Array.isArray(body?.products) ? body.products : [];

      renderChart(chart);
      renderTable(products);
    } catch (error) {
      console.error('[PRODUCTS] load failed', error);
      showChartMessage('Failed to load order history.');
      renderTable([]);
    }
  }

  // ---------------------------------------------------------------------------
  // Chart (month-wise order quantity)
  // ---------------------------------------------------------------------------
  function renderChart(months) {
    const el = document.getElementById('productOrderHistoryChart');
    if (!el) return;

    if (!months.length) {
      showChartMessage('No order history available.');
      return;
    }

    el.innerHTML = '';

    const labelColor = config.colors.textMuted;
    const fontFamily = config.fontFamily;
    const categories = months.map((m) => m.MonthLabel || formatMonth(m.MonthStart));
    const data = months.map((m) => Number(m.TotalOrderQty || 0));

    const chartConfig = {
      chart: {
        height: 320,
        type: 'bar',
        parentHeightOffset: 0,
        toolbar: { show: false }
      },
      series: [{ name: 'Order Qty', data }],
      colors: [config.colors.primary],
      plotOptions: {
        bar: {
          columnWidth: '45%',
          borderRadius: 7,
          startingShape: 'rounded',
          endingShape: 'rounded'
        }
      },
      dataLabels: { enabled: false },
      stroke: { show: true, width: 4, colors: ['transparent'] },
      xaxis: {
        categories,
        labels: {
          style: { colors: labelColor, fontFamily, fontSize: '13px' }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          formatter: (val) => qtyFormatter.format(val || 0),
          style: { colors: labelColor, fontFamily, fontSize: '13px' }
        }
      },
      grid: {
        borderColor: config.colors.borderColor,
        strokeDashArray: 6,
        padding: { left: 5, right: 5 }
      },
      tooltip: {
        y: { formatter: (val) => qtyFormatter.format(val || 0) }
      },
      responsive: [
        { breakpoint: 1025, options: { chart: { height: 280 } } },
        { breakpoint: 767, options: { chart: { height: 260 } } }
      ]
    };

    if (window.productChartInstance) {
      try { window.productChartInstance.destroy(); } catch (e) { /* ignore */ }
      window.productChartInstance = null;
    }
    const chart = new ApexCharts(el, chartConfig);
    window.productChartInstance = chart;
    chart.render();
  }

  function showChartMessage(text) {
    const el = document.getElementById('productOrderHistoryChart');
    if (el) {
      el.innerHTML = `<div class="text-center py-5 text-muted">${escapeHtml(text)}</div>`;
    }
  }

  // ---------------------------------------------------------------------------
  // Table (products list)
  // ---------------------------------------------------------------------------
  function renderTable(products) {
    const tableEl = document.querySelector('.product-data');
    if (!tableEl) return;

    const rows = (products || []).map((p) => ({
      jobName: p.JobName || '-',
      imageUrl: p.ImageUrl || '',
      dimension: formatDimension(p.Dimension),
      frontColor: p.FrontColor || '-',
      backColor: p.BackColor || '-',
      operations: p.Operations || '-',
      boardQuality: p.BoardQuality || '-',
      boardGsm: p.BoardGSM !== undefined && p.BoardGSM !== null && p.BoardGSM !== '' ? p.BoardGSM : '-'
    }));

    if (window.productDataTable) {
      try { window.productDataTable.destroy(); } catch (e) { /* ignore */ }
      window.productDataTable = null;
    }

    const dt = new DataTable(tableEl, {
      data: rows,
      paging: true,
      lengthChange: true,
      searching: true,
      info: true,
      responsive: false,
      columns: [
        { data: null, defaultContent: '' },
        {
          data: 'jobName',
          render: (data, type, row) => {
            if (type !== 'display') return data || '';
            return renderJobNameCell(row);
          }
        },
        { data: 'dimension' },
        { data: 'frontColor', render: (d, type) => type === 'display' ? wrapCell(d) : (d || '') },
        { data: 'backColor', render: (d, type) => type === 'display' ? wrapCell(d) : (d || '') },
        { data: 'operations', render: (d, type) => type === 'display' ? wrapCell(d) : (d || '') },
        { data: 'boardQuality', render: (d, type) => type === 'display' ? wrapCell(d) : (d || '') },
        { data: 'boardGsm' }
      ],
      columnDefs: [
        {
          className: 'control',
          orderable: false,
          searchable: false,
          responsivePriority: 1,
          targets: 0,
          render: () => ''
        }
      ],
      dom: '<"dt-custom-search-product"f>rt<"bottom-product"lip>',
      order: [[1, 'asc']],
      lengthMenu: [[10, 20, 30, 50, -1], [10, 20, 30, 50, 'All']],
      language: {
        emptyTable: 'No products found.',
        paginate: {
          next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
          previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
          first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
          last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
        }
      },
      initComplete: function () {
        $('.dt-custom-search-product').appendTo('.search-here');
        $('.search-here label').contents().filter(function () {
          return this.nodeType === 3;
        }).remove();
        $('.search-here label').hide();

        const $input = $('.search-here input[type="search"]');
        $input.attr('placeholder', 'Search...');
        $input.addClass('form-control');
        $input.wrap('<div class="input-group"></div>');
        $input.before(`<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg></span>`);
      },
      responsive: {
        details: {
          display: DataTable.Responsive.display.modal({
            header: function (row) {
              const data = row.data();
              return 'Details of ' + (data.jobName || '');
            }
          }),
          type: 'column',
          renderer: function (api, rowIdx, columns) {
            const data = columns
              .map(col => col.title !== ''
                ? `<tr data-dt-row="${col.rowIndex}" data-dt-column="${col.columnIndex}">
              <td>${col.title}:</td>
              <td>${col.data}</td>
            </tr>` : '')
              .join('');

            if (data) {
              const table = document.createElement('table');
              table.classList.add('table', 'datatables-basic', 'mb-2', 'custom-product-modal-table');
              const tbody = document.createElement('tbody');
              tbody.innerHTML = data;
              table.appendChild(tbody);
              return table;
            }
            return false;
          }
        }
      }
    });

    window.productDataTable = dt;

    dt.on('draw', function () {
      const paginateElement = document.querySelector('.bottom-product');
      const customPaginationContainer = document.querySelector('.custom-table-pagination-layout-product');
      if (paginateElement && customPaginationContainer) {
        customPaginationContainer.appendChild(paginateElement);
      }
    });

    // Minor layout fixes (match other DataTable screens)
    setTimeout(() => {
      const elementsToModify = [
        { selector: '.dt-layout-start', classToAdd: 'my-0' },
        { selector: '.dt-layout-end', classToAdd: 'my-0' },
        { selector: '.dt-layout-table', classToRemove: 'row mt-2', classToAdd: 'mt-n2' },
        { selector: '.dt-layout-full', classToRemove: 'col-md col-12', classToAdd: 'table-responsive' }
      ];
      elementsToModify.forEach(({ selector, classToRemove, classToAdd }) => {
        document.querySelectorAll(selector).forEach(element => {
          if (classToRemove) classToRemove.split(' ').forEach(c => element.classList.remove(c));
          if (classToAdd) classToAdd.split(' ').forEach(c => element.classList.add(c));
        });
      });
    }, 100);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Render the Job Name column with a product thumbnail to the left of the
  // name. Mirrors the avatar+text pattern used elsewhere in the template.
  const FALLBACK_IMAGE = (window.assetsPath || '../../assets/') + 'img/products/default-packaging.svg';
  function renderJobNameCell(row) {
    const name = row.jobName || '-';
    const safeName = escapeHtml(name);
    const safeFallback = escapeHtml(FALLBACK_IMAGE);
    const rawUrl = (row.imageUrl || '').trim();
    const imgSrc = rawUrl ? escapeHtml(rawUrl) : safeFallback;
    return `
      <div class="d-flex align-items-center gap-3">
        <img src="${imgSrc}"
             alt="${safeName}"
             style="width: 56px; height: 56px; object-fit: contain; background-color: #f5f5f5; border-radius: 4px;"
             loading="lazy"
             decoding="async"
             onerror="this.onerror=null;this.src='${safeFallback}';">
        <span class="fw-medium text-heading">${safeName}</span>
      </div>
    `;
  }

  // Dimension comes as "L:585,W:108" or "H:265,L:225,W:57,PF:30".
  // We surface only length x width.
  function formatDimension(raw) {
    if (!raw) return '-';
    const parts = String(raw).split(',');
    const map = {};
    parts.forEach((part) => {
      const [key, value] = part.split(':');
      if (key && value !== undefined) {
        map[key.trim().toUpperCase()] = value.trim();
      }
    });
    const l = map.L;
    const w = map.W;
    if (l && w) return `${l} x ${w}`;
    if (l) return `${l}`;
    if (w) return `${w}`;
    return String(raw);
  }

  function wrapCell(value) {
    const text = value === undefined || value === null || value === '' ? '-' : String(value);
    return `<span class="d-inline-block" style="max-width: 320px; white-space: normal;">${escapeHtml(text)}</span>`;
  }

  function formatMonth(dateString) {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      return `${month} ${d.getFullYear()}`;
    } catch {
      return String(dateString);
    }
  }

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getApiBase() {
    if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
    if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/$/, '');
    const host = window.location.hostname;
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
    return (isLocal ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
  }

  function buildAuthHeaders() {
    const headers = { Accept: 'application/json' };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    if (session?.sessionId) headers['X-Session-Id'] = session.sessionId;
    return headers;
  }

  async function safeJson(response) {
    try { return await response.json(); } catch { return null; }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }
});
