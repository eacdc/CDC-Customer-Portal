import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const calculateSheetData = require('./data/calculateSheetData.json');
const optionsDataRaw = require('./data/optionsData.json');

async function initializeSheets() {}

async function getRangeValues() {
  return [];
}

async function getCalculateSheetData() {
  return calculateSheetData;
}

async function getOptionsSheetData() {
  return optionsDataRaw;
}

export {
  initializeSheets,
  getRangeValues,
  getCalculateSheetData,
  getOptionsSheetData
};
