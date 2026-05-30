# Production Summary API – Proposed Shipment Details Extension

This document is a hand-off spec for the developer maintaining
`https://cdcapi.onrender.com/api/job-card/production-summary`.

We would like the batch endpoint to **also return per-job shipment details**
so the CDC Customer Portal can fetch everything it needs for the Excel
Export feature in a single call (per database), instead of stitching data
together from two separate sources.

---

## 1. Context

Today the portal builds its "Orders → Export to Excel" workbook from two
parallel data sources:

1. **Your batch production-summary API** (already implemented) – returns job
   metadata, paper specs, printing dates, etc.
2. **A direct SQL query against `dbo.ShipmentETA`** (run by the portal's own
   backend) – returns container shipping / ETA / tracking link data.

Joining these two streams in the portal's backend works but adds latency,
requires direct DB access on our side, and duplicates per-tenant logic.
Moving the shipment lookup into your batch endpoint means the portal can
make a single round-trip per database and just pipe the result into the
Excel exporter.

---

## 2. Current API contract (no change requested here, for reference)

### Endpoint

```
POST  https://cdcapi.onrender.com/api/job-card/production-summary
Content-Type: application/json
```

### Request body

```json
{
  "database": "KOL",
  "jobBookingNos": [
    "J01359/26-27",
    "J01358/26-27"
  ]
}
```

- `database` – `"KOL"` for the Kolkata SQL Server instance, `"AHM"` for
  Ahmedabad. (Both run the same `IndusEnterprise` schema.)
- `jobBookingNos` – array of `JobBookingNo` strings (the slash-delimited
  format from `dbo.JobBookingJobCard.JobBookingNo`).

### Existing response

```json
{
  "database": "KOL",
  "count": 2,
  "successCount": 2,
  "errorCount": 0,
  "results": [
    {
      "jobBookingNo": "J01359/26-27",
      "jobName": "Business studies form one",
      "textPages": "16(48)",
      "totalOrderQty": "5000",
      "textColor": null,
      "textPaper":  { "gsm": 70,  "paperQuality": "..." },
      "coverPaper": { "gsm": 250, "paperQuality": "..." },
      "closeSize": "L:176,H:250",
      "bindingStyle": "Center Stitching",
      "fileReceivedDate": "11-May-2026",
      "softCopyApprovalSentDate": "11-May-2026",
      "finalApprovalDate": "12-May-2026",
      "finallyApproved": "Yes",
      "textPrintingEndDate": "2026-05-22T23:13:43.547Z",
      "textPrintingCompletionPct": 100,
      "coverPrintingEndDate": "2026-05-25T20:55:57.200Z",
      "coverPrintingCompletionPct": 100,
      "bindingEndDate": "2026-05-26T17:11:16.073Z",
      "lastGpnDate": "2026-05-27T19:46:50.237Z"
    },
    { "jobBookingNo": "J01358/26-27", "...": "..." }
  ]
}
```

---

## 3. What we want added

Each entry in the `results` array should additionally carry the matching
shipment row, plus the container number used to look it up. Suggested
shape:

```json
{
  "jobBookingNo": "J01359/26-27",
  "...": "(all existing production-summary fields, unchanged)",

  "containerNo": "ABCU1234567",
  "shipment": {
    "containernumber": "ABCU1234567",
    "vessel": "...",
    "voyage": "...",
    "pol": "...",
    "pod": "...",
    "etd": "2026-05-30T00:00:00.000Z",
    "eta": "2026-06-20T00:00:00.000Z",
    "link": "https://track.example.com/ABCU1234567",
    "...": "(any other columns currently in dbo.ShipmentETA)"
  }
}
```

Rules:

- `containerNo` (top-level) – the container number associated with the job;
  source described in §4 below. **May be `null`** if the job has not been
  dispatched yet (no FG Dispatch voucher / no `ContainerNo` recorded).
- `shipment` (object) – the matching row from `dbo.ShipmentETA`, with all
  its columns inlined as JSON. **May be `null`** if either:
  - `containerNo` is null, OR
  - `containerNo` is non-null but there is no matching row in
    `dbo.ShipmentETA`.
- If multiple rows exist in `ShipmentETA` for the same `containernumber`,
  return either (a) the **latest** by `ETA` / `CreatedDate` / equivalent,
  or (b) an array of rows under a `shipments: [ ... ]` key. Either is fine –
  we'll display whatever you pick; just pick one and document it.

Optionally bump the response with shipment counters for symmetry with the
existing success/error counters:

