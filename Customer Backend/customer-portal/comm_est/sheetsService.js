import { getPricingTableData } from '../lib/pricingTablesStore.js';

/**
 * Commercial / book master data accessor.
 *
 * Source of truth: MongoDB `pricing_tables` doc with _id="comm_masterTable".
 * No JSON fallback — if the doc is missing, getPricingTableData throws.
 *
 * The doc must contain all of:
 *   costarr, opsTable, opsTable1, opsTable2, mainTable, inputTable, displayTable
 */

const REQUIRED_KEYS = [
  'costarr',
  'opsTable',
  'opsTable1',
  'opsTable2',
  'mainTable',
  'inputTable',
  'displayTable'
];

function assertCommercialMasterShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      'pricing_tables.comm_masterTable.data is not a plain object — ' +
      'fix the document in MongoDB.'
    );
  }
  for (const k of REQUIRED_KEYS) {
    if (!Array.isArray(value[k])) {
      throw new Error(
        `pricing_tables.comm_masterTable.data is missing required array key "${k}" — ` +
        `fix the document in MongoDB.`
      );
    }
  }
}

async function getCommercialMasterData() {
  const data = await getPricingTableData('comm_masterTable');
  assertCommercialMasterShape(data);
  return data;
}

async function initializeSheets() {}

async function getRangeValues() {
  return [];
}

async function getCalculateSheetData() {
  const data = await getCommercialMasterData();
  return {
    mainTable: data.mainTable,
    inputTable: data.inputTable,
    displayTable: data.displayTable
  };
}

async function getOptionsSheetData() {
  return await getCommercialMasterData();
}

export {
  initializeSheets,
  getRangeValues,
  getCalculateSheetData,
  getOptionsSheetData
};
