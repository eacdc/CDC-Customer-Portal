# Commercial Pricing – API Documentation

This document describes how to call the **Commercialricing** API (commercial/book estimation) for getting price-per-unit quotes.

---

## 1. How to Call the URL in Postman

### Base URL
- **Local:** `http://localhost:8080/api/comm-est/calculate`
- **Production:** `https://cdc-customer-portal-backend.onrender.com/api/comm-est/calculate`

### Steps in Postman

1. **Method:** `POST`
2. **URL:** Enter the full URL (e.g. `http://localhost:8080/api/comm-est/calculate`).
3. **Headers:**
   - `Content-Type`: `application/json`
   - `Authorization`: `Bearer <your_jwt_token>` (if your API requires auth)
4. **Body:**
   - Select **Body** → **raw** → **JSON**.
   - Paste the JSON input (see section 2 below).
5. Click **Send**.

### Optional: Using Postman Variables
- Create an environment with:
  - `base_url`: `http://localhost:8080`
  - `token`: your JWT (after login)
- URL: `{{base_url}}/api/comm-est/calculate`
- Header: `Authorization: Bearer {{token}}`

---

## 2. Input Example (All Parameters)

### Full request body (all parameters)

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

### Parameter reference

| Parameter        | Type          | Required | Description |
|-----------------|---------------|----------|-------------|
| `len`           | number        | Yes      | Length in mm (trim size). |
| `brd`           | number        | Yes      | Breadth in mm (trim size). |
| `Qty`           | string/number | Yes      | Order quantity. |
| `binding_style` | string        | Yes      | Binding style (e.g. `SS+PB`, `HC + Board Book`). |
| `components`    | string        | Yes      | Component names separated by `$` (e.g. `Cover$Text`). |
| `gsm`           | string        | Yes      | GSM per component, `$`-separated (e.g. `250$80`). |
| `material`      | string        | Yes      | Paper/material per component, `$`-separated (e.g. `FBB$Maplitho Gr A`). |
| `page_number`   | string        | Yes      | Page count per component, `$`-separated (e.g. `4$176`). |
| `front_print`   | string        | Yes      | Front print color count per component, `$`-separated (e.g. `4$4`). |
| `back_print`    | string        | Yes      | Back print color count per component, `$`-separated (e.g. `0$4`). |
| `front_surface` | string        | Yes      | Front surface finish per component, `$`-separated (e.g. `Gloss Lam$None`). |
| `back_surface`  | string        | Yes      | Back surface finish per component, `$`-separated (e.g. `None$None`). |
| `no_of_titles`  | string/number | No       | Number of titles. Default: `1` or `1.0`. |

**Format note:** All `$`-separated fields must have the same number of values as `components` (one value per component, up to 6 components).

---

## 3. Output Example

### Success response (200 OK)

```json
{
  "success": true,
  "data": {
    "price_per_unit": 12.45,
    "displayTable": [
      [1, "Cover", 1050, 800, 2, 0.15, "Standard", "FBB", 123.45, 45.67, 89.12, 0.5, 0.3, 1.2],
      [2, "Text", 920, 640, 4, 0.12, "Standard", "Maplitho Gr A", 234.56, 34.56, 78.90, 0.8, 0.4, 0.0]
    ]
  }
}
```

| Field                | Type   | Description |
|----------------------|--------|-------------|
| `success`            | boolean| `true` when the calculation succeeded. |
| `data.price_per_unit`| number | Price per unit in Rupees (₹). |
| `data.displayTable`  | array  | Optional; component-wise breakdown (internal display data). |

### Error response – missing/invalid body (400)

```json
{
  "success": false,
  "error": "Request body is missing or invalid. Please send JSON data."
}
```

### Error response – missing required fields (400)

```json
{
  "success": false,
  "error": "Missing required fields",
  "missingFields": ["len", "brd", "Qty"]
}
```

### Error response – server error (500)

```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Quick copy-paste for Postman

- **URL:** `http://localhost:8080/api/comm-est/calculate`
- **Method:** POST  
- **Headers:** `Content-Type: application/json`  
- **Body (raw JSON):** use the “Input Example (All Parameters)” JSON from section 2 above.