```json
{
  "database": "KOL",
  "count": 2,
  "successCount": 2,
  "errorCount": 0,
  "shipmentMatches": 1,
  "results": [ ... ]
}
```

---

## 4. Data source – exactly what the portal does today

### 4.1 Container number per job

The container number for a job is the **last non-empty `ContainerNo` from
the FG Dispatch voucher (`voucherid = -51`)** linked to that job. This is
the same logic baked into `dbo.portal_orders_list2`:

```sql
SELECT
    fgd.JobBookingID,
    MAX(CASE
          WHEN fgm.ContainerNo IS NOT NULL
           AND LTRIM(RTRIM(fgm.ContainerNo)) <> ''
          THEN fgm.ContainerNo
        END) AS ContainerNo
FROM dbo.FinishGoodsTransactionMain fgm
JOIN dbo.FinishGoodsTransactiondetail fgd
  ON fgd.FGTransactionID = fgm.FGtransactionID
WHERE fgm.voucherid = -51
  AND ISNULL(fgm.IsDeletedTransaction, 0) = 0
  AND ISNULL(fgd.IsDeletedTransaction, 0) = 0
GROUP BY fgd.JobBookingID;
```

Mapping to the input `JobBookingNo` string is via
`dbo.JobBookingJobCard.JobBookingID ↔ JobBookingNo`. The same join used in
`portal_orders_list2`.

### 4.2 Shipment row by container

Once you have a container number, this is the exact query our portal
currently runs:

```sql
SELECT *
FROM   dbo.ShipmentETA
WHERE  containernumber = @ContainerNo;
```

- Column name is lowercase `containernumber` (verified on both KOL and AHM
  DBs).
- All columns from the row are inlined into the portal's Excel as-is, so
  please return them all – do not project a fixed subset. Especially do not
  drop the `link` column (it carries the tracking URL the portal renders as
  a "Track" link in the existing per-order Shipment Details modal).

### 4.3 Suggested combined SQL pattern (per-batch)

If it helps your implementation, the whole lookup can be expressed as a
single CTE-driven query parameterised on a TVP / table-valued parameter of
job booking numbers:

```sql
-- @InputJobs is a table type (JobBookingNo NVARCHAR(50))
WITH JobContainer AS (
    SELECT
        JEJ.JobBookingNo,
        MAX(CASE
              WHEN fgm.ContainerNo IS NOT NULL
               AND LTRIM(RTRIM(fgm.ContainerNo)) <> ''
              THEN fgm.ContainerNo
            END) AS ContainerNo
    FROM dbo.JobBookingJobCard JEJ
    LEFT JOIN dbo.FinishGoodsTransactiondetail fgd
           ON fgd.JobBookingID = JEJ.JobBookingID
          AND ISNULL(fgd.IsDeletedTransaction, 0) = 0
    LEFT JOIN dbo.FinishGoodsTransactionMain fgm
           ON fgm.FGtransactionID = fgd.FGTransactionID
          AND fgm.voucherid = -51
          AND ISNULL(fgm.IsDeletedTransaction, 0) = 0
    WHERE JEJ.JobBookingNo IN (SELECT JobBookingNo FROM @InputJobs)
    GROUP BY JEJ.JobBookingNo
)
SELECT  jc.JobBookingNo,
        jc.ContainerNo,
        s.*                       -- all ShipmentETA columns
FROM    JobContainer jc
LEFT JOIN dbo.ShipmentETA s
       ON s.containernumber = jc.ContainerNo;
```

This returns one row per input job, with `s.*` columns coming back `NULL`
when no container is available or no shipment row matches.

---

## 5. Behaviour rules / edge cases

| Case | Expected response per job |
|---|---|
| Job exists, has container, has matching `ShipmentETA` row | `containerNo: "..."`, `shipment: { ... }` |
| Job exists, has container, no `ShipmentETA` row | `containerNo: "..."`, `shipment: null` |
| Job exists, no FG-Dispatch / no container yet | `containerNo: null`, `shipment: null` |
| Job not found in DB (unknown `jobBookingNo`) | Same handling as today (omit from `results` or include with `error` field) |
| Multiple `ShipmentETA` rows for same container | Pick latest by ETA / CreatedDate, **or** return `shipments: [ ... ]` array – please pick one and document |

Schema fields like `ETA`, `ETD`, dates, etc. should be serialised as ISO
8601 strings (the same convention currently used for
`textPrintingEndDate`, `bindingEndDate`, etc.).

---

## 6. Tables involved (`IndusEnterprise` schema, both KOL and AHM)

