# Packaging Pricing – API Documentation

This document describes how to call the **Packaging Pricing** API (packaging box estimation) for getting price-per-unit quotes for mono cartons, litho-laminated cartons, and related packaging.

---

## 1. How to Call the URL in Postman

### Base URL
- **Local:** `http://localhost:8080/api/pck-est/calculate`
- **Production:** `https://cdc-customer-portal-backend.onrender.com/api/pck-est/calculate`

### Steps in Postman

1. **Method:** `POST`
2. **URL:** Enter the full URL (e.g. `http://localhost:8080/api/pck-est/calculate`).
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
- URL: `{{base_url}}/api/pck-est/calculate`
- Header: `Authorization: Bearer {{token}}`

---

## 2. Input Example (All Parameters)

### Full request body (all parameters)

```json
{
  "len": 120,
  "brd": 50,
  "height": 75,
  "qty": 15000,
  "matin": "FBB",
  "gsmTop": 300,
  "ptype": "Top Bottom",
  "corrLayIn": 0,
  "frontColIn": 4,
  "backColIn": 0,
  "frontSurIn": "DRIP OFF COATING",
  "backSurIn": "None",
  "kraftGsmIn": 0,
  "windowIn": 0,
  "fooinIn": 0,
  "embossIn": 0,
  "matBot": "FBB",
  "gsmBot": 300,
  "frontColBot": 4,
  "frontSur": "DRIP OFF COATING"
}
```

### Parameter reference

| Parameter      | Type   | Required | Description |
|----------------|--------|----------|-------------|
| `len`          | number | Yes      | Length in mm. |
| `brd`          | number | Yes      | Breadth in mm. |
| `height`       | number | Yes      | Height in mm. |
| `qty`          | number | Yes      | Order quantity. |
| `matin`        | string | Yes      | Paper type for inner/top (e.g. `FBB`, `CBB`, `Grey Back Board`, `White Back Board`). |
| `gsmTop`       | number | Yes      | GSM for top/inner paper. |
| `ptype`        | string | Yes      | Product type: `RTI`, `Crash Lock`, `Haugland`, `Universal`, `Top-Bottom Box`, or `Cake Box`. |
| `corrLayIn`    | number | No       | Corrugation layer: `0`, `3`, or `5` ply. Default: `0`. |
| `frontColIn`   | number | No       | Front print color count (inner). Default: `0`. |
| `backColIn`    | number | No       | Back print color count (inner). Default: `0`. |
| `frontSurIn`   | string | No       | Front surface finish (inner), e.g. `DRIP OFF COATING`, `Aqueous Gloss/Matt`, `UV Gloss/Matt`, `Gloss/Matt Lamination`, `None`. Default: `""`. |
| `backSurIn`    | string | No       | Back surface finish (inner). Default: `""` or `None`. |
| `kraftGsmIn`   | number | No       | Kraft GSM when corrugation is used. Default: `0`. |
| `windowIn`     | number | No       | Window patching sq in: `0`, `4`, `8`, `12`, `20`, `40`. Default: `0`. |
| `fooinIn`      | number | No       | Foil stamping sq in: `0`, `4`, `15`, `25`, `50`, `75`. Default: `0`. |
| `embossIn`     | number | No       | Embossing sq in: `0`, `4`, `15`, `25`, `50`, `75`. Default: `0`. Rated off the same master columns as foil. |
| `embossBot`    | number | No       | Embossing sq in for the Top-Bottom bottom tray. Default: `0`. |
| `matBot`       | string | No       | Paper type for bottom (Top-Bottom Box) or outer box. Default: `""`. |
| `gsmBot`       | number | No       | GSM for bottom/outer. Default: `0`. |
| `frontColBot`  | number | No       | Front print color count for bottom/outer. Default: `0`. |
| `frontSur`     | string | No       | Front surface finish for bottom/outer. Default: `""`. |

**Notes:**
- For **Top-Bottom Box** (`ptype`: `"Top Bottom"`), provide `matBot`, `gsmBot`, `frontColBot`, `frontSur` for the bottom part.
- For **outer box** (non–Top-Bottom), provide `matBot`, `gsmBot`, `frontColBot`, `frontSur` to get outer pricing (10 inner per outer).

---

## 3. Output Example

### Success response (200 OK)

```json
{
  "success": true,
  "data": {
    "calculateTable": [
      [1050, 800, 2],
      [520, 130, 10]
    ],
    "innerCosts": {
      "waste": 0.07,
      "paperweight": 123.45,
      "kraftWeight": 0,
      "paperPerUnit": 0.123,
      "ctpPerUnit": 0.001,
      "printPerunit": 0.045,
      "surfacePerUnit": 0.012,
      "kraftPerunit": 0,
      "diceCost": 0.001,
      "window_foil_emboss_Cost": 0,
      "window_foil_Cost": 0,
      "punch_paste": 0.002,
      "pack_del": 0.005,
      "Corr_conv": 0
    },
    "outerCosts": {
      "waste": 0.07,
      "paperweight": 12.34,
      "kraftWeight": 0,
      "paperPerUnit": 0.012,
      "ctpPerUnit": 0.0001,
      "printPerunit": 0.004,
      "surfacePerUnit": 0.001,
      "kraftPerunit": 0,
      "diceCost": 0.001,
      "window_foil_emboss_Cost": 0,
      "window_foil_Cost": 0,
      "punch_paste": 0.0002,
      "pack_del": 0.0005,
      "Corr_conv": 0
    },
    "pricing": {
      "price_per_unit_In": 0.234,
      "price_per_unit_Out": 0.023,
      "varCostIn": 0.189,
      "varCostOut": 0.018,
      "gpPerIn": 0.238,
      "gpPerOut": 0.278,
      "gpPerImpIn": 0.36,
      "gpPerImpOut": 0.003
    },
    "metadata": {
      "foilIn": 0,
      "windowIn": 0
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | `true` when the calculation succeeded. |
| `data.calculateTable` | array | Sheet dimensions and ups: inner `[bestLen, bestBrd, maxUps]`, outer (if applicable) `[bestLenOuter, bestBrdOuter, maxUpsOuter]`. |
| `data.innerCosts` | object | Per-unit cost breakdown for inner box (waste, paper, print, surface, etc.). |
| `data.outerCosts` | object | Per-unit cost breakdown for outer box (when applicable). |
| `data.pricing.price_per_unit_In` | number | Price per unit (inner) in Rupees. |
| `data.pricing.price_per_unit_Out` | number | Price per unit (outer/bottom) in Rupees; `0` when not applicable. |
| `data.pricing.varCostIn` / `varCostOut` | number | Variable cost inner/outer. |
| `data.pricing.gpPerIn` / `gpPerOut` | number | Gross profit per unit inner/outer. |
| `data.metadata` | object | Echo of foil/window inputs. |

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
  "missingFields": ["len", "brd", "height", "qty", "matin", "gsmTop", "ptype"]
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

- **URL:** `http://localhost:8080/api/pck-est/calculate`
- **Method:** POST
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):** use the “Input Example (All Parameters)” JSON from section 2 above.
