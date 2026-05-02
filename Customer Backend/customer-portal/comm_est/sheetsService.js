import { createRequire } from 'module';
import { getPricingTableData } from '../lib/pricingTablesStore.js';

const require = createRequire(import.meta.url);

const calculateSheetData = require('./data/calculateSheetData.json');
const optionsDataRaw = require('./data/optionsData.json');
const commercialMasterFallback = {
  ...optionsDataRaw,
  ...calculateSheetData
};

function isCommercialMasterData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const requiredArrayKeys = ['costarr', 'opsTable', 'opsTable1', 'opsTable2', 'mainTable', 'inputTable', 'displayTable'];
  return requiredArrayKeys.every((k) => Array.isArray(value[k]));
}

function normalizeCommercialMasterData(value) {
  const merged = {
    ...commercialMasterFallback,
    ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
  };
  return merged;
}

async function getCommercialMasterData() {
  const data = await getPricingTableData('comm_masterTable', commercialMasterFallback);
  return isCommercialMasterData(data) ? normalizeCommercialMasterData(data) : normalizeCommercialMasterData(commercialMasterFallback);
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
  const data = await getCommercialMasterData();
  return data;
}

export {
  initializeSheets,
  getRangeValues,
  getCalculateSheetData,
  getOptionsSheetData
};
