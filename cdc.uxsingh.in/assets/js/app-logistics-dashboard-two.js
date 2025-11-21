/**
 *  Logistics Dashboard
 */

'use strict';

document.addEventListener('DOMContentLoaded', function (e) {
    let labelColor, headingColor, borderColor, legendColor, fontFamily;

    labelColor = config.colors.textMuted;
    headingColor = config.colors.headingColor;
    borderColor = config.colors.borderColor;
    legendColor = config.colors.bodyColor;
    fontFamily = config.fontFamily;

    // Chart Colors
    const chartColors = {
        donut: {
            series1: config.colors.success,
            series2: 'color-mix(in sRGB, ' + config.colors.success + ' 80%, ' + config.colors.cardColor + ')',
            series3: 'color-mix(in sRGB, ' + config.colors.success + ' 60%, ' + config.colors.cardColor + ')',
            series4: 'color-mix(in sRGB, ' + config.colors.success + ' 40%, ' + config.colors.cardColor + ')'
        },
        line: {
            series1: config.colors.primary,
            series2: config.colors.primary,
            series3: '#7367f029'
        }
    };

    // Shipment statistics Chart
    // --------------------------------------------------------------------

    // Range-wise data
    //     const rangeData = {
    //         'This Year': [58, 65, 73, 48, 66, 78, 88, 80, 91, 95, 71, 60], // monthly data
    //         'Last 30 Days': [12, 15, 18, 14, 20, 22, 25, 23, 28, 30, 27, 26],
    //         'Last 3 Months': [45, 48, 52, 55, 60, 62, 66, 64, 68, 70, 65, 63],
    //         'Last 6 Months': [38, 42, 46, 48, 50, 55, 58, 60, 62, 65, 61, 59],
    //         'Last Year': [40, 50, 55, 60, 70, 75, 85, 90, 88, 92, 68, 50]
    //     };
    //     let shipment; // Declare outside so it's accessible globally

    //     const shipmentEl = document.querySelector('#shipmentStatisticsChart'),
    //         shipmentConfig = {
    //             series: [
    //                 {
    //                     name: 'Orders',
    //                     type: 'column',
    //                     // data: [58, 65, 73, 48, 66, 78, 88, 80, 91, 95, 71, 60]
    //                     data: yearlyData[2024] // default year
    //                 },
    //                 // {
    //                 //   name: 'Delivery',
    //                 //   type: 'line',
    //                 //   data: [23, 28, 23, 32, 28, 44, 32, 38, 26, 34]
    //                 // }
    //             ],
    //             chart: {
    //                 height: 320,
    //                 type: 'line',
    //                 stacked: false,
    //                 parentHeightOffset: 0,
    //                 toolbar: { show: false },
    //                 zoom: { enabled: false }
    //             },
    //             markers: {
    //                 size: 5,
    //                 colors: [config.colors.white],
    //                 strokeColors: chartColors.line.series2,
    //                 hover: { size: 6 },
    //                 borderRadius: 4
    //             },
    //             stroke: {
    //                 curve: 'smooth',
    //                 width: [0, 3],
    //                 lineCap: 'round'
    //             },
    //             legend: {
    //                 show: true,
    //                 position: 'bottom',
    //                 markers: {
    //                     size: 4,
    //                     strokeWidth: 0,
    //                     shape: 'circle',
    //                     offsetX: -3
    //                 },
    //                 height: 40,
    //                 itemMargin: {
    //                     horizontal: 10,
    //                     vertical: 0
    //                 },
    //                 fontSize: '15px',
    //                 fontFamily: fontFamily,
    //                 fontWeight: 400,
    //                 labels: {
    //                     colors: headingColor,
    //                     useSeriesColors: false
    //                 },
    //                 offsetY: 8
    //             },
    //             grid: {
    //                 strokeDashArray: 8,
    //                 borderColor
    //             },
    //             colors: [chartColors.line.series1, chartColors.line.series2],
    //             fill: {
    //                 opacity: [1, 1]
    //             },
    //             plotOptions: {
    //                 bar: {
    //                     columnWidth: '30%',
    //                     startingShape: 'rounded',
    //                     endingShape: 'rounded',
    //                     borderRadius: 4
    //                 }
    //             },
    //             dataLabels: { enabled: false },
    //             xaxis: {
    //                 tickAmount: 10,
    //                 categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    //                 labels: {
    //                     style: {
    //                         colors: labelColor,
    //                         fontSize: '13px',
    //                         fontFamily: fontFamily,
    //                         fontWeight: 400
    //                     }
    //                 },
    //                 axisBorder: { show: false },
    //                 axisTicks: { show: false }
    //             },
    //             yaxis: {
    //                 tickAmount: 4,
    //                 min: 20,
    //                 max: 100,
    //                 labels: {
    //                     style: {
    //                         colors: labelColor,
    //                         fontSize: '13px',
    //                         fontFamily: fontFamily,
    //                         fontWeight: 400
    //                     },
    //                     formatter: function (val) {
    //                         return val + 'k';
    //                     }
    //                 }
    //             },
    //             responsive: [
    //                 {
    //                     breakpoint: 1400,
    //                     options: {
    //                         chart: {
    //                             height: 320
    //                         },
    //                         xaxis: {
    //                             labels: {
    //                                 style: {
    //                                     fontSize: '10px'
    //                                 }
    //                             }
    //                         },
    //                         legend: {
    //                             itemMargin: {
    //                                 vertical: 0,
    //                                 horizontal: 10
    //                             },
    //                             fontSize: '13px',
    //                             offsetY: 12
    //                         }
    //                     }
    //                 },
    //                 {
    //                     breakpoint: 1025,
    //                     options: {
    //                         chart: { height: 415 },
    //                         plotOptions: { bar: { columnWidth: '50%' } }
    //                     }
    //                 },
    //                 {
    //                     breakpoint: 982,
    //                     options: { plotOptions: { bar: { columnWidth: '30%' } } }
    //                 },
    //                 {
    //                     breakpoint: 480,
    //                     options: {
    //                         chart: { height: 250 },
    //                         legend: { offsetY: 7 }
    //                     }
    //                 }
    //             ]
    //         };

    //     // if (typeof shipmentEl !== undefined && shipmentEl !== null) {
    //     //     const shipment = new ApexCharts(shipmentEl, shipmentConfig);
    //     //     shipment.render();
    //     // }

    //     // Default chart load - "This Year"
    // shipmentConfig.series[0].data = rangeData['This Year'];

    //     // init chart
    //     if (shipmentEl) {
    //         shipment = new ApexCharts(shipmentEl, shipmentConfig);
    //         shipment.render();
    //     }

    //     // Dropdown click listener
    //     document.querySelectorAll('.dropdown-menu .dropdown-item').forEach(item => {
    //         item.addEventListener('click', function () {
    //             const year = this.textContent.trim();

    //             // Update dropdown button text
    //             document.querySelector('.btn-group .btn:first-child').textContent = year;

    //             // Update chart series
    //             shipment.updateSeries([
    //                 {
    //                     name: 'Orders',
    //                     type: 'column',
    //                     data: rangeData[label] || []
    //                 }
    //             ]);
    //         });
    //     });

    // Shipment statistics Chart
    // --------------------------------------------------------------------

    // Range-wise data
    const rangeData = {
        'This Year': [58, 65, 73, 48, 66, 78, 88, 80, 91, 95, 71, 60], // monthly data
        'Last 30 Days': [12, 15, 18, 14, 20, 22, 25, 23, 28, 30, 27, 26],
        'Last 3 Months': [45, 48, 52, 55, 60, 62, 66, 64, 68, 70, 65, 63],
        'Last 6 Months': [38, 42, 46, 48, 50, 55, 58, 60, 62, 65, 61, 59],
        'Last Year': [40, 50, 55, 60, 70, 75, 85, 90, 88, 92, 68, 50]
    };

    let shipment; // Declare outside so it's accessible globally

    const shipmentEl = document.querySelector('#shipmentStatisticsChart'),
        shipmentConfig = {
            series: [
                {
                    name: 'Orders',
                    type: 'column',
                    data: rangeData['This Year'] // default
                }
            ],
            chart: {
                height: 320,
                type: 'line',
                stacked: false,
                parentHeightOffset: 0,
                toolbar: { show: false },
                zoom: { enabled: false }
            },
            markers: {
                size: 5,
                colors: [config.colors.white],
                strokeColors: chartColors.line.series2,
                hover: { size: 6 },
                borderRadius: 4
            },
            stroke: {
                curve: 'smooth',
                width: [0, 3],
                lineCap: 'round'
            },
            legend: {
                show: true,
                position: 'bottom',
                markers: {
                    size: 4,
                    strokeWidth: 0,
                    shape: 'circle',
                    offsetX: -3
                },
                height: 40,
                itemMargin: {
                    horizontal: 10,
                    vertical: 0
                },
                fontSize: '15px',
                fontFamily: fontFamily,
                fontWeight: 400,
                labels: {
                    colors: headingColor,
                    useSeriesColors: false
                },
                offsetY: 8
            },
            grid: {
                strokeDashArray: 8,
                borderColor
            },
            colors: [chartColors.line.series1, chartColors.line.series2],
            fill: {
                opacity: [1, 1]
            },
            plotOptions: {
                bar: {
                    columnWidth: '30%',
                    startingShape: 'rounded',
                    endingShape: 'rounded',
                    borderRadius: 4
                }
            },
            dataLabels: { enabled: false },
            xaxis: {
                tickAmount: 10,
                categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                labels: {
                    style: {
                        colors: labelColor,
                        fontSize: '13px',
                        fontFamily: fontFamily,
                        fontWeight: 400
                    }
                },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                tickAmount: 4,
                min: 20,
                max: 100,
                labels: {
                    style: {
                        colors: labelColor,
                        fontSize: '13px',
                        fontFamily: fontFamily,
                        fontWeight: 400
                    },
                    formatter: function (val) {
                        return val + 'k';
                    }
                }
            },
            responsive: [
                {
                    breakpoint: 1400,
                    options: {
                        chart: { height: 320 },
                        xaxis: {
                            labels: { style: { fontSize: '10px' } }
                        },
                        legend: {
                            itemMargin: { vertical: 0, horizontal: 10 },
                            fontSize: '13px',
                            offsetY: 12
                        }
                    }
                },
                {
                    breakpoint: 1025,
                    options: {
                        chart: { height: 415 },
                        plotOptions: { bar: { columnWidth: '50%' } }
                    }
                },
                {
                    breakpoint: 982,
                    options: { plotOptions: { bar: { columnWidth: '30%' } } }
                },
                {
                    breakpoint: 480,
                    options: {
                        chart: { height: 250 },
                        legend: { offsetY: 7 }
                    }
                }
            ]
        };

    // Init chart - DISABLED: Chart is now dynamically loaded from API in dashboards-analytics.js
    // if (shipmentEl) {
    //     shipment = new ApexCharts(shipmentEl, shipmentConfig);
    //     shipment.render();
    // }

    // Dropdown click listener - DISABLED: Chart is now dynamically loaded from API
    // document.querySelectorAll('.toa.dropdown-menu .dropdown-item').forEach(item => {
    //     item.addEventListener('click', function () {
    //         const label = this.textContent.trim(); // FIX: Use 'label', not 'year'

    //         // Update dropdown button text
    //         document.querySelector('.btn-group .btn:first-child').textContent = label;

    //         // Update chart series
    //         shipment.updateSeries([
    //             {
    //                 name: 'Orders',
    //                 type: 'column',
    //                 data: rangeData[label] || []
    //             }
    //         ]);
    //     });
    // });


    // Reasons for delivery exceptions Chart
    // --------------------------------------------------------------------
    // const deliveryExceptionsChartE1 = document.querySelector('#deliveryExceptionsChart'),
    //     deliveryExceptionsChartConfig = {
    //         chart: {
    //             height: 391,
    //             parentHeightOffset: 0,
    //             type: 'donut'
    //         },
    //         labels: ['Incorrect address', 'Weather conditions', 'Federal Holidays', 'Damage during transit'],
    //         series: [13, 25, 22, 40],
    //         colors: [
    //             chartColors.donut.series1,
    //             chartColors.donut.series2,
    //             chartColors.donut.series3,
    //             chartColors.donut.series4
    //         ],
    //         stroke: {
    //             width: 0
    //         },
    //         dataLabels: {
    //             enabled: false,
    //             formatter: function (val, opt) {
    //                 return parseInt(val) + '%';
    //             }
    //         },
    //         legend: {
    //             show: true,
    //             position: 'bottom',
    //             offsetY: 15,
    //             markers: {
    //                 width: 8,
    //                 height: 8,
    //                 offsetX: -3
    //             },
    //             itemMargin: {
    //                 horizontal: 15,
    //                 vertical: 8
    //             },
    //             fontSize: '13px',
    //             fontFamily: fontFamily,
    //             fontWeight: 400,
    //             labels: {
    //                 colors: headingColor,
    //                 useSeriesColors: false
    //             }
    //         },
    //         tooltip: {
    //             theme: 'dark'
    //         },
    //         grid: {
    //             padding: {
    //                 top: 15
    //             }
    //         },
    //         plotOptions: {
    //             pie: {
    //                 donut: {
    //                     size: '77%',
    //                     labels: {
    //                         show: true,
    //                         value: {
    //                             fontSize: '24px',
    //                             fontFamily: fontFamily,
    //                             color: headingColor,
    //                             fontWeight: 500,
    //                             offsetY: -20,
    //                             formatter: function (val) {
    //                                 return parseInt(val) + '%';
    //                             }
    //                         },
    //                         name: {
    //                             offsetY: 30,
    //                             fontFamily: fontFamily
    //                         },
    //                         total: {
    //                             show: true,
    //                             fontSize: '15px',
    //                             fontFamily: fontFamily,
    //                             color: legendColor,
    //                             label: 'AVG. Exceptions',
    //                             formatter: function (w) {
    //                                 return '30%';
    //                             }
    //                         }
    //                     }
    //                 }
    //             }
    //         },
    //         responsive: [
    //             {
    //                 breakpoint: 420,
    //                 options: {
    //                     chart: {
    //                         height: 360
    //                     }
    //                 }
    //             }
    //         ]
    //     };
    // if (typeof deliveryExceptionsChartE1 !== undefined && deliveryExceptionsChartE1 !== null) {
    //     const deliveryExceptionsChart = new ApexCharts(deliveryExceptionsChartE1, deliveryExceptionsChartConfig);
    //     deliveryExceptionsChart.render();
    // }

    //   // DataTable (js)
    //   // --------------------------------------------------------------------
    //   const dt_dashboard_table = document.querySelector('.dt-route-vehicles');

    //   // On route vehicles DataTable
    //   if (dt_dashboard_table) {
    //     var dt_dashboard = new DataTable(dt_dashboard_table, {
    //       ajax: assetsPath + 'json/logistics-dashboard.json',
    //       columns: [
    //         { data: 'id' },
    //         { data: 'id', orderable: false, render: DataTable.render.select() },
    //         { data: 'location' },
    //         { data: 'start_city' },
    //         { data: 'end_city' },
    //         { data: 'warnings' },
    //         { data: 'progress' }
    //       ],
    //       columnDefs: [
    //         {
    //           // For Responsive
    //           className: 'control',
    //           orderable: false,
    //           searchable: false,
    //           responsivePriority: 2,
    //           targets: 0,
    //           render: function (data, type, full, meta) {
    //             return '';
    //           }
    //         },
    //         {
    //           // For Checkboxes
    //           targets: 1,
    //           orderable: false,
    //           searchable: false,
    //           responsivePriority: 3,
    //           checkboxes: true,
    //           render: function () {
    //             return '<input type="checkbox" class="dt-checkboxes form-check-input">';
    //           },
    //           checkboxes: {
    //             selectAllRender: '<input type="checkbox" class="form-check-input">'
    //           }
    //         },
    //         {
    //           targets: 2,
    //           responsivePriority: 1,
    //           render: (data, type, full) => {
    //             const location = full['location'];

    //             return `
    //                   <div class="d-flex justify-content-start align-items-center user-name">
    //                       <div class="avatar-wrapper">
    //                           <div class="avatar me-4">
    //                               <span class="avatar-initial rounded-circle bg-label-secondary">
    //                                   <i class="icon-base ti tabler-car icon-lg"></i>
    //                               </span>
    //                           </div>
    //                       </div>
    //                       <div class="d-flex flex-column">
    //                           <a class="text-heading text-nowrap fw-medium" href="app-logistics-fleet.html">VOL-${location}</a>
    //                       </div>
    //                   </div>
    //               `;
    //           }
    //         },
    //         {
    //           targets: 3,
    //           render: (data, type, full) => {
    //             const { start_city, start_country } = full;

    //             return `
    //                   <div class="text-body">
    //                       ${start_city}, ${start_country}
    //                   </div>
    //               `;
    //           }
    //         },
    //         {
    //           targets: 4,
    //           render: (data, type, full) => {
    //             const { end_city, end_country } = full;

    //             return `
    //                   <div class="text-body">
    //                       ${end_city}, ${end_country}
    //                   </div>
    //               `;
    //           }
    //         },
    //         {
    //           targets: -2,
    //           render: (data, type, full) => {
    //             const statusNumber = full['warnings'];
    //             const status = {
    //               1: { title: 'No Warnings', class: 'bg-label-success' },
    //               2: { title: 'Temperature Not Optimal', class: 'bg-label-warning' },
    //               3: { title: 'Ecu Not Responding', class: 'bg-label-danger' },
    //               4: { title: 'Oil Leakage', class: 'bg-label-info' },
    //               5: { title: 'Fuel Problems', class: 'bg-label-primary' }
    //             };

    //             const warning = status[statusNumber];

    //             if (!warning) {
    //               return data;
    //             }

    //             return `
    //                   <span class="badge rounded ${warning.class}">
    //                       ${warning.title}
    //                   </span>
    //               `;
    //           }
    //         },
    //         {
    //           targets: -1,
    //           render: (data, type, full) => {
    //             const progress = full['progress'];

    //             return `
    //                   <div class="d-flex align-items-center">
    //                       <div class="progress w-100" style="height: 8px;">
    //                           <div
    //                               class="progress-bar"
    //                               role="progressbar"
    //                               style="width: ${progress}%"
    //                               aria-valuenow="${progress}"
    //                               aria-valuemin="0"
    //                               aria-valuemax="100">
    //                           </div>
    //                       </div>
    //                       <div class="text-body ms-3">${progress}%</div>
    //                   </div>
    //               `;
    //           }
    //         }
    //       ],
    //       select: {
    //         style: 'multi',
    //         selector: 'td:nth-child(2)'
    //       },
    //       order: [2, 'asc'],
    //       layout: {
    //         topStart: {
    //           rowClass: '',
    //           features: []
    //         },
    //         topEnd: {},
    //         bottomStart: {
    //           rowClass: 'row mx-3 justify-content-between',
    //           features: ['info']
    //         },
    //         bottomEnd: 'paging'
    //       },
    //       lengthMenu: [5],
    //       language: {
    //         paginate: {
    //           next: '<i class="icon-base ti tabler-chevron-right scaleX-n1-rtl icon-18px"></i>',
    //           previous: '<i class="icon-base ti tabler-chevron-left scaleX-n1-rtl icon-18px"></i>',
    //           first: '<i class="icon-base ti tabler-chevrons-left scaleX-n1-rtl icon-18px"></i>',
    //           last: '<i class="icon-base ti tabler-chevrons-right scaleX-n1-rtl icon-18px"></i>'
    //         }
    //       },
    //       responsive: {
    //         details: {
    //           display: DataTable.Responsive.display.modal({
    //             header: function (row) {
    //               const data = row.data();
    //               return 'Details of ' + data['location'];
    //             }
    //           }),
    //           type: 'column',
    //           renderer: function (api, rowIdx, columns) {
    //             const data = columns
    //               .map(function (col) {
    //                 return col.title !== '' // Do not show row in modal popup if title is blank (for check box)
    //                   ? `<tr data-dt-row="${col.rowIndex}" data-dt-column="${col.columnIndex}">
    //                       <td>${col.title}:</td>
    //                       <td>${col.data}</td>
    //                     </tr>`
    //                   : '';
    //               })
    //               .join('');

    //             if (data) {
    //               const table = document.createElement('table');
    //               table.classList.add('table', 'datatables-basic', 'mb-2');
    //               const tbody = document.createElement('tbody');
    //               tbody.innerHTML = data;
    //               table.appendChild(tbody);
    //               return table;
    //             }
    //             return false;
    //           }
    //         }
    //       }
    //     });
    //   }

    //   setTimeout(() => {
    //     const elementsToModify = [
    //       { selector: '.dt-layout-start', classToAdd: 'my-0' },
    //       { selector: '.dt-layout-end', classToAdd: 'my-0' },
    //       { selector: '.dt-layout-table', classToRemove: 'row mt-2', classToAdd: 'mt-n2' },
    //       { selector: '.dt-layout-full', classToRemove: 'col-md col-12', classToAdd: 'table-responsive' }
    //     ];

    //     // Delete record
    //     elementsToModify.forEach(({ selector, classToRemove, classToAdd }) => {
    //       document.querySelectorAll(selector).forEach(element => {
    //         if (classToRemove) {
    //           classToRemove.split(' ').forEach(className => element.classList.remove(className));
    //         }
    //         if (classToAdd) {
    //           classToAdd.split(' ').forEach(className => element.classList.add(className));
    //         }
    //       });
    //     });
    //   }, 100);

    // DataTable (js)
    // --------------------------------------------------------------------
    const dt_dashboard_table = document.querySelector('.dt-route-vehicles');

    // On PO Table
    if (dt_dashboard_table) {
        // Function to fetch pending approvals from API
        function fetchPendingApprovals(data, callback, settings) {
            const SESSION_KEY = 'cdcAuthSession';
            try {
                const raw = localStorage.getItem(SESSION_KEY);
                const session = raw ? JSON.parse(raw) : null;
                
                if (!session?.token) {
                    callback({ data: [] });
                    return;
                }

                function getApiBase() {
                    if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
                    if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/$/, '');
                    const host = window.location.hostname;
                    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
                    return (isLocal ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
                }

                const apiBase = getApiBase();
                fetch(`${apiBase}/dashboard`, {
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${session.token}`,
                        ...(session.sessionId ? { 'X-Session-Id': session.sessionId } : {})
                    }
                })
                .then(res => {
                    if (!res.ok) throw new Error('Failed to load dashboard data');
                    return res.json();
                })
                .then(body => {
                    const approvals = Array.isArray(body?.pendingApprovals) ? body.pendingApprovals : [];
                    // Transform API data to match DataTable expected format
                    const transformed = approvals.map((item, index) => {
                        // Format date: PODate
                        let formattedDate = 'N/A';
                        if (item.PODate) {
                            try {
                                const date = new Date(item.PODate);
                                formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                            } catch (e) {
                                formattedDate = item.PODate;
                            }
                        }
                        
                        return {
                            id: index + 1,
                            po_details: item.PONumber || 'N/A',
                            po_date: formattedDate,
                            item: item.ItemName || 'N/A',
                            approval_status: item.FinallyApproved || 'N/A',
                            approve: item.SoftApprovalLink || '#'
                        };
                    });
                    callback({ data: transformed });
                })
                .catch(err => {
                    console.error('Failed to load pending approvals:', err);
                    callback({ data: [] });
                });
            } catch (err) {
                console.error('Error fetching pending approvals:', err);
                callback({ data: [] });
            }
        }

        var dt_dashboard = new DataTable(dt_dashboard_table, {
            ajax: fetchPendingApprovals,

            paging: false,           // 🚫 disables pagination
            lengthChange: false,     // 🚫 disables "Show X entries"
            searching: true,        // (optional)
            info: false,             // (optional)
            responsive: false,
            scrollX: true,

            columns: [
                // { data: null }, // For control column
                // { data: null }, // For checkboxes
                // { data: 'id' },
                { data: 'id', orderable: false, render: DataTable.render.select() },
                { data: 'po_details' },
                { data: 'po_date' },
                { data: 'item' },
                { data: 'approval_status' },
                { data: 'approve' }
            ],
            dom: '<"dt-custom-search-vehicles"f>rt<"bottom"lip>',
            initComplete: function () {
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
                    // For Checkboxes
                    targets: 0,
                    orderable: false,
                    searchable: false,
                    responsivePriority: 2,
                    checkboxes: true,
                    render: () => '<input type="checkbox" class="dt-checkboxes form-check-input">',
                    checkboxes: {
                        selectAllRender: '<input type="checkbox" class="form-check-input">'
                    }
                },
                {
                    // Approval Status Badge
                    targets: 4,
                    render: (data) => {
                        const statusMap = {
                            'Yes': 'success',
                            'No': 'warning',
                            'Approved': 'success',
                            'Pending': 'warning',
                            'Rejected': 'danger'
                        };
                        const badgeClass = statusMap[data] || 'secondary';
                        const displayText = data === 'Yes' ? 'Approved' : (data === 'No' ? 'Pending' : data);
                        return `<span class="badge bg-label-${badgeClass}">${displayText}</span>`;
                    }
                },
                {
                    // Approval Link Button
                    targets: 5,
                    render: (data) => {
                        if (!data || data === '#') return 'N/A';
                        return `<a href="${data}" class="" target="_blank" style="text-decoration: underline;">${data}</a>`;
                    }
                }
            ],
            select: {
                style: 'multi',
                selector: 'td:nth-child(2)'
            },
            order: [[2, 'asc']],
            lengthMenu: [5],
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

    // Pending Files

    // DataTable (js) Pending Files
    // --------------------------------------------------------------------
    const dt_dashboard_table_pending_files = document.querySelector('.dt-pending-files');

    // On PO Table
    if (dt_dashboard_table_pending_files) {
        // Function to fetch pending files from API
        function fetchPendingFiles(data, callback, settings) {
            const SESSION_KEY = 'cdcAuthSession';
            try {
                const raw = localStorage.getItem(SESSION_KEY);
                const session = raw ? JSON.parse(raw) : null;
                
                if (!session?.token) {
                    callback({ data: [] });
                    return;
                }

                function getApiBase() {
                    if (session?.apiBase) return String(session.apiBase).replace(/\/$/, '');
                    if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/$/, '');
                    const host = window.location.hostname;
                    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
                    return (isLocal ? 'http://localhost:8080/api' : 'https://cdc-customer-portal-backend.onrender.com/api').replace(/\/$/, '');
                }

                const apiBase = getApiBase();
                fetch(`${apiBase}/dashboard`, {
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${session.token}`,
                        ...(session.sessionId ? { 'X-Session-Id': session.sessionId } : {})
                    }
                })
                .then(res => {
                    if (!res.ok) throw new Error('Failed to load dashboard data');
                    return res.json();
                })
                .then(body => {
                    const files = Array.isArray(body?.pendingFiles) ? body.pendingFiles : [];
                    // Transform API data to match DataTable expected format
                    const transformed = files.map((item, index) => {
                        // Format date: PODate
                        let formattedDate = 'N/A';
                        if (item.PODate) {
                            try {
                                const date = new Date(item.PODate);
                                formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                            } catch (e) {
                                formattedDate = item.PODate;
                            }
                        }
                        
                        return {
                            id: index + 1,
                            po_details: item.PONumber || 'N/A',
                            po_date: formattedDate,
                            item: item.ItemName || 'N/A',
                            file_status: item.FileStatus || 'N/A'
                        };
                    });
                    callback({ data: transformed });
                })
                .catch(err => {
                    console.error('Failed to load pending files:', err);
                    callback({ data: [] });
                });
            } catch (err) {
                console.error('Error fetching pending files:', err);
                callback({ data: [] });
            }
        }

        var dt_dashboard = new DataTable(dt_dashboard_table_pending_files, {
            ajax: fetchPendingFiles,

            paging: false,
            lengthChange: false,
            searching: true,
            info: false,
            responsive: false,
            scrollX: true,
            
            columns: [
                // { data: 'id' },
                { data: 'id', orderable: false, render: DataTable.render.select() },
                { data: 'po_details' },
                { data: 'po_date' },
                { data: 'item' },
                { data: 'file_status' }
            ],

            dom: '<"dt-custom-search"f>rt<"bottom"lip>',

            initComplete: function () {
                $('.dt-custom-search').appendTo('.search-here-pending-files');

                // Remove label text and hide label element
                $('.search-here-pending-files label').contents().filter(function () {
                    return this.nodeType === 3;
                }).remove();
                $('.search-here-pending-files label').hide();

                const $input = $('.search-here-pending-files input[type="search"]');
                $input.attr('placeholder', 'Search...');
                $input.addClass('form-control');

                // Wrap in Bootstrap input group with search icon
                $input.wrap('<div class="input-group"></div>');
                $input.before(`<span class="input-group-text"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="6.66667" cy="6.66667" r="4.66667" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 14L10 10" stroke="#2F2B3D" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg></span>`);
            },

            columnDefs: [
                // {
                //     // Responsive control
                //     className: 'control',
                //     orderable: false,
                //     searchable: false,
                //     responsivePriority: 1,
                //     targets: 0,
                //     render: () => ''
                // },
                {
                    // Checkboxes
                    targets: 0,
                    orderable: false,
                    searchable: false,
                    checkboxes: {
                        selectRow: true,
                        selectAllRender: '<input type="checkbox" class="form-check-input" />'
                    },
                    render: () => '<input type="checkbox" class="dt-checkboxes form-check-input" />'
                },
                {
                    // File Status Badge
                    targets: 4,
                    render: (data) => {
                        const statusMap = {
                            'Approved': 'success',
                            'Pending': 'warning',
                            'Rejected': 'danger'
                        };
                        const badgeClass = statusMap[data] || 'secondary';
                        return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                    }
                }
            ],

            select: {
                style: 'multi',
                selector: 'td:nth-child(2)'
            },

            order: [[2, 'asc']],
            lengthMenu: [5],

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
            //                 .map(col =>
            //                     col.title !== ''
            //                         ? `<tr data-dt-row="${col.rowIndex}" data-dt-column="${col.columnIndex}">
            //         <td>${col.title}:</td>
            //         <td>${col.data}</td>
            //       </tr>`
            //                         : ''
            //                 )
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
    }

    // Optional: Layout class adjustments
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


});