| Table | Role | Key columns used |
|---|---|---|
| `dbo.JobBookingJobCard` | Job header | `JobBookingID` (int PK), `JobBookingNo` (the public string) |
| `dbo.FinishGoodsTransactionMain` | FG voucher header | `FGtransactionID`, `voucherid` (= `-51` for Dispatch / DN), `ContainerNo` (nvarchar), `IsDeletedTransaction` |
| `dbo.FinishGoodsTransactiondetail` | FG voucher lines | `FGTransactionID`, `JobBookingID`, `IsDeletedTransaction` |
| `dbo.ShipmentETA` | Shipment / ETA / tracking | `containernumber` (lookup key, lowercase), plus all other columns (vessel, voyage, pol/pod, etd/eta, link, etc.) |

`ShipmentETA.containernumber` is the join key. Treat container numbers as
case-sensitive exact match — that's how `portal_orders_list2` stores them
and how our existing direct lookup queries them.

---

## 7. Example: full proposed request & response

### Request

```http
POST https://cdcapi.onrender.com/api/job-card/production-summary
Content-Type: application/json

{
  "database": "KOL",
  "jobBookingNos": [
    "J01359/26-27",
    "J01015_26_27"
  ]
}
```

### Response (proposed)

```json
{
  "database": "KOL",
  "count": 2,
  "successCount": 2,
  "errorCount": 0,
  "shipmentMatches": 1,
  "results": [
    {
      "jobBookingNo": "J01359/26-27",
      "jobName": "Business studies form one",
      "textPages": "16(48)",
      "totalOrderQty": "5000",
      "textColor": null,
      "textPaper":  { "gsm": 70,  "paperQuality": "0, Maplitho, 70 GSM, NR, NONE, 740 mm-" },
      "coverPaper": { "gsm": 250, "paperQuality": "Gloss Art, 250 GSM, Imported, NONE, 585x915-" },
      "closeSize": "L:176,H:250",
      "bindingStyle": "Center Stitching",
      "fileReceivedDate": "11-May-2026",
      "softCopyApprovalSentDate": "11-May-2026",
      "finalApprovalDate": "12-May-2026",
      "finallyApproved": "Yes",
      "textPrintingEndDate": "2026-05-22T23:13:43.547Z",
      "textPrintingCompletionPct": 100,
      "coverPrintingEndDate": "2026-05-25T20:55:57.200Z",
      "coverPrintingCompletionPct": 100,
      "bindingEndDate": "2026-05-26T17:11:16.073Z",
      "lastGpnDate": "2026-05-27T19:46:50.237Z",

      "containerNo": "ABCU1234567",
      "shipment": {
        "containernumber": "ABCU1234567",
        "vessel": "MV CDC EXPRESS",
        "voyage": "V123E",
        "pol": "Kolkata",
        "pod": "Mombasa",
        "etd": "2026-05-30T00:00:00.000Z",
        "eta": "2026-06-22T00:00:00.000Z",
        "link": "https://track.example.com/ABCU1234567"
      }
    },
    {
      "jobBookingNo": "J01015_26_27",
      "jobName": "Sticker - Ultimate Underwater Utopia title",
      "...": "(production fields, unchanged)",

      "containerNo": null,
      "shipment": null
    }
  ]
}
```

---

## 8. Notes for the implementer

- The portal already groups jobs by database before calling – so a single
  invocation of this endpoint will always have one consistent `database`
  value for all `jobBookingNos`.
- The portal currently calls the endpoint with chunks of up to 100 job
  numbers, sequentially per database, with one retry on HTTP 5xx / timeout.
- It would be very helpful if the new behaviour is **non-breaking**:
  - Existing fields untouched.
  - New fields (`containerNo`, `shipment`) just additive on each
    `results[i]`.
  - Add the optional `shipmentMatches` counter if convenient; if absent,
    we'll compute it client-side from `results.filter(r => r.shipment)`.
- If easier, exposing the shipment payload as a **separate** sibling
  endpoint (e.g. `POST /api/job-card/shipment-details` with the same
  `{ database, jobBookingNos }` request shape and a `results` array keyed
  on `jobBookingNo`) is also acceptable – we'd just call both endpoints in
  parallel per database. We'd still prefer the combined response, though.

---

## 9. Contact

- Portal backend codebase reference: `Customer Backend/customer-portal/portalapi.js`
- Current direct-SQL fallback path (will be retired once your endpoint
  returns shipment data): `GET /api/orders/:jobId/shipment-details`
- For questions, ping the CDC Customer Portal team.
