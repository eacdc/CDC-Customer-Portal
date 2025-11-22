/**
 * Dashboard Analytics
 */

'use strict';

(function initDashboardKpis() {
  const STORAGE_KEY = 'cdcAuthSession';
  const RANGE_CONFIG = [
    { days: 30, fallbackTitle: 'Orders Last 30 Days' },
    { days: 90, fallbackTitle: 'Orders Last 90 Days' },
    { days: 180, fallbackTitle: 'Orders Last 180 Days' },
    { days: 365, fallbackTitle: 'Orders Last 365 Days' }
  ];
  const qtyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const valueFormatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  document.addEventListener('DOMContentLoaded', () => {
    const cards = Array.from(document.querySelectorAll('.dashboard-kpi'));
    if (!cards.length) return;

    setInitialState(cards);

    const session = getStoredSession();
    if (!session?.token) {
      cards.forEach(card => setCardError(card, 'Sign in to view KPIs'));
      return;
    }

    const apiBase = getApiBase(session);
    fetchDashboardKpis(apiBase, session)
      .then(kpis => renderKpis(cards, kpis))
      .catch(err => {
        console.error('Failed to load dashboard KPIs', err);
        const message =
          err?.code === 'SESSION_EXPIRED'
            ? 'Session expired. Please sign in again.'
            : 'Unable to load KPIs';
        cards.forEach(card => setCardError(card, message));
      });
  });

  function setInitialState(cards) {
    cards.forEach(card => {
      card.classList.add('kpi-loading');
      setText(card, '[data-kpi-title]', 'Loading…');
      setText(card, '[data-kpi-qty]', '--');
      setText(card, '[data-kpi-value]', 'Rs.--');
      setText(card, '[data-kpi-change]', '…');
      applyChangeState(card, 'neutral');
    });
  }

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getApiBase(session) {
    if (session?.apiBase) {
      return String(session.apiBase).replace(/\/$/, '');
    }
    if (window.AUTH_API_BASE) {
      return String(window.AUTH_API_BASE).replace(/\/$/, '');
    }
    const host = window.location.hostname;
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
    return (isLocal ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
  }

  function buildAuthHeaders(session) {
    const headers = { Accept: 'application/json' };
    if (session?.token) {
      headers.Authorization = `Bearer ${session.token}`;
    }
    if (session?.sessionId) {
      headers['X-Session-Id'] = session.sessionId;
    }
    return headers;
  }

  async function fetchDashboardKpis(apiBase, session) {
    const response = await fetch(`${apiBase}/dashboard`, {
      headers: buildAuthHeaders(session)
    });
    const body = await safeJson(response);

    if (response.status === 401) {
      const err = new Error('SESSION_EXPIRED');
      err.code = 'SESSION_EXPIRED';
      throw err;
    }

    if (!response.ok) {
      const err = new Error(body?.error || 'Failed to load dashboard data');
      err.code = 'REQUEST_FAILED';
      throw err;
    }

    return body?.kpis || [];
  }

  function renderKpis(cards, kpis) {
    const map = new Map();
    (kpis || []).forEach(item => {
      const key = Number(item?.RangeDays);
      if (!Number.isFinite(key)) return;
      map.set(key, item);
    });

    cards.forEach(card => {
      const rangeDays = Number(card.dataset.rangeDays);
      const config = RANGE_CONFIG.find(r => r.days === rangeDays) || {};
      const kpi = map.get(rangeDays);
      if (kpi) {
        updateCard(card, kpi, config.fallbackTitle);
      } else {
        setCardEmpty(card, config.fallbackTitle, 'No data available');
      }
    });
  }

  function updateCard(card, kpi, fallbackTitle) {
    card.classList.remove('kpi-loading');
    setText(card, '[data-kpi-title]', kpi?.RangeLabel || fallbackTitle || 'Orders');
    setText(card, '[data-kpi-qty]', formatQty(kpi?.CurrOrderQty));
    setText(card, '[data-kpi-value]', formatValue(kpi?.CurrOrderValue));

    const change = formatChange(kpi?.OrderValueChangePct);
    setText(card, '[data-kpi-change]', change.text);
    applyChangeState(card, change.state);
  }

  function setCardEmpty(card, fallbackTitle, description) {
    card.classList.remove('kpi-loading');
    if (fallbackTitle) {
      setText(card, '[data-kpi-title]', fallbackTitle);
    }
    setText(card, '[data-kpi-qty]', '--');
    setText(card, '[data-kpi-value]', 'Rs.--');
    setText(card, '[data-kpi-change]', '--');
    applyChangeState(card, 'neutral');
  }

  function setCardError(card, message) {
    card.classList.remove('kpi-loading');
    const rangeDays = Number(card.dataset.rangeDays);
    const config = RANGE_CONFIG.find(r => r.days === rangeDays);
    setCardEmpty(card, config?.fallbackTitle, message || 'Unable to load');
  }

  function formatQty(value) {
    const num = Number(value);
    return Number.isFinite(num) ? qtyFormatter.format(num) : '--';
  }

  function formatValue(value) {
    const num = Number(value);
    return Number.isFinite(num) ? `Rs.${valueFormatter.format(num)}` : 'Rs.--';
  }

  function formatChange(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return { text: 'NA', state: 'neutral' };
    }
    const formatted = Math.abs(num) < 0.05 ? '0%' : `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
    const state = num > 0 ? 'up' : num < 0 ? 'down' : 'neutral';
    return { text: formatted, state };
  }

  function applyChangeState(card, state) {
    const changeEl = card.querySelector('[data-kpi-change]');
    const arrowEl = card.querySelector('[data-kpi-arrow]');
    const stateClass =
      state === 'up' ? 'kpi-state-up' : state === 'down' ? 'kpi-state-down' : 'kpi-state-neutral';

    const updateStateClass = (el) => {
      if (!el) return;
      el.classList.remove('kpi-state-up', 'kpi-state-down', 'kpi-state-neutral');
      el.classList.add(stateClass);
    };

    updateStateClass(changeEl);
    updateStateClass(arrowEl);

    if (arrowEl) {
      arrowEl.textContent =
        state === 'up' ? '↗' : state === 'down' ? '↘' : '→';
    }
  }

  function setText(container, selector, value) {
    const el = container.querySelector(selector);
    if (el) {
      el.textContent = value;
    }
  }

  async function safeJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
})();

(function () {
  let cardColor, headingColor, fontFamily, labelColor;
  cardColor = config.colors.cardColor;
  labelColor = config.colors.textMuted;
  headingColor = config.colors.headingColor;

  // swiper loop and autoplay
  // --------------------------------------------------------------------
  const swiperWithPagination = document.querySelector('#swiper-with-pagination-cards');
  if (swiperWithPagination) {
    new Swiper(swiperWithPagination, {
      loop: true,
      autoplay: {
        delay: 2500,
        disableOnInteraction: false
      },
      pagination: {
        clickable: true,
        el: '.swiper-pagination'
      }
    });
  }

  // Average Daily Sales
  // --------------------------------------------------------------------
  const averageDailySalesEl = document.querySelector('#averageDailySales'),
    averageDailySalesConfig = {
      chart: {
        height: 105,
        type: 'area',
        toolbar: {
          show: false
        },
        sparkline: {
          enabled: true
        }
      },
      markers: {
        colors: 'transparent',
        strokeColors: 'transparent'
      },
      grid: {
        show: false
      },
      colors: [config.colors.success],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          gradientToColors: [config.colors.cardColor],
          opacityTo: 0.1,
          stops: [0, 100]
        }
      },
      dataLabels: {
        enabled: false
      },
      stroke: {
        width: 2,
        curve: 'smooth'
      },
      series: [
        {
          data: [500, 160, 930, 670]
        }
      ],
      xaxis: {
        show: true,
        lines: {
          show: false
        },
        labels: {
          show: false
        },
        stroke: {
          width: 0
        },
        axisBorder: {
          show: false
        }
      },
      yaxis: {
        stroke: {
          width: 0
        },
        show: false
      },
      tooltip: {
        enabled: false
      },
      responsive: [
        {
          breakpoint: 1387,
          options: {
            chart: {
              height: 80
            }
          }
        },
        {
          breakpoint: 1200,
          options: {
            chart: {
              height: 123
            }
          }
        }
      ]
    };
  if (typeof averageDailySalesEl !== undefined && averageDailySalesEl !== null) {
    const averageDailySales = new ApexCharts(averageDailySalesEl, averageDailySalesConfig);
    averageDailySales.render();
  }

  // Earning Reports Bar Chart
  // --------------------------------------------------------------------
  const weeklyEarningReportsEl = document.querySelector('#weeklyEarningReports'),
    weeklyEarningReportsConfig = {
      chart: {
        height: 161,
        parentHeightOffset: 0,
        type: 'bar',
        toolbar: {
          show: false
        }
      },
      plotOptions: {
        bar: {
          barHeight: '60%',
          columnWidth: '38%',
          startingShape: 'rounded',
          endingShape: 'rounded',
          borderRadius: 4,
          distributed: true
        }
      },
      grid: {
        show: false,
        padding: {
          top: -30,
          bottom: 0,
          left: -10,
          right: -10
        }
      },
      colors: [
        config.colors_label.primary,
        config.colors_label.primary,
        config.colors_label.primary,
        config.colors_label.primary,
        config.colors.primary,
        config.colors_label.primary,
        config.colors_label.primary
      ],
      dataLabels: {
        enabled: false
      },
      series: [
        {
          data: [40, 65, 50, 45, 90, 55, 70]
        }
      ],
      legend: {
        show: false
      },
      xaxis: {
        categories: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
        axisBorder: {
          show: false
        },
        axisTicks: {
          show: false
        },
        labels: {
          style: {
            colors: labelColor,
            fontSize: '13px',
            fontFamily: fontFamily
          }
        }
      },
      yaxis: {
        labels: {
          show: false
        }
      },
      tooltip: {
        enabled: false
      },
      responsive: [
        {
          breakpoint: 1025,
          options: {
            chart: {
              height: 199
            }
          }
        }
      ],
      states: {
        hover: {
          filter: {
            type: 'none'
          }
        },
        active: {
          filter: {
            type: 'none'
          }
        }
      }
    };
  if (typeof weeklyEarningReportsEl !== undefined && weeklyEarningReportsEl !== null) {
    const weeklyEarningReports = new ApexCharts(weeklyEarningReportsEl, weeklyEarningReportsConfig);
    weeklyEarningReports.render();
  }

  // Support Tracker - Radial Bar Chart
  // --------------------------------------------------------------------
  const supportTrackerEl = document.querySelector('#supportTracker'),
    supportTrackerOptions = {
      series: [85],
      labels: ['Completed Task'],
      chart: {
        height: 337,
        type: 'radialBar'
      },
      plotOptions: {
        radialBar: {
          offsetY: 10,
          startAngle: -140,
          endAngle: 130,
          hollow: {
            size: '65%'
          },
          track: {
            background: cardColor,
            strokeWidth: '100%'
          },
          dataLabels: {
            name: {
              offsetY: -20,
              color: labelColor,
              fontSize: '13px',
              fontWeight: '400',
              fontFamily: fontFamily
            },
            value: {
              offsetY: 10,
              color: headingColor,
              fontSize: '38px',
              fontWeight: '400',
              fontFamily: fontFamily
            }
          }
        }
      },
      colors: [config.colors.primary],
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'dark',
          shadeIntensity: 0.5,
          gradientToColors: [config.colors.primary],
          inverseColors: true,
          opacityFrom: 1,
          opacityTo: 0.6,
          stops: [30, 70, 100]
        }
      },
      stroke: {
        dashArray: 10
      },
      grid: {
        padding: {
          top: -20,
          bottom: 5
        }
      },
      states: {
        hover: {
          filter: {
            type: 'none'
          }
        },
        active: {
          filter: {
            type: 'none'
          }
        }
      },
      responsive: [
        {
          breakpoint: 1025,
          options: {
            chart: {
              height: 330
            }
          }
        },
        {
          breakpoint: 769,
          options: {
            chart: {
              height: 280
            }
          }
        }
      ]
    };
  if (typeof supportTrackerEl !== undefined && supportTrackerEl !== null) {
    const supportTracker = new ApexCharts(supportTrackerEl, supportTrackerOptions);
    supportTracker.render();
  }

  // Total Orders Analytics (dynamic monthly orders)
  const totalOrdersChartEl = document.querySelector('#shipmentStatisticsChart');
  if (totalOrdersChartEl) {
    // Immediately clear any static content that might have rendered
    totalOrdersChartEl.innerHTML = '';
    
    const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const SESSION_KEY = 'cdcAuthSession';
    let allMonthlyOrders = []; // Store all monthly orders for filtering

    function getSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function getApiBase(session) {
      if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
      if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/$/, '');
      const host = window.location.hostname;
      const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
      return (isLocal ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
    }

    function monthLabel(ym) {
      if (!ym) return '';
      const [y, m] = ym.split('-').map(Number);
      if (!m || m < 1 || m > 12) return ym;
      return `${MONTH_LABELS[m - 1]} '${String(y).slice(-2)}`;
    }

    function buildChartConfig(months) {
      const categories = months.map((m) => monthLabel(m.YearMonth));
      const seriesData = months.map((m) => Number(m.TotalValue || 0));
      const valueFormatter = new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      });
      return {
        chart: {
          height: 320,
          type: 'bar',
          parentHeightOffset: 0,
          toolbar: { show: false }
        },
        series: [
          {
            name: 'Orders',
            data: seriesData
          }
        ],
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
        stroke: {
          show: true,
          width: 4,
          colors: ['transparent']
        },
        xaxis: {
          categories,
          labels: {
            style: {
              colors: labelColor,
              fontFamily,
              fontSize: '13px'
            }
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          labels: {
            formatter: (val) => `₹${(val / 1000).toFixed(0)}k`,
            style: {
              colors: labelColor,
              fontFamily,
              fontSize: '13px'
            }
          }
        },
        grid: {
          borderColor: config.colors.borderColor,
          strokeDashArray: 6,
          padding: { left: 5, right: 5 }
        },
        tooltip: {
          y: {
            formatter: (val) => `Rs.${valueFormatter.format(val || 0)}`
          }
        },
        responsive: [
          {
            breakpoint: 1025,
            options: { chart: { height: 280 } }
          },
          {
            breakpoint: 767,
            options: { chart: { height: 260 } }
          }
        ]
      };
    }

    function setChartPlaceholder(text) {
      totalOrdersChartEl.innerHTML = `<div class="text-center py-5 text-muted">${text}</div>`;
    }

    function extractYears(months) {
      const yearSet = new Set();
      months.forEach((m) => {
        if (m.YearMonth) {
          const year = m.YearMonth.split('-')[0];
          if (year) yearSet.add(Number(year));
        }
      });
      return Array.from(yearSet).sort((a, b) => b - a); // Descending order
    }

    function populateYearDropdown(years, currentYear) {
      const dropdown = document.getElementById('orders-year-dropdown');
      const button = document.getElementById('orders-year-button');
      if (!dropdown || !button) return;

      // Clear existing items except "This Year"
      dropdown.innerHTML = '';
      
      // Add "This Year" option
      const currentYearItem = document.createElement('li');
      currentYearItem.innerHTML = `<a class="dropdown-item" href="javascript:void(0);" data-year="${currentYear}">This Year</a>`;
      dropdown.appendChild(currentYearItem);

      // Add year options
      years.forEach((year) => {
        if (year !== currentYear) {
          const li = document.createElement('li');
          li.innerHTML = `<a class="dropdown-item" href="javascript:void(0);" data-year="${year}">${year}</a>`;
          dropdown.appendChild(li);
        }
      });
    }

    function filterByYear(months, year) {
      if (!year) return months;
      return months.filter((m) => {
        if (!m.YearMonth) return false;
        const monthYear = Number(m.YearMonth.split('-')[0]);
        return monthYear === year;
      });
    }

    function updateChart(months, selectedYear) {
      const filteredMonths = filterByYear(months, selectedYear);
      if (!filteredMonths.length) {
        setChartPlaceholder('No orders available for selected year.');
        return;
      }

      // Destroy existing chart
      if (window.shipmentChartInstance) {
        try {
          window.shipmentChartInstance.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
        window.shipmentChartInstance = null;
      }

      // Clear and render new chart
      totalOrdersChartEl.innerHTML = '';
      const chartConfig = buildChartConfig(filteredMonths);
      const chart = new ApexCharts(totalOrdersChartEl, chartConfig);
      window.shipmentChartInstance = chart;
      chart.render();
    }

    const session = getSession();
    if (!session?.token) {
      setChartPlaceholder('Sign in to view orders analytics.');
      return;
    }

    // Immediately clear any existing chart and show loading state
    if (window.shipmentChartInstance) {
      try {
        window.shipmentChartInstance.destroy();
      } catch (e) {
        // Ignore destroy errors
      }
      window.shipmentChartInstance = null;
    }
    // Show loading state immediately
    totalOrdersChartEl.innerHTML = '<div class="text-center py-5 text-muted">Loading orders analytics...</div>';
    totalOrdersChartEl.classList.add('kpi-loading-chart');
    
    const apiBase = getApiBase(session);

    // Fetch dashboard data and render chart
    fetch(`${apiBase}/dashboard`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...(session.sessionId ? { 'X-Session-Id': session.sessionId } : {})
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dashboard data');
        return res.json();
      })
      .then((body) => {
        totalOrdersChartEl.classList.remove('kpi-loading-chart');
        allMonthlyOrders = Array.isArray(body?.monthlyOrders) ? body.monthlyOrders : [];
        if (!allMonthlyOrders.length) {
          setChartPlaceholder('No monthly orders available.');
          return;
        }

        // Extract years and populate dropdown
        const currentYear = new Date().getFullYear();
        const years = extractYears(allMonthlyOrders);
        populateYearDropdown(years, currentYear);

        // Set default to current year
        const selectedYear = currentYear;
        const button = document.getElementById('orders-year-button');
        if (button) {
          button.textContent = 'This Year';
        }

        // Set up dropdown click handlers
        const dropdown = document.getElementById('orders-year-dropdown');
        if (dropdown) {
          // Remove existing listeners by cloning
          const newDropdown = dropdown.cloneNode(true);
          dropdown.parentNode.replaceChild(newDropdown, dropdown);
          
          newDropdown.querySelectorAll('.dropdown-item').forEach((item) => {
            item.addEventListener('click', function (e) {
              e.preventDefault();
              const year = Number(this.dataset.year);
              const button = document.getElementById('orders-year-button');
              if (button) {
                button.textContent = year === currentYear ? 'This Year' : String(year);
              }
              updateChart(allMonthlyOrders, year);
            });
          });
        }

        // Render chart with current year data by default
        updateChart(allMonthlyOrders, selectedYear);
      })
      .catch((err) => {
        totalOrdersChartEl.classList.remove('kpi-loading-chart');
        console.error('Monthly orders load failed', err);
        setChartPlaceholder('Failed to load orders analytics.');
      });
  }

  // Recent Orders (dynamic from API)
  // --------------------------------------------------------------------
  (function initRecentOrders() {
    const recentOrdersList = document.getElementById('recent-orders-list');
    if (!recentOrdersList) return;

    const SESSION_KEY = 'cdcAuthSession';

    function getSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function getApiBase(session) {
      if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
      if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/$/, '');
      const host = window.location.hostname;
      const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
      return (isLocal ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
    }

    function formatDate(dateString) {
      if (!dateString) return '';
      try {
        const date = new Date(dateString);
        const day = date.getDate();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[date.getMonth()];
        const year = String(date.getFullYear()).slice(-2);
        return `${day}-${month}-${year}`;
      } catch {
        return dateString;
      }
    }

    function formatQuantity(qty) {
      const num = Number(qty || 0);
      if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      }
      return num.toLocaleString('en-IN');
    }

    function renderRecentOrders(orders) {
      if (!Array.isArray(orders) || orders.length === 0) {
        recentOrdersList.innerHTML = `
          <li class="mb-6">
            <div class="d-flex align-items-center">
              <div class="d-flex justify-content-between w-100 flex-wrap gap-2">
                <div class="me-2">
                  <h6 class="mb-0 text-muted">No recent orders available.</h6>
                </div>
              </div>
            </div>
          </li>
        `;
        return;
      }

      recentOrdersList.innerHTML = orders.map((order) => {
        const poNo = order.PONo || 'N/A';
        const jobName = order.JobName || 'N/A';
        const orderDate = formatDate(order.OrderDate);
        const orderQty = formatQuantity(order.OrderQty);
        const displayText = `${poNo} · ${orderDate}`;

        return `
          <li class="mb-6">
            <div class="d-flex align-items-center">
              <div class="d-flex justify-content-between w-100 flex-wrap gap-2">
                <div class="me-2">
                  <h6 class="mb-0">${jobName}</h6>
                  <small class="text-body cus-dis-color">${displayText}</small>
                </div>
                <div class="d-flex align-items-center">
                  <p class="mb-0">${orderQty}</p>
                </div>
              </div>
            </div>
          </li>
        `;
      }).join('');
    }

    const session = getSession();
    if (!session?.token) {
      recentOrdersList.innerHTML = `
        <li class="mb-6">
          <div class="d-flex align-items-center">
            <div class="d-flex justify-content-between w-100 flex-wrap gap-2">
              <div class="me-2">
                <h6 class="mb-0 text-muted">Sign in to view recent orders.</h6>
              </div>
            </div>
          </div>
        </li>
      `;
      return;
    }

    const apiBase = getApiBase(session);

    // Fetch dashboard data and render recent orders
    fetch(`${apiBase}/dashboard`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...(session.sessionId ? { 'X-Session-Id': session.sessionId } : {})
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dashboard data');
        return res.json();
      })
      .then((body) => {
        const orders = Array.isArray(body?.recentOrders) ? body.recentOrders : [];
        renderRecentOrders(orders);
      })
      .catch((err) => {
        console.error('Recent orders load failed', err);
        recentOrdersList.innerHTML = `
          <li class="mb-6">
            <div class="d-flex align-items-center">
              <div class="d-flex justify-content-between w-100 flex-wrap gap-2">
                <div class="me-2">
                  <h6 class="mb-0 text-muted">Failed to load recent orders.</h6>
                </div>
              </div>
            </div>
          </li>
        `;
      });
  })();

  // OTIF Summary (dynamic from API)
  // --------------------------------------------------------------------
  (function initOtifSummary() {
    const SESSION_KEY = 'cdcAuthSession';

    function getSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function getApiBase(session) {
      if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
      if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/$/, '');
      const host = window.location.hostname;
      const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
      return (isLocal ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
    }

    function updateOtifElement(id, value) {
      const el = document.getElementById(id);
      if (el) {
        const num = Number(value || 0);
        el.textContent = Number.isFinite(num) ? num.toLocaleString('en-IN') : '--';
      }
    }

    function renderOtifSummary(otif) {
      if (!otif) {
        updateOtifElement('otif-planned-deliveries', '--');
        updateOtifElement('otif-completed-on-time', '--');
        updateOtifElement('otif-completed-with-delay', '--');
        updateOtifElement('otif-yet-undelivered', '--');
        // Update chart with 0% if no data
        updateOtifChart(0);
        return;
      }

      // Extract values explicitly to ensure correct mapping
      const plannedDeliveries = Number(otif.plannedDeliveries || 0);
      const completedOnTime = Number(otif.completedOnTime || 0);
      const completedWithDelay = Number(otif.completedWithDelay || 0);
      const yetUndelivered = Number(otif.yetUndelivered || 0);

      // Debug: Log the values being set
      console.log('Setting OTIF values:', {
        plannedDeliveries,
        completedOnTime,
        completedWithDelay,
        yetUndelivered
      });

      // Update values correctly - mapping as specified:
      // "Completed" = completedOnTime
      // "Delayed" = completedWithDelay
      // "Undelivered" = yetUndelivered
      updateOtifElement('otif-planned-deliveries', plannedDeliveries);
      updateOtifElement('otif-completed-on-time', completedOnTime);
      updateOtifElement('otif-completed-with-delay', completedWithDelay);
      updateOtifElement('otif-yet-undelivered', yetUndelivered);

      // Calculate and update percentage: completedOnTime/plannedDeliveries
      const percentage = plannedDeliveries > 0 ? Math.round((completedOnTime / plannedDeliveries) * 100) : 0;
      updateOtifChart(percentage);
    }

    function updateOtifChart(percentage) {
      const chartEl = document.querySelector('#leadsReportChart');
      if (!chartEl) return;

      // Destroy existing chart if any
      if (window.otifChartInstance) {
        try {
          window.otifChartInstance.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
        window.otifChartInstance = null;
      }

      const remaining = 100 - percentage;
      const chartConfig = {
        chart: {
          height: 170,
          width: 170,
          type: 'donut',
          parentHeightOffset: 0
        },
        labels: ['Completed', 'Remaining'],
        series: [percentage, remaining],
        colors: [config.colors.primary, '#E3DFFC'],
        stroke: {
          width: 0
        },
        dataLabels: {
          enabled: false
        },
        legend: {
          show: false
        },
        tooltip: {
          enabled: false
        },
        states: {
          hover: { filter: { type: 'none' } },
          active: { filter: { type: 'none' } }
        },
        plotOptions: {
          pie: {
            donut: {
              size: '70%',
              labels: {
                show: true,
                value: {
                  fontSize: '1.25rem',
                  fontFamily: config.fontFamily,
                  color: config.colors.headingColor,
                  fontWeight: 600,
                  offsetY: -25,
                  formatter: function () {
                    return percentage + '%';
                  }
                },
                name: {
                  show: true,
                  offsetY: 20,
                  fontFamily: config.fontFamily,
                  color: config.colors.textMuted,
                  offsetY: 15,
                  formatter: () => ['Completed', 'Task']
                },
                total: {
                  show: true,
                  fontSize: '.9375rem',
                  label: 'Completed Task',
                  color: config.colors.textMuted,
                  formatter: function () {
                    return percentage + '%';
                  }
                }
              }
            }
          }
        }
      };

      const chart = new ApexCharts(chartEl, chartConfig);
      window.otifChartInstance = chart;
      chart.render();
    }

    const session = getSession();
    if (!session?.token) {
      // Set placeholder values if not authenticated
      updateOtifElement('otif-planned-deliveries', '--');
      updateOtifElement('otif-completed-on-time', '--');
      updateOtifElement('otif-completed-with-delay', '--');
      updateOtifElement('otif-yet-undelivered', '--');
      updateOtifChart(0);
      return;
    }

    const apiBase = getApiBase(session);

    // Fetch dashboard data and render OTIF summary
    fetch(`${apiBase}/dashboard`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...(session.sessionId ? { 'X-Session-Id': session.sessionId } : {})
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dashboard data');
        return res.json();
      })
      .then((body) => {
        const otif = body?.otifSummary || null;
        // Debug: Log the OTIF data to verify
        console.log('OTIF Summary from API:', otif);
        renderOtifSummary(otif);
      })
      .catch((err) => {
        console.error('OTIF summary load failed', err);
        // Keep placeholder values on error
        updateOtifElement('otif-planned-deliveries', '--');
        updateOtifElement('otif-completed-on-time', '--');
        updateOtifElement('otif-completed-with-delay', '--');
        updateOtifElement('otif-yet-undelivered', '--');
        updateOtifChart(0);
      });
  })();

  //  For Datatable
  // --------------------------------------------------------------------
  const dt_project_table = document.querySelector('.datatable-project');

  if (dt_project_table) {
    let tableTitle = document.createElement('h5');
    tableTitle.classList.add('card-title', 'mb-0', 'text-md-start', 'text-center', 'pt-md-0', 'pt-6');
    tableTitle.innerHTML = 'Project List';
    var dt_project = new DataTable(dt_project_table, {
      ajax: assetsPath + 'json/user-profile.json', // JSON file to add data
      columns: [
        { data: 'id' },
        { data: 'id', orderable: false, render: DataTable.render.select() },
        { data: 'project_name' },
        { data: 'project_leader' },
        { data: 'id' },
        { data: 'status' },
        { data: 'id' }
      ],
      columnDefs: [
        {
          // For Responsive
          className: 'control',
          searchable: false,
          orderable: false,
          responsivePriority: 2,
          targets: 0,
          render: function (data, type, full, meta) {
            return '';
          }
        },
        {
          // For Checkboxes
          targets: 1,
          orderable: false,
          searchable: false,
          responsivePriority: 3,
          checkboxes: true,
          render: function () {
            return '<input type="checkbox" class="dt-checkboxes form-check-input">';
          },
          checkboxes: {
            selectAllRender: '<input type="checkbox" class="form-check-input">'
          }
        },
        {
          // Avatar image/badge, Name and post
          targets: 2,
          responsivePriority: 4,
          render: function (data, type, full, meta) {
            var userImg = full['project_img'],
              name = full['project_name'],
              date = full['date'];
            var output;
            if (userImg) {
              // For Avatar image
              output =
                '<img src="' + assetsPath + 'img/icons/brands/' + userImg + '" alt="Avatar" class="rounded-circle">';
            } else {
              // For Avatar badge
              var stateNum = Math.floor(Math.random() * 6);
              var states = ['success', 'danger', 'warning', 'info', 'primary', 'secondary'];
              var state = states[stateNum],
                initials = name.match(/\b\w/g) || [];
              initials = ((initials.shift() || '') + (initials.pop() || '')).toUpperCase();
              output = '<span class="avatar-initial rounded-circle bg-label-' + state + '">' + initials + '</span>';
            }
            // Creates full output for row
            var rowOutput =
              '<div class="d-flex justify-content-left align-items-center">' +
              '<div class="avatar-wrapper">' +
              '<div class="avatar avatar-sm me-3">' +
              output +
              '</div>' +
              '</div>' +
              '<div class="d-flex flex-column gap-50">' +
              '<span class="text-truncate fw-medium text-heading">' +
              name +
              '</span>' +
              '<small class="text-truncate">' +
              date +
              '</small>' +
              '</div>' +
              '</div>';
            return rowOutput;
          }
        },
        {
          // Task
          targets: 3,
          render: function (data, type, full, meta) {
            var task = full['project_leader'];
            return '<span class="text-heading">' + task + '</span>';
          }
        },
        {
          // Teams
          targets: 4,
          orderable: false,
          searchable: false,
          render: function (data, type, full, meta) {
            const team = full['team'];
            let teamItem = '';
            let teamCount = 0;
            // Iterate through team members and generate the list items
            for (let i = 0; i < team.length; i++) {
              teamItem += `
                <li data-bs-toggle="tooltip" data-popup="tooltip-custom" data-bs-placement="top" title="Kim Karlos" class="avatar avatar-sm pull-up">
                  <img class="rounded-circle" src="${assetsPath}img/avatars/${team[i]}" alt="Avatar">
                </li>
              `;
              teamCount++;
              if (teamCount > 2) break;
            }
            // Check if there are more than 2 team members, and add the remaining avatars
            if (teamCount > 2) {
              const remainingAvatars = team.length - 3;
              if (remainingAvatars > 0) {
                teamItem += `
                  <li class="avatar avatar-sm">
                    <span class="avatar-initial rounded-circle pull-up" data-bs-toggle="tooltip" data-bs-placement="top" title="${remainingAvatars} more">+${remainingAvatars}</span>
                  </li>
                `;
              }
            }
            // Combine the team items into the final output
            const teamOutput = `
              <div class="d-flex align-items-center">
                <ul class="list-unstyled d-flex align-items-center avatar-group mb-0 z-2">
                  ${teamItem}
                </ul>
              </div>
            `;
            return teamOutput;
          }
        },
        {
          // Label
          targets: -2,
          render: function (data, type, full, meta) {
            const statusNumber = full['status'];
            return `
              <div class="d-flex align-items-center">
                <div class="progress w-100 me-3" style="height: 6px;">
                  <div class="progress-bar" style="width: ${statusNumber}" aria-valuenow="${statusNumber}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <span class="text-heading">${statusNumber}</span>
              </div>
            `;
          }
        },
        {
          // Actions
          targets: -1,
          searchable: false,
          title: 'Action',
          orderable: false,
          render: function (data, type, full, meta) {
            return (
              '<div class="d-inline-block">' +
              '<a href="javascript:;" class="btn btn-icon btn-text-secondary waves-effect rounded-pill dropdown-toggle hide-arrow" data-bs-toggle="dropdown"><i class="icon-base ti tabler-dots-vertical icon-22px"></i></a>' +
              '<div class="dropdown-menu dropdown-menu-end m-0">' +
              '<a href="javascript:;" class="dropdown-item">Details</a>' +
              '<a href="javascript:;" class="dropdown-item">Archive</a>' +
              '<div class="dropdown-divider"></div>' +
              '<a href="javascript:;" class="dropdown-item text-danger delete-record">Delete</a>' +
              '</div>' +
              '</div>'
            );
          }
        }
      ],
      select: {
        style: 'multi',
        selector: 'td:nth-child(2)'
      },
      order: [[2, 'desc']],
      layout: {
        topStart: {
          rowClass: 'row mx-md-3 my-0 justify-content-between',
          features: [tableTitle]
        },
        topEnd: {
          search: {
            placeholder: 'Search Project',
            text: '_INPUT_'
          }
        },
        bottomStart: {
          rowClass: 'row mx-3 justify-content-between',
          features: ['info']
        },
        bottomEnd: 'paging'
      },
      displayLength: 5,
      language: {
        paginate: {
          next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
          previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
          first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
          last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
        }
      },
      // For responsive popup
      responsive: {
        details: {
          display: DataTable.Responsive.display.modal({
            header: function (row) {
              const data = row.data();
              return 'Details of ' + data['project_name'];
            }
          }),
          type: 'column',
          renderer: function (api, rowIdx, columns) {
            const data = columns
              .map(function (col) {
                return col.title !== '' // Do not show row in modal popup if title is blank (for check box)
                  ? `<tr data-dt-row="${col.rowIndex}" data-dt-column="${col.columnIndex}">
                      <td>${col.title}:</td>
                      <td>${col.data}</td>
                    </tr>`
                  : '';
              })
              .join('');

            if (data) {
              const div = document.createElement('div');
              div.classList.add('table-responsive');
              const table = document.createElement('table');
              div.appendChild(table);
              table.classList.add('table');
              const tbody = document.createElement('tbody');
              tbody.innerHTML = data;
              table.appendChild(tbody);
              return div;
            }
            return false;
          }
        }
      }
    });
    //? The 'delete-record' class is necessary for the functionality of the following code.
    document.addEventListener('click', function (e) {
      if (e.target.classList.contains('delete-record')) {
        dt_project.row(e.target.closest('tr')).remove().draw();
        const modalEl = document.querySelector('.dtr-bs-modal');
        if (modalEl && modalEl.classList.contains('show')) {
          const modal = bootstrap.Modal.getInstance(modalEl);
          modal?.hide();
        }
      }
    });
  }

  // Filter form control to default size
  // ? setTimeout used for project-list table initialization
  setTimeout(() => {
    const elementsToModify = [
      { selector: '.dt-search .form-control', classToRemove: 'form-control-sm' },
      { selector: '.dt-length .form-select', classToRemove: 'form-select-sm', classToAdd: 'ms-0' },
      { selector: '.dt-length', classToAdd: 'mb-md-6 mb-0' },
      { selector: '.dt-buttons', classToAdd: 'justify-content-center' },
      { selector: '.dt-layout-table', classToRemove: 'row mt-2' },
      { selector: '.dt-layout-end', classToAdd: 'gap-md-2 gap-0 mt-0' },
      { selector: '.dt-layout-full', classToRemove: 'col-md col-12', classToAdd: 'table-responsive' }
    ];

    // Delete record
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
})();
