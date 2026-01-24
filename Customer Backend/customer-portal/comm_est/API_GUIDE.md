# Commercial Estimation API Guide

## Endpoint

**POST** `/api/comm-est/calculate`

## Request Format

### Headers
```
Content-Type: application/json
```

### Sample Input

```json
{
  "no_of_titles": "1.0",
  "len": 297,
  "brd": 210,
  "Qty": "10000.0",
  "binding_style": "SS+PB",
  "components": "Cover$Text",
  "gsm": "250$80",
  "material": "FBB$Maplitho Gr A",
  "front_print": "4$4",
  "back_print": "0$4",
  "front_surface": "Gloss Lam$None",
  "back_surface": "None$None",
  "page_number": "4$176"
}
```

## Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `len` | number | Length in mm | `297` |
| `brd` | number | Breadth in mm | `210` |
| `Qty` | string/number | Quantity | `"10000.0"` or `10000` |
| `binding_style` | string | Binding style | `"SS+PB"` |
| `components` | string | Components separated by `$` | `"Cover$Text"` |
| `gsm` | string | GSM values separated by `$` | `"250$80"` |
| `material` | string | Material types separated by `$` | `"FBB$Maplitho Gr A"` |
| `page_number` | string | Page numbers separated by `$` | `"4$176"` |
| `front_print` | string | Front print colors separated by `$` | `"4$4"` |
| `back_print` | string | Back print colors separated by `$` | `"0$4"` |
| `front_surface` | string | Front surface finish separated by `$` | `"Gloss Lam$None"` |
| `back_surface` | string | Back surface finish separated by `$` | `"None$None"` |

## Optional Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `no_of_titles` | string/number | Number of titles | `"1"` or `1` |

## Field Format Notes

- **Array fields** (components, gsm, material, etc.) use `$` as delimiter
- Each position in the delimited string corresponds to a component
- Example: `"Cover$Text"` means:
  - Component 1: Cover
  - Component 2: Text
- All array fields must have the same number of elements (up to 6 components)

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "price_per_unit": 12.45
  }
}
```

### Error Response (Missing Fields)

```json
{
  "success": false,
  "error": "Missing required fields",
  "missingFields": ["len", "brd"]
}
```

### Error Response (Server Error)

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Example Usage

### Using cURL

```bash
curl -X POST http://localhost:3000/api/comm-est/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "no_of_titles": "1.0",
    "len": 297,
    "brd": 210,
    "Qty": "10000.0",
    "binding_style": "SS+PB",
    "components": "Cover$Text",
    "gsm": "250$80",
    "material": "FBB$Maplitho Gr A",
    "front_print": "4$4",
    "back_print": "0$4",
    "front_surface": "Gloss Lam$None",
    "back_surface": "None$None",
    "page_number": "4$176"
  }'
```

### Using Postman

1. **Method**: POST
2. **URL**: `http://localhost:3000/api/comm-est/calculate`
3. **Headers**: 
   - `Content-Type: application/json`
4. **Body** (raw JSON): Use the sample input above

### Using JavaScript (fetch)

```javascript
const response = await fetch('http://localhost:3000/api/comm-est/calculate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    no_of_titles: "1.0",
    len: 297,
    brd: 210,
    Qty: "10000.0",
    binding_style: "SS+PB",
    components: "Cover$Text",
    gsm: "250$80",
    material: "FBB$Maplitho Gr A",
    front_print: "4$4",
    back_print: "0$4",
    front_surface: "Gloss Lam$None",
    back_surface: "None$None",
    page_number: "4$176"
  })
});

const result = await response.json();
console.log(result);
```

## Component Types

Valid component types:
- `"Text"`
- `"End Paper"`
- `"Text - 2"`
- `"Sticker Paper"`
- `"Cover"`
- `"PLC"`
- `"Gate Fold Cover"`
- `"Binding Board"`
- `"Foam"`

## Binding Styles

Examples of binding styles:
- `"SS+PB"` (Saddle Stitch + Perfect Binding)
- `"HC + Board Book"`
- `"Plain Board Book"`
- `"HC+Foam+Board Book"`
- And others as defined in your Options sheet

## Surface Finish Options

Examples:
- `"Gloss Lam"` (Gloss Lamination)
- `"None"`
- `"Matt Lam"`
- And others as defined in your Options sheet

