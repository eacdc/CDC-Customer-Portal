# Postman Testing Guide for Estimation APIs

This guide explains how to test the Packaging Estimation and Commercial Estimation APIs using Postman.

## Prerequisites

1. **Server Running**: Ensure your backend server is running on `http://localhost:8080` (or your configured port)
2. **Authentication**: These APIs require authentication. You need a valid JWT token.
3. **Postman Installed**: Download Postman from [postman.com](https://www.postman.com/downloads/)

## Getting Authentication Token

Before testing the estimation APIs, you need to authenticate:

### Step 1: Register/Login

**POST** `http://localhost:8080/api/auth/login-email`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionId": "session-id-here"
}
```

### Step 2: Save Token

Copy the `token` from the response. You'll use it in the Authorization header for all estimation API requests.

---

## Packaging Estimation API

### Endpoint
**POST** `http://localhost:8080/api/pck-est/calculate`

### Headers
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN_HERE
```

### Request Body Example

```json
{
  "len": 120,
  "brd": 50,
  "height": 75,
  "qty": 15000,
  "matin": "FBB",
  "gsmTop": 300,
  "corrLayIn": 0,
  "ptype": "Top Bottom",
  "frontColIn": 4,
  "backColIn": 0,
  "frontSurIn": "DRIP OFF COATING",
  "backSurIn": "None",
  "kraftGsmIn": 0,
  "windowIn": 0,
  "fooinIn": 4,
  "embossIn": 0,
  "matBot": "FBB",
  "gsmBot": 300,
  "frontColBot": 4,
  "frontSur": "DRIP OFF COATING"
}
```

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `len` | number | Length in mm | `120` |
| `brd` | number | Breadth in mm | `50` |
| `height` | number | Height in mm | `75` |
| `qty` | number | Quantity | `15000` |
| `matin` | string | Material type (inner/top) | `"FBB"` |
| `gsmTop` | number | GSM for top/inner | `300` |
| `ptype` | string | Product type | `"Top Bottom"`, `"RTI"`, `"Universal"`, `"Haugland"`, `"Crash Lock"`, `"Cake Box"` |

### Optional Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `corrLayIn` | number | Corrugated layer inner | `0` |
| `frontColIn` | number | Front color inner | `0` |
| `backColIn` | number | Back color inner | `0` |
| `frontSurIn` | string | Front surface inner | `""` |
| `backSurIn` | string | Back surface inner | `""` |
| `kraftGsmIn` | number | Kraft GSM inner | `0` |
| `windowIn` | number | Window inner | `0` |
| `fooinIn` | number | Foil inner | `0` |
| `embossIn` | number | Emboss inner | `0` |
| `embossBot` | number | Emboss bottom (Top Bottom only) | `0` |
| `matBot` | string | Material type (bottom/outer) | `""` |
| `gsmBot` | number | GSM for bottom/outer | `0` |
| `frontColBot` | number | Front color bottom | `0` |
| `frontSur` | string | Front surface bottom | `""` |

### Success Response

```json
{
  "success": true,
  "data": {
    "calculateTable": [[bestLen, bestBrd, maxUps], [bestLenOuter, bestBrdOuter, maxUpsOuter]],
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
      "foilIn": 4,
      "windowIn": 0
    }
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Missing required fields",
  "missingFields": ["len", "brd"]
}
```

---

## Commercial Estimation API

### Endpoint
**POST** `http://localhost:8080/api/comm-est/calculate`

