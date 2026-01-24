# Missing Helper Functions

The following helper functions are used in the code but are not defined in the original `appscript.js` file. These functions need to be implemented:

## 1. convertStringToArray
- **Usage**: Converts string inputs to 2D array format
- **Called with**: `quoteinfo.components`, `quoteinfo.gsm`, `quoteinfo.page_number`, `quoteinfo.material`, `quoteinfo.front_print`, `quoteinfo.back_print`, `quoteinfo.front_surface`, `quoteinfo.back_surface`
- **Expected return**: 2D array where each element is accessed as `array[i][0]`

## 2. stdUps1
- **Usage**: Standardizes the ups (units per sheet) value based on complexity
- **Called with**: `(vUps, complexity)` or `(hUps, complexity)` or `(Math.max(vUps, hUps), complexity)`
- **Expected return**: A standardized ups value (number)

## 3. sumColumn
- **Usage**: Sums values in a specific column of a 2D array (displayTable)
- **Called with**: `(displayTable, 10)`, `(displayTable, 11)`, `(displayTable, 12)`, `(displayTable, 13)`
- **Expected return**: Sum of values in the specified column (number)

## Note
The functions `getbindcost` and `getbindcostact` were found in the original file and have been implemented in `calculator.js`.


