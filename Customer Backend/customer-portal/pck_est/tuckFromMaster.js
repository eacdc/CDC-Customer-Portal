import { createRequire } from "module";

const require = createRequire(import.meta.url);
const tuckFallback = require("./data/tuckValueTable.json");

/** Master rows that carry width/glue and height/tuck (Wastage, Kraft Wastage, Print). */
export const TUCK_ROWS_IN_MASTER = [1, 2, 3];

export const COL_WIDTH = 36;
export const COL_GLUE = 37;
export const COL_HEIGHT = 39;
export const COL_TUCK = 40;

function padRow(row, minLen) {
  const out = Array.isArray(row) ? row.slice() : [];
  while (out.length < minLen) out.push("");
  return out;
}

/**
 * Build the 3×5 tuck grid used by getTuckValue() from masterTable Mongo/sheet columns.
 */
export function deriveTuckValueTableFromMaster(masterTable) {
  const out = [];
  for (let i = 0; i < TUCK_ROWS_IN_MASTER.length; i += 1) {
    const r = TUCK_ROWS_IN_MASTER[i];
    const row = Array.isArray(masterTable[r]) ? masterTable[r] : [];
    const fb = Array.isArray(tuckFallback[i]) ? tuckFallback[i] : ["", "", "", "", ""];
    const cell = (c, fi) => {
      const v = row[c];
      if (v != null && String(v).trim() !== "") return String(v);
      return fb[fi] != null ? String(fb[fi]) : "";
    };
    out.push([
      cell(COL_WIDTH, 0),
      cell(COL_GLUE, 1),
      "",
      cell(COL_HEIGHT, 3),
      cell(COL_TUCK, 4),
    ]);
  }
  return out;
}

/**
 * Write tuck grid edits back onto the same master rows/columns (for PUT /tuck-table).
 */
export function mergeTuckValueTableIntoMaster(masterTable, tuckTable) {
  const m = JSON.parse(JSON.stringify(masterTable));
  const maxCol = Math.max(COL_WIDTH, COL_GLUE, COL_HEIGHT, COL_TUCK) + 1;
  for (let i = 0; i < TUCK_ROWS_IN_MASTER.length; i += 1) {
    const r = TUCK_ROWS_IN_MASTER[i];
    const trow = Array.isArray(tuckTable) ? tuckTable[i] : null;
    if (!trow) continue;
    if (!Array.isArray(m[r])) m[r] = [];
    m[r] = padRow(m[r], maxCol);
    if (trow[0] !== undefined && trow[0] !== null) m[r][COL_WIDTH] = String(trow[0]);
    if (trow[1] !== undefined && trow[1] !== null) m[r][COL_GLUE] = String(trow[1]);
    if (trow[3] !== undefined && trow[3] !== null) m[r][COL_HEIGHT] = String(trow[3]);
    if (trow[4] !== undefined && trow[4] !== null) m[r][COL_TUCK] = String(trow[4]);
  }
  return m;
}
