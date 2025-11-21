/**
 *  OTIF Screen
 */
'use strict';

document.addEventListener('DOMContentLoaded', function (e) {

    const dt_dashboard_table = document.querySelector('.product-data');

    if (dt_dashboard_table) {
        var dt_dashboard = new DataTable(dt_dashboard_table, {
            ajax: assetsPath + 'json/product.json',

            paging: true,
            lengthChange: true,
            searching: true,
            info: true,
            responsive: false,
            // scrollX: true,

            columns: [
                { data: 'id' },
                // {
                //     data: 'id',
                //     orderable: false,
                //     render: DataTable.render.select()
                // },
                // Product Column with image + name
                // {
                //     data: null,
                //     render: function (data, type, row) {
                //         const imagePath = assetsPath + row.product_image;
                //         const productName = row.product || 'Unnamed';
                //         return `
                //             <div class="d-flex align-items-center gap-2">
                //                 <img src="${imagePath}" alt="${productName}" style="width: 40px; height: auto; border-radius: 4px;">
                //                 <span>${productName}</span>
                //             </div>
                //         `;
                //     }
                // },
                {
                    data: null,
                    render: function (data, type, row) {
                        const productName = row.product || 'Unnamed';
                        const productDesc = row.product_desc || 'Unnamed';
                        const hasImage = row.product_image && row.product_image.trim() !== '';
                        const imageTag = hasImage
                            ? `<img src="${assetsPath + row.product_image}" alt="${productName}" style="width: 80px; height: auto; border-radius: 4px;">`
                            : '';

                        return `
      <div class="d-flex align-items-center gap-4">
        ${imageTag}
        <div class="d-flex flex-column gap-2">
        <span style="color: #2F2B3D;">${productName}</span>
        <span class="">${productDesc}</span>
        </div>
      </div>
    `;
                    }
                },
                { data: 'delivered_in_last_6_months' },
                { data: 'average_monthly_consumption' },
                { data: 'last_ordered_received' },
                { data: 'last_delivered' }
            ],

            // ⬇️ ADD THIS PART HERE
    createdRow: function (row, data) {
        // const url = '/product/' + data.id; // Change this to your actual product URL

        $('td', row).each(function () {
            const cellContent = $(this).html();
            // $(this).html(`<a href="${url}" class="d-block text-decoration-none">${cellContent}</a>`);
            $(this).html(`<a href="product-detail.html" class="d-block text-decoration-none">${cellContent}</a>`);
        });
    },

            dom: '<"dt-custom-search-product"f>rt<"bottom-product"lip>',

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

            columnDefs: [
                {
                    className: 'control',
                    orderable: false,
                    searchable: false,
                    responsivePriority: 1,
                    targets: 0,
                    render: () => ''
                },
                // {
                //     targets: 1,
                //     orderable: false,
                //     searchable: false,
                //     responsivePriority: 2,
                //     checkboxes: true,
                //     render: () => '<input type="checkbox" class="dt-checkboxes form-check-input">',
                //     checkboxes: {
                //         selectAllRender: '<input type="checkbox" class="form-check-input">'
                //     }
                // }
            ],

            select: {
                style: 'multi',
                selector: 'td:nth-child(2)'
            },

            order: [[3, 'asc']],
            lengthMenu: [[6, 10, 20, 30, 50, -1], [6, 10, 20, 30, 50, "All"]],
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
                            return 'Details of ' + data['po_number'];
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

        // Move pagination after table is drawn
        dt_dashboard.on('draw', function () {
            const paginateElement = document.querySelector('.bottom-product');
            const customPaginationContainer = document.querySelector('.custom-table-pagination-layout-product');

            if (paginateElement && customPaginationContainer) {
                customPaginationContainer.appendChild(paginateElement);
            }
        });
    }

    // Minor layout fixes
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