### Headers
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN_HERE
```

### Request Body Example

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

### Required Fields

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

### Optional Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `no_of_titles` | string/number | Number of titles | `"1"` or `1` |

### Field Format Notes

- **Array fields** (components, gsm, material, etc.) use `$` as delimiter
- Each position in the delimited string corresponds to a component
- Example: `"Cover$Text"` means:
  - Component 1: Cover
  - Component 2: Text
- All array fields must have the same number of elements (up to 6 components)

### Valid Component Types

- `"Text"`
- `"End Paper"`
- `"Text - 2"`
- `"Sticker Paper"`
- `"Cover"`
- `"PLC"`
- `"Gate Fold Cover"`
- `"Binding Board"`
- `"Foam"`

### Valid Binding Styles

Examples:
- `"SS+PB"` (Saddle Stitch + Perfect Binding)
- `"HC + Board Book"`
- `"Plain Board Book"`
- `"HC+Foam+Board Book"`
- And others as defined in your Options sheet

### Success Response

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

### Error Response

```json
{
  "success": false,
  "error": "Missing required fields",
  "missingFields": ["len", "brd"]
}
```

---

## Postman Setup Steps

### 1. Create Environment Variables

1. Open Postman
2. Click on "Environments" in the left sidebar
3. Click "+" to create a new environment
4. Add these variables:
   - `base_url`: `http://localhost:8080`
   - `token`: (leave empty, will be set after login)

### 2. Create Collection

1. Click "Collections" in the left sidebar
2. Click "+" to create a new collection
3. Name it "CDC Estimation APIs"

### 3. Setup Authentication Request

1. Create a new request in your collection
2. Name it "1. Login"
3. Method: **POST**
4. URL: `{{base_url}}/api/auth/login-email`
5. Headers: `Content-Type: application/json`
6. Body (raw JSON):
```json
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```
7. In the "Tests" tab, add this script to save the token:
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("token", jsonData.token);
    console.log("Token saved:", jsonData.token);
}
```

### 4. Setup Packaging Estimation Request

1. Create a new request: "2. Packaging Estimation"
2. Method: **POST**
3. URL: `{{base_url}}/api/pck-est/calculate`
4. Headers:
   - `Content-Type: application/json`
   - `Authorization: Bearer {{token}}`
5. Body (raw JSON): Use the example from above

### 5. Setup Commercial Estimation Request

1. Create a new request: "3. Commercial Estimation"
2. Method: **POST**
3. URL: `{{base_url}}/api/comm-est/calculate`
4. Headers:
   - `Content-Type: application/json`
   - `Authorization: Bearer {{token}}`
5. Body (raw JSON): Use the example from above

### 6. Health Check Endpoints

You can also test health endpoints (no auth required):

- **GET** `{{base_url}}/api/pck-est/health`
- **GET** `{{base_url}}/api/comm-est/health`

---

## Troubleshooting

### 401 Unauthorized
- Make sure you've logged in first and the token is saved
- Check that the Authorization header is set correctly: `Bearer YOUR_TOKEN`

### 400 Bad Request
- Check that all required fields are present
- Verify field types match the expected types (numbers vs strings)
- For commercial estimation, ensure array fields have matching number of elements

### 500 Internal Server Error
- Check server logs for detailed error messages
- Verify Google Sheets API credentials are configured
- Ensure environment variables are set:
  - `GOOGLE_SERVICE_ACCOUNT_KEY` or OAuth credentials
  - `GOOGLE_SPREADSHEET_ID` (for packaging estimation)
  - `GOOGLE_SPREADSHEET_ID_COMM_EST` (for commercial estimation)

### Connection Refused
- Ensure the server is running on the correct port
- Check firewall settings
- Verify the base URL is correct

---

## Environment Variables Required

Make sure these are set in your `.env` file:

```env
# Google Sheets API (for both APIs)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
# OR
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Spreadsheet IDs
GOOGLE_SPREADSHEET_ID=your-packaging-spreadsheet-id
GOOGLE_SPREADSHEET_ID_COMM_EST=your-commercial-spreadsheet-id

# Optional: Enable database writes for packaging estimation
ENABLE_DATABASE_WRITE=true
```

---

## Quick Test Commands (cURL)

### Packaging Estimation
```bash
curl -X POST http://localhost:8080/api/pck-est/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "len": 120,
    "brd": 50,
    "height": 75,
    "qty": 15000,
    "matin": "FBB",
    "gsmTop": 300,
    "ptype": "Top Bottom"
  }'
```

### Commercial Estimation
```bash
curl -X POST http://localhost:8080/api/comm-est/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
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

---

## Notes

- Both APIs require authentication via JWT token
- The APIs fetch data from Google Sheets, so ensure your Google Sheets API credentials are properly configured
- Response times may vary depending on Google Sheets API latency
- For production use, consider implementing rate limiting and caching
