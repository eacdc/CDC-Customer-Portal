/**
 *  Paper Statement Screen
 */

'use strict';

document.addEventListener('DOMContentLoaded', function (e) {

    // DataTable (js)
    // --------------------------------------------------------------------
    const dt_dashboard_table = document.querySelector('.paper-statement-received');

    // On PO Table
    if (dt_dashboard_table) {
        var dt_dashboard = new DataTable(dt_dashboard_table, {
            ajax: assetsPath + 'json/paper-statement-received.json',

            // dom: '<"top">rt<"bottom"i p><"clear">',

            paging: true,           // 🚫 disables pagination
            lengthChange: true,     // 🚫 disables "Show X entries"
            searching: true,        // (optional)
            info: true,             // (optional)
            responsive: false,
            scrollX: true,

            columns: [
                // { data: null }, // For control column
                // { data: null }, // For checkboxes
                // { data: 'id' },
                { data: 'id', orderable: false, render: DataTable.render.select() },
                { data: 'date' },
                { data: 'paper_details' },
                { data: 'vender' },
                { data: 'summary' }
            ],
            dom: '<"dt-custom-search-ps-received"f>rt<"bottom-received"lip>',
            // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
            initComplete: function () {
                // Move search input to your custom container
                $('.dt-custom-search-ps-received').appendTo('.search-here');

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
                }
            ],
            select: {
                style: 'multi',
                selector: 'td:nth-child(2)'
            },
            order: [[2, 'asc']],
            lengthMenu: [[10, 20, 30, 50, -1], [10, 20, 30, 50, "All"]],
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
            var paginateElement = document.querySelector('.bottom-received');
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
    function initIssuedTable() {
        const dt_dashboard_table_pf = document.querySelector('.paper-statement-issued');

        // On PO Table
        if (dt_dashboard_table_pf) {

            if (dt_dashboard_table_pf) {
                // Destroy if already initialized
                if ($.fn.DataTable.isDataTable(dt_dashboard_table_pf)) {
                    $(dt_dashboard_table_pf).DataTable().destroy();
                }
                var dt_dashboard = new DataTable(dt_dashboard_table_pf, {
                    ajax: assetsPath + 'json/paper-statement-issued.json',

                    // dom: '<"top">rt<"bottom"i p><"clear">',

                    paging: true,           // 🚫 disables pagination
                    lengthChange: true,     // 🚫 disables "Show X entries"
                    searching: true,        // (optional)
                    info: true,             // (optional)
                    responsive: false,
                    scrollX: true,

                    columns: [
                        // { data: null }, // For control column
                        // { data: null }, // For checkboxes
                        // { data: 'id' },
                        { data: 'id', orderable: false, render: DataTable.render.select() },
                        { data: 'date' },
                        { data: 'paper_details' },
                        { data: 'vender' },
                        { data: 'summary' }
                    ],
                    dom: '<"dt-custom-search-ps-issued"f>rt<"bottom-issued"lip>',
                    // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
                    initComplete: function () {
                        // Move search input to your custom container
                        $('.dt-custom-search-ps-issued').appendTo('.search-here-issued');

                        // Remove the default label wrapper text
                        $('.search-here-issued label').contents().filter(function () {
                            return this.nodeType === 3; // remove label text node
                        }).remove();

                        $('.search-here-issued label').hide();

                        // Target the input
                        const $input = $('.search-here-issued input[type="search"]');

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
                        }
                    ],
                    select: {
                        style: 'multi',
                        selector: 'td:nth-child(2)'
                    },
                    order: [[2, 'asc']],
                    lengthMenu: [[10, 20, 30, 50, -1], [10, 20, 30, 50, "All"]],
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
                    var paginateElement = document.querySelector('.bottom-issued');
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

    initIssuedTable();

    // document.querySelector('#profile-tab').addEventListener('shown.bs.tab', function () {
    //     initPendingFilesTable();
    //     console.log("run");
    // });

    document.querySelector('#profile-tab').addEventListener('shown.bs.tab', function () {
        console.log("Tab shown");

        if (!$.fn.DataTable.isDataTable('.paper-statement-issued')) {
            $('.paper-statement-issued').DataTable({
                responsive: true,
                pageLength: 10
            });
        } else {
            $('.paper-statement-issued').DataTable().columns.adjust().draw();
        }
    });



    // approvals pending approval code here ...

    // DataTable (js)
    // --------------------------------------------------------------------
    function initSummaryTable() {
        const dt_dashboard_table_pa = document.querySelector('.paper-statement-summary');

        // On PO Table
        if (dt_dashboard_table_pa) {
            var dt_dashboard = new DataTable(dt_dashboard_table_pa, {
                ajax: assetsPath + 'json/paper-statement-summary.json',

                // dom: '<"top">rt<"bottom"i p><"clear">',

                paging: true,           // 🚫 disables pagination
                lengthChange: true,     // 🚫 disables "Show X entries"
                searching: true,        // (optional)
                info: true,             // (optional)
                responsive: false,
                scrollX: true,

                columns: [
                    // { data: null }, // For control column
                    // { data: null }, // For checkboxes
                    // { data: 'id' },
                    { data: 'id', orderable: false, render: DataTable.render.select() },
                    { data: 'date' },
                    { data: 'paper_details' },
                    { data: 'vender' },
                    { data: 'summary' }
                ],
                dom: '<"dt-custom-search-ps-summary"f>rt<"bottom-summary"lip>',
                // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
                initComplete: function () {
                    // Move search input to your custom container
                    $('.dt-custom-search-ps-summary').appendTo('.search-here-summary');

                    // Remove the default label wrapper text
                    $('.search-here-summary label').contents().filter(function () {
                        return this.nodeType === 3; // remove label text node
                    }).remove();

                    $('.search-here-summary label').hide();

                    // Target the input
                    const $input = $('.search-here-summary input[type="search"]');

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
                    }
                ],
                select: {
                    style: 'multi',
                    selector: 'td:nth-child(2)'
                },
                order: [[2, 'asc']],
                lengthMenu: [[10, 20, 30, 50, -1], [10, 20, 30, 50, "All"]],
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
                var paginateElement = document.querySelector('.bottom-summary');
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

    initSummaryTable();

    // document.querySelector('#contact-tab').addEventListener('shown.bs.tab', function () {
    //     initPendingApprovalsTable();
    //     console.log("run2");
    // });

    document.querySelector('#contact-tab').addEventListener('shown.bs.tab', function () {
        console.log("Tab shown");

        if (!$.fn.DataTable.isDataTable('.paper-statement-summary')) {
            $('.paper-statement-summary').DataTable({
                responsive: true,
                pageLength: 10
            });
        } else {
            $('.paper-statement-summary').DataTable().columns.adjust().draw();
        }
    });
});