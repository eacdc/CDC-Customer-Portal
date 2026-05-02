import { getPricingTableData } from '../lib/pricingTablesStore.js';
import { deriveTuckValueTableFromMaster } from './tuckFromMaster.js';

async function initializeSheets() {}

async function getMasterTable() {
  return getPricingTableData('masterTable');
}

/** Tuck/glue grid is stored on master rows 1–3 (cols 36–37, 39–40); derived after Mongo load. */
async function getTuckValueTable() {
  const master = await getMasterTable();
  return deriveTuckValueTableFromMaster(master);
}

async function writeToDatabase() {}

export {
  initializeSheets,
  getMasterTable,
  getTuckValueTable,
  writeToDatabase
};
