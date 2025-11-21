/**
 *  International Dispatch Screen
 */

'use strict';

document.addEventListener('DOMContentLoaded', function (e) {

    // DataTable (js)
    // --------------------------------------------------------------------
    const dt_dashboard_table = document.querySelector('.international-dispatches');

    // On PO Table
    if (dt_dashboard_table) {
        var dt_dashboard = new DataTable(dt_dashboard_table, {
            ajax: assetsPath + 'json/international-dispatches.json',

            // dom: '<"top">rt<"bottom"i p><"clear">',

            paging: true,           // 🚫 disables pagination
            lengthChange: true,     // 🚫 disables "Show X entries"
            searching: true,        // (optional)
            info: true,             // (optional)
            responsive: false,
            // scrollX: true,

            columns: [
                // { data: 'id' },
                { data: 'id', orderable: false, render: DataTable.render.select() },
                { data: 'date' },
                { data: 'po_details' },
                { data: 'po_date' },
                { data: 'item' },
                { data: 'qty_dispatch' },
                // { data: 'container_number' },
                {
                    data: 'container_number',
                    render: function (data, type, row) {
                        const cn = row.container_number;
                        return `
                            <button type="button" class="cn-number">
                                ${cn}
                            </button>
                    `;
                    }
                },
                { data: 'inv_details' },
                { data: 'bl_number' },
                { data: 'bl_date' },
                { data: 'eta_dest' }
            ],
            dom: '<"dt-custom-search-dispatches-int-dispatch"f>rt<"bottom-dispatch-international"lip>',
            // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
            initComplete: function () {
                // Move search input to your custom container
                $('.dt-custom-search-dispatches-int-dispatch').appendTo('.search-here');

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
                // {
                //     // File Status Badge
                //     targets: 5,
                //     render: (data) => {
                //         const statusMap = {
                //             'Completed': 'success',
                //             'Pending': 'warning',
                //             'Rejected': 'danger'
                //         };
                //         const badgeClass = statusMap[data] || 'secondary';
                //         return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                //     }
                // },
                // {
                //     // Approval Status Badge
                //     targets: 6,
                //     render: (data) => {
                //         const statusMap = {
                //             'Completed': 'success',
                //             'Pending': 'warning',
                //             'Rejected': 'danger'
                //         };
                //         const badgeClass = statusMap[data] || 'secondary';
                //         return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                //     }
                // },
                // {
                //     // Approval Link Button
                //     targets: 7,
                //     render: (data) => {
                //         return `<a href="${data}" class="" target="_blank" style="text-decoration: underline;">${data}</a>`;
                //     }
                // }
            ],
            select: {
                style: 'multi',
                selector: 'td:nth-child(2)'
            },
            order: [[3, 'asc']],
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
            var paginateElement = document.querySelector('.bottom-dispatch-international');
            var customPaginationContainer = document.querySelector('.custom-table-pagination-layout-dispatch-international');

            if (paginateElement && customPaginationContainer) {
                // Move pagination to the custom container
                customPaginationContainer.appendChild(paginateElement);
            }
        });
    }

    // ---------- EVENT HANDLERS ----------
    $(document).on("click", ".cn-number", function () {
        $("#cn-number-dispatch").modal("show");
    });

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

    // arrival code here ...

    // DataTable (js)
    // --------------------------------------------------------------------
    function initArrivalTable() {
        const dt_dashboard_table_pf = document.querySelector('.international-arrival');

        // On PO Table
        if (dt_dashboard_table_pf) {

            if (dt_dashboard_table_pf) {
                // Destroy if already initialized
                if ($.fn.DataTable.isDataTable(dt_dashboard_table_pf)) {
                    $(dt_dashboard_table_pf).DataTable().destroy();
                }
                var dt_dashboard = new DataTable(dt_dashboard_table_pf, {
                    ajax: assetsPath + 'json/international-arrival.json',

                    // dom: '<"top">rt<"bottom"i p><"clear">',

                    paging: true,           // 🚫 disables pagination
                    lengthChange: true,     // 🚫 disables "Show X entries"
                    searching: true,        // (optional)
                    info: true,             // (optional)

                    columns: [
                        // { data: null }, // For control column
                        // { data: null }, // For checkboxes
                        { data: 'id' },
                        { data: 'id', orderable: false, render: DataTable.render.select() },
                        { data: 'eta_dest_port' },
                        { data: 'po_details' },
                        { data: 'po_date' },
                        { data: 'item' },
                        { data: 'qty_dispatch' },
                        { data: 'loading_date' },
                        // { data: 'container_number' },
                        {
                            data: 'container_number',
                            render: function (data, type, row) {
                                const cn = row.container_number;
                                return `
                            <button type="button" class="cn-number">
                                ${cn}
                            </button>
                    `;
                            }
                        },
                        { data: 'inv_details' },
                        { data: 'bl_number' },
                        { data: 'bl_date' }
                    ],
                    dom: '<"dt-custom-search-dispatches-int-arrival"f>rt<"bottom-arrival"lip>',
                    // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
                    initComplete: function () {
                        // Move search input to your custom container
                        $('.dt-custom-search-dispatches-int-arrival').appendTo('.search-here-arrival');

                        // Remove the default label wrapper text
                        $('.search-here-arrival label').contents().filter(function () {
                            return this.nodeType === 3; // remove label text node
                        }).remove();

                        $('.search-here-arrival label').hide();

                        // Target the input
                        const $input = $('.search-here-arrival input[type="search"]');

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
                            // For Responsive control
                            className: 'control',
                            orderable: false,
                            searchable: false,
                            responsivePriority: 1,
                            targets: 0,
                            render: () => ''
                        },
                        {
                            // For Checkboxes
                            targets: 1,
                            orderable: false,
                            searchable: false,
                            responsivePriority: 2,
                            checkboxes: true,
                            render: () => '<input type="checkbox" class="dt-checkboxes form-check-input">',
                            checkboxes: {
                                selectAllRender: '<input type="checkbox" class="form-check-input">'
                            }
                        }
                        // {
                        //     // File Status Badge
                        //     targets: 5,
                        //     render: (data) => {
                        //         const statusMap = {
                        //             'Completed': 'success',
                        //             'Pending': 'warning',
                        //             'Rejected': 'danger'
                        //         };
                        //         const badgeClass = statusMap[data] || 'secondary';
                        //         return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                        //     }
                        // }
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
                    responsive: {
                        details: {
                            display: DataTable.Responsive.display.modal({
                                header: function (row) {
                                    const data = row.data();
                                    return 'Details of ' + data['po_details'];
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
                                    table.classList.add('table', 'datatables-basic', 'mb-2');
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
                // Move the pagination controls to the custom container

                // Wait for the DataTable to initialize, then move pagination
                dt_dashboard.on('draw', function () {
                    console.log("last");
                    var paginateElement = document.querySelector('.bottom-arrival');
                    var customPaginationContainer = document.querySelector('.custom-table-pagination-layout-arrival-international');

                    if (paginateElement && customPaginationContainer) {
                        // Move pagination to the custom container
                        customPaginationContainer.appendChild(paginateElement);
                    }
                });
            }

            // ---------- EVENT HANDLERS ----------
            $(document).on("click", ".cn-number", function () {
                $("#cn-number-dispatch").modal("show");
            });

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

    initArrivalTable();

    // document.querySelector('#profile-tab').addEventListener('shown.bs.tab', function () {
    //     initPendingFilesTable();
    //     console.log("run");
    // });

    document.querySelector('#arrival-tab').addEventListener('shown.bs.tab', function () {
        console.log("Tab shown Arrival");

        if (!$.fn.DataTable.isDataTable('.international-arrival')) {
            console.log("arrival-dt");
            $('.international-arrival').DataTable({
                responsive: true,
                pageLength: 10
            });
            console.log("arrival-dt-end");
        } else {
            $('.international-arrival').DataTable().columns.adjust().draw();
        }
    });

    // bl date code here ...

    // DataTable (js)
    // --------------------------------------------------------------------
    function initBLDateTable() {
        const dt_dashboard_table_pa = document.querySelector('.international-bl-date');

        // On PO Table
        if (dt_dashboard_table_pa) {
            var dt_dashboard = new DataTable(dt_dashboard_table_pa, {
                ajax: assetsPath + 'json/international-bl-date.json',

                // dom: '<"top">rt<"bottom"i p><"clear">',

                paging: true,           // 🚫 disables pagination
                lengthChange: true,     // 🚫 disables "Show X entries"
                searching: true,        // (optional)
                info: true,             // (optional)

                columns: [
                    // { data: null }, // For control column
                    // { data: null }, // For checkboxes
                    { data: 'id' },
                    { data: 'id', orderable: false, render: DataTable.render.select() },
                    { data: 'bl_date' },
                    { data: 'bl_number' },
                    { data: 'po_details' },
                    { data: 'po_date' },
                    { data: 'item' },
                    { data: 'qty_dispatch' },
                    { data: 'loading_date' },
                    // { data: 'container_number' },
                    {
                        data: 'container_number',
                        render: function (data, type, row) {
                            const cn = row.container_number;
                            return `
                            <button type="button" class="cn-number">
                                ${cn}
                            </button>
                    `;
                        }
                    },
                    { data: 'inv_details' },
                    { data: 'eta_dest_port' }
                ],
                dom: '<"dt-custom-search-dispatches-int-bl-date"f>rt<"bottom-bl-date"lip>',
                // dom: '<"dt-custom-search-vehicles"f>rt<"dt-footer-wrapper"lpi>',
                initComplete: function () {
                    // Move search input to your custom container
                    $('.dt-custom-search-dispatches-int-bl-date').appendTo('.search-here-bl-date');

                    // Remove the default label wrapper text
                    $('.search-here-bl-date label').contents().filter(function () {
                        return this.nodeType === 3; // remove label text node
                    }).remove();

                    $('.search-here-bl-date label').hide();

                    // Target the input
                    const $input = $('.search-here-bl-date input[type="search"]');

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
                        // For Responsive control
                        className: 'control',
                        orderable: false,
                        searchable: false,
                        responsivePriority: 1,
                        targets: 0,
                        render: () => ''
                    },
                    {
                        // For Checkboxes
                        targets: 1,
                        orderable: false,
                        searchable: false,
                        responsivePriority: 2,
                        checkboxes: true,
                        render: () => '<input type="checkbox" class="dt-checkboxes form-check-input">',
                        checkboxes: {
                            selectAllRender: '<input type="checkbox" class="form-check-input">'
                        }
                    }
                    // {
                    //     // File Status Badge
                    //     targets: 5,
                    //     render: (data) => {
                    //         const statusMap = {
                    //             'Completed': 'success',
                    //             'Pending': 'warning',
                    //             'Rejected': 'danger'
                    //         };
                    //         const badgeClass = statusMap[data] || 'secondary';
                    //         return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                    //     }
                    // },
                    // {
                    //     // Approval Status Badge
                    //     targets: 6,
                    //     render: (data) => {
                    //         const statusMap = {
                    //             'Completed': 'success',
                    //             'Pending': 'warning',
                    //             'Rejected': 'danger'
                    //         };
                    //         const badgeClass = statusMap[data] || 'secondary';
                    //         return `<span class="badge bg-label-${badgeClass}">${data}</span>`;
                    //     }
                    // },
                    // {
                    //     // Approval Link Button
                    //     targets: 7,
                    //     render: (data) => {
                    //         return `<a href="${data}" class="" target="_blank" style="text-decoration: underline;">${data}</a>`;
                    //     }
                    // }
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
                responsive: {
                    details: {
                        display: DataTable.Responsive.display.modal({
                            header: function (row) {
                                const data = row.data();
                                return 'Details of ' + data['po_details'];
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
                                table.classList.add('table', 'datatables-basic', 'mb-2');
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
            // Move the pagination controls to the custom container

            // Wait for the DataTable to initialize, then move pagination
            dt_dashboard.on('draw', function () {
                console.log("last");
                var paginateElement = document.querySelector('.bottom-bl-date');
                var customPaginationContainer = document.querySelector('.custom-table-pagination-layout-bl-date-international');

                if (paginateElement && customPaginationContainer) {
                    // Move pagination to the custom container
                    customPaginationContainer.appendChild(paginateElement);
                }
            });
        }

        // ---------- EVENT HANDLERS ----------
        $(document).on("click", ".cn-number", function () {
            $("#cn-number-dispatch").modal("show");
        });

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

    initBLDateTable();

    // document.querySelector('#contact-tab').addEventListener('shown.bs.tab', function () {
    //     initPendingApprovalsTable();
    //     console.log("run2");
    // });

    document.querySelector('#bl-date-tab').addEventListener('shown.bs.tab', function () {
        console.log("Tab shown");

        if (!$.fn.DataTable.isDataTable('.international-bl-date')) {
            $('.international-bl-date').DataTable({
                responsive: true,
                pageLength: 10
            });
        } else {
            $('.international-bl-date').DataTable().columns.adjust().draw();
        }
    });
});