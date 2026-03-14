import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const masterTableData = require('./data/masterTable.json');
const tuckValueTableData = require('./data/tuckValueTable.json');

async function initializeSheets() {}

async function getMasterTable() {
  return masterTableData;
}

async function getTuckValueTable() {
  return tuckValueTableData;
}

async function writeToDatabase() {}

export {
  initializeSheets,
  getMasterTable,
  getTuckValueTable,
  writeToDatabase
};
