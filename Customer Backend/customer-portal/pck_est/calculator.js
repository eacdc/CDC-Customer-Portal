import { getMasterTable, writeToDatabase, getTuckValueTable } from './sheetsService.js';

const bufferL = 10;
const bufferW = 20;

/**
 * Helper function for logging with timestamps
 */
function logStep(step, startTime = null, parentStartTime = null) {
  const now = Date.now();
  const timestamp = new Date().toISOString();
  if (startTime) {
    const duration = now - startTime;
    const totalTime = parentStartTime ? ` (Total: ${now - parentStartTime}ms)` : '';
    console.log(`[${timestamp}] ⏱️  ${step} - Duration: ${duration}ms${totalTime}`);
    return now;
  } else {
    console.log(`[${timestamp}] 📍 ${step}`);
    return now;
  }
}

/**
 * Main pricing calculation function
 */
async function calculatePricing(input, requestStartTime = null) {
  const calcStartTime = Date.now();
  logStep('>>> calculatePricing: Starting calculation');
  
  try {
    let stepTime = Date.now();
    logStep('>>> Fetching master table from Google Sheets');
    // Get master table from Google Sheets
    const masterTable = await getMasterTable();
    stepTime = logStep('>>> Master table fetched', stepTime, requestStartTime);
    
    stepTime = Date.now();
    logStep('>>> Fetching tuck value table from Google Sheets');
    const tuckValueTable = await getTuckValueTable();
    stepTime = logStep('>>> Tuck value table fetched', stepTime, requestStartTime);

    stepTime = Date.now();
    logStep('>>> Processing input parameters', stepTime, requestStartTime);
    
    const len = input.len;
    const brd = input.brd;
    const height = input.height;
    const qty = Number(input.qty);
    const paperTypeTopOrInner = String(input.matin);
    const gsmTopOrInner = Number(input.gsmTop);
    const corrLayerInn = Number(input.corrLayIn || 0);
    const productType = String(input.ptype);
    
    stepTime = Date.now();
    logStep('>>> Calculating tuck and glue values', stepTime, requestStartTime);
    const tuckGlue = getTuckValue(corrLayerInn, brd, height, tuckValueTable);
    const glue = tuckGlue[1];
    const tuck = tuckGlue[0];
    stepTime = logStep('>>> Tuck/glue calculation completed', stepTime, requestStartTime);
    
    stepTime = Date.now();
    logStep('>>> Calculating order size and outer dimensions', stepTime, requestStartTime);
    const orderSz = (((2 * len + 2 * brd + glue) * (height + 2 * brd + tuck)) * gsmTopOrInner / (1000 * 1000 * 1000)) * qty;
    const boxPerOuter = productType === "Top Bottom" ? 1 : 10;
    const lenOuter = brd * boxPerOuter + 10 + 1 * boxPerOuter;
    const brdOuter = len + 5;
    const heightOuter = height + 7;
    const frontColIn = Number(input.frontColIn || 0);
    const backColIn = Number(input.backColIn || 0);
    const frontSurIn = String(input.frontSurIn || '').toUpperCase();
    const backSurIn = String(input.backSurIn || '').toUpperCase();
    const kraftGsmIn = Number(input.kraftGsmIn || 0);
    const windowIn = Number(input.windowIn || 0);
    const foilIn = Number(input.fooinIn || 0);

    const paperTypeBotOrOuter = String(input.matBot || '');
    const gsmBot = Number(input.gsmBot || 0);
    const frontColBot = Number(input.frontColBot || 0);
    const frontSurBot = String(input.frontSur || '');

    stepTime = Date.now();
    logStep('>>> Looking up paper prices', stepTime, requestStartTime);
    const pricePerKGIn = XLOOKUP(paperTypeTopOrInner, masterTable, 1, 2, 78, 0);
    const kraftRate = 30;
    const pricePerKGOut = XLOOKUP(paperTypeBotOrOuter, masterTable, 1, 2, 78, 0);
    const delCost = 2;
    const overhead = 0.1;
    stepTime = logStep('>>> Paper price lookup completed', stepTime, requestStartTime);

    const inputData = [
      len, brd, height, qty, paperTypeTopOrInner, gsmTopOrInner, corrLayerInn, productType,
      orderSz, boxPerOuter, lenOuter, brdOuter, heightOuter, frontColIn, backColIn,
      frontSurIn, backSurIn, kraftGsmIn, windowIn, foilIn, paperTypeBotOrOuter, gsmBot,
      frontColBot, frontSurBot, pricePerKGIn, kraftRate, pricePerKGOut, delCost, overhead
    ];

    stepTime = Date.now();
    logStep(`>>> Calculating sheet size for product type: ${productType}`, stepTime, requestStartTime);
    
    let bestLen, bestBrd, maxUps;

    if (productType === "RTI") {
      if (orderSz < 1000 && paperTypeTopOrInner.indexOf("GB") !== -1) {
        const result = selectStdSheet(masterTable, len, brd, height, glue, tuck);
        bestLen = result[0];
        bestBrd = result[1];
        maxUps = result[2];
      } else {
        const mcSize = calMachineSz(len, brd, height, tuck, glue, qty, productType);
        const mcWidth = mcSize[0];
        const mcheight = mcSize[1];
        const result = getSheetSzRTI(mcWidth, mcheight, len, brd, height, glue, tuck);
        bestLen = result[0];
        bestBrd = result[1];
        maxUps = result[2];
      }
    } else if (productType === "Top Bottom") {
      const mcSize = calMachineSz(len, brd, height, tuck, glue, qty, productType);
      const mcWidth = mcSize[0];
      const mcheight = mcSize[1];
      const result = getSheetSzTB(mcWidth, mcheight, len, brd, height, glue, tuck);
      bestLen = result[0];
      bestBrd = result[1];
      maxUps = result[2];
    } else if (productType === "Universal") {
      const mcSize = calMachineSz(len, brd, height, tuck, glue, qty, productType);
      const mcWidth = mcSize[0];
      const mcheight = mcSize[1];
      const result = getSheetSzUn(mcWidth, mcheight, len, brd, height, glue, tuck);
      bestLen = result[0];
      bestBrd = result[1];
      maxUps = result[2];
    } else if (productType === "Haugland" || productType === "Crash Lock") {
      const mcSize = calMachineSz(len, brd, height, tuck, glue, qty, productType);
      const mcWidth = mcSize[0];
      const mcheight = mcSize[1];
      const result = getSheetSzCL_HL(mcWidth, mcheight, len, brd, height, glue, tuck);
      bestLen = result[0];
      bestBrd = result[1];
      maxUps = result[2];
    } else if (productType === "Cake Box") {
      const mcSize = calMachineSz(len, brd, height, tuck, glue, qty, productType);
      const mcWidth = mcSize[0];
      const mcheight = mcSize[1];
      const result = getSheetSzCB(mcWidth, mcheight, len, brd, height, glue, tuck);
      bestLen = result[0];
      bestBrd = result[1];
      maxUps = result[2];
    }

    const mcWidthOuter = 1020;
    const mcheightOuter = 730;
    let maxUpsOuter, bestLenOuter, bestBrdOuter;

    if (productType !== "Top Bottom") {
      if (Math.ceil((2 * heightOuter + brdOuter + 20 + 16 + brdOuter * 1.4) / 5) * 5 <= mcheightOuter &&
          Math.ceil(((2 * lenOuter + 2 * brdOuter) + 30) / 5) * 5 <= mcWidthOuter) {
        maxUpsOuter = 2;
        bestLenOuter = Math.ceil(((2 * lenOuter + 2 * brdOuter) + 30) / 5) * 5;
        bestBrdOuter = Math.ceil((heightOuter * maxUpsOuter + brdOuter + 20 + 16 + brdOuter * 0.7 * maxUpsOuter) / 5) * 5;
      } else if (Math.ceil((2 * heightOuter + brdOuter + 20 + 16 + brdOuter * 1.4) / 5) * 5 > mcheightOuter &&
                 Math.ceil(((2 * lenOuter + 2 * brdOuter) + 30) / 5) * 5 <= mcWidthOuter) {
        maxUpsOuter = 1;
        bestLenOuter = Math.ceil(((2 * lenOuter + 2 * brdOuter) + 30) / 5) * 5;
        bestBrdOuter = Math.ceil((heightOuter * maxUpsOuter + brdOuter + 20 + 16 + brdOuter * 0.7 * maxUpsOuter) / 5) * 5;
      } else if (Math.ceil((2 * heightOuter + brdOuter + 20 + 16 + brdOuter * 1.4) / 5) * 5 <= mcheightOuter &&
                 Math.ceil(((2 * lenOuter + 2 * brdOuter) + 30) / 5) * 5 > mcWidthOuter) {
        maxUpsOuter = 1;
        bestLenOuter = Math.ceil(((lenOuter + brdOuter) + 15) / 5) * 5;
        bestBrdOuter = Math.ceil((heightOuter * 2 + brdOuter + 20 + 16 + brdOuter * 0.7 * 2) / 5) * 5;
      } else if (Math.ceil((2 * heightOuter + brdOuter + 20 + 16 + brdOuter * 1.4) / 5) * 5 > mcheightOuter &&
                 Math.ceil(((2 * lenOuter + 2 * brdOuter) + 30) / 5) * 5 > mcWidthOuter) {
        maxUpsOuter = 0.5;
        bestLenOuter = Math.ceil(((lenOuter + brdOuter) + 15) / 5) * 5;
        bestBrdOuter = Math.ceil((heightOuter + brdOuter + 20 + 16 + brdOuter * 0.7) / 5) * 5;
      }
    } else {
      maxUpsOuter = maxUps;
      bestLenOuter = bestLen;
      bestBrdOuter = bestBrd;
    }
    stepTime = logStep('>>> Sheet size calculation completed', stepTime, requestStartTime);

    stepTime = Date.now();
    logStep('>>> Building calculate table', stepTime, requestStartTime);
    const calculateTable1 = [[], []];
    calculateTable1[0][2] = maxUps;
    calculateTable1[0][0] = bestLen;
    calculateTable1[0][1] = bestBrd;
    calculateTable1[1][2] = maxUpsOuter;
    calculateTable1[1][0] = bestLenOuter;
    calculateTable1[1][1] = bestBrdOuter;
    stepTime = logStep('>>> Calculate table built', stepTime, requestStartTime);

    stepTime = Date.now();
    logStep('>>> Calculating inner costs', stepTime, requestStartTime);
    // Calculate costs for inner
    const wasteIn = wastage(qty, maxUps, masterTable);
    const paperweightIn = paperWt(qty, maxUps, bestLen, bestBrd, gsmTopOrInner, wasteIn);
    const kraftWeightIn = kraftWt(bestBrd, bestLen, maxUps, corrLayerInn, kraftGsmIn, qty);
    const paperPerUnitIn = paperPerUnit(paperweightIn, pricePerKGIn, qty);
    const ctpPerUnitIn = ctpPerUnit(frontColIn, backColIn, qty, masterTable[0][25]);
    const printPerunitIn = printPerunit(frontSurIn, backSurIn, frontColIn, backColIn, qty, maxUps, masterTable[3][1], masterTable[0][43]);
    const surfacePerUnitIn = surfacePerUnit(bestBrd, bestLen, maxUps, frontSurIn, backSurIn, masterTable, 2);
    const kraftPerunitIn = kraftPerunit(bestBrd, bestLen, maxUps, corrLayerInn, kraftGsmIn, kraftRate);
    const diceCostIn = diceCost(foilIn, masterTable[2][17], masterTable[1][17], qty);
    const window_foil_Cost_In = window_foil_Cost(windowIn, foilIn, masterTable);
    const punch_paste_In = punch_paste(maxUps, masterTable[5][1], kraftGsmIn, bestBrd, bestLen, masterTable[7][1], masterTable[6][1]);
    const pack_del_In = pack_del(paperweightIn, kraftWeightIn, delCost, masterTable[8][1], qty);
    const Corr_conv_In = Corr_conv(kraftWeightIn, masterTable[12][1], qty);

    stepTime = Date.now();
    logStep('>>> Calculating variable costs for inner', stepTime, requestStartTime);
    const varCostIn = Number(paperPerUnit(paperweightIn, XLOOKUP(paperTypeTopOrInner, masterTable, 1, 4, 78, 0), qty) || 0) +
      Number(ctpPerUnit(frontColIn, backColIn, qty, masterTable[0][25]) || 0) +
      Number(printPerunitActual(frontSurIn, backSurIn, frontColIn, backColIn, maxUps, masterTable[3][3]) || 0) +
      Number(surfacePerUnit(bestBrd, bestLen, maxUps, frontSurIn, backSurIn, masterTable, 4) || 0) +
      Number(kraftPerunit(bestBrd, bestLen, maxUps, corrLayerInn, kraftGsmIn, kraftRate) || 0) +
      Number(diceCost(foilIn, masterTable[2][17], masterTable[1][17], qty) || 0) +
      Number(window_foil_Cost(windowIn, foilIn, masterTable) || 0) +
      Number(punch_paste(maxUps, masterTable[5][3], kraftGsmIn, bestBrd, bestLen, masterTable[7][3], masterTable[6][3]) || 0) +
      Number(pack_del(paperweightIn, kraftWeightIn, delCost, masterTable[8][3], qty) || 0) +
      Number(Corr_conv(kraftWeightIn, masterTable[12][3], qty) || 0);
    stepTime = logStep('>>> Variable costs for inner calculated', stepTime, requestStartTime);

    stepTime = Date.now();
    logStep('>>> Calculating final pricing for inner', stepTime, requestStartTime);
    const price_per_unit_In = (Number(paperPerUnitIn || 0) + Number(ctpPerUnitIn || 0) + Number(printPerunitIn || 0) + Number(surfacePerUnitIn || 0) +
      Number(kraftPerunitIn || 0) + Number(diceCostIn || 0) + Number(window_foil_Cost_In || 0) + Number(punch_paste_In || 0) + Number(pack_del_In || 0) + Number(Corr_conv_In || 0)) * (1 + overhead);
    const varCostInNum = Number(varCostIn) || 0;
    const gpPerIn = varCostInNum > 0 ? (price_per_unit_In / varCostInNum) - 1 : 0;
    const gpPerImpIn = (price_per_unit_In - varCostInNum) * maxUps;
    stepTime = logStep('>>> Final pricing for inner completed', stepTime, requestStartTime);
    stepTime = logStep('>>> Inner costs calculation completed', stepTime, requestStartTime);

    stepTime = Date.now();
    logStep('>>> Calculating outer costs', stepTime, requestStartTime);
    const wasteOut = wastage(qty / boxPerOuter, maxUpsOuter, masterTable);
    const paperweightOut = paperWt(qty / boxPerOuter, maxUpsOuter, bestLenOuter, bestBrdOuter, gsmBot, wasteOut);
    const kraftWeightOut = kraftWt(bestBrdOuter, bestLenOuter, maxUpsOuter, 0, 0, qty / boxPerOuter);
    const paperPerUnitOut = paperPerUnit(paperweightOut, pricePerKGOut, qty / boxPerOuter);
    const ctpPerUnitOut = ctpPerUnit(frontColBot, "", qty / boxPerOuter, masterTable[0][25]);
    const printPerunitOut = printPerunit(frontSurBot, "", frontColBot, 0, qty / boxPerOuter, maxUpsOuter, masterTable[3][1], masterTable[0][44]);
    const surfacePerUnitOut = surfacePerUnit(bestBrdOuter, bestLenOuter, maxUpsOuter, frontSurBot, "", masterTable, 2);
    const kraftPerunitOut = kraftPerunit(bestBrdOuter, bestLenOuter, maxUpsOuter, 0, 0, kraftRate);
    const diceCostOut = diceCostIn;
    const window_foil_Cost_Out = 0;
    const punch_paste_Out = punch_paste(maxUpsOuter, masterTable[5][1], 0, bestBrdOuter, bestLenOuter, masterTable[7][1], masterTable[6][1]);
    const pack_del_Out = pack_del(paperweightOut, kraftWeightOut, delCost, masterTable[8][1], qty / boxPerOuter);
    const Corr_conv_Out = Corr_conv(kraftWeightOut, masterTable[12][1], qty / boxPerOuter);

    stepTime = Date.now();
    logStep('>>> Calculating variable costs for outer', stepTime, requestStartTime);
    const varCostOut = Number(paperPerUnit(paperweightOut, XLOOKUP(paperTypeBotOrOuter, masterTable, 1, 4, 78, 0), qty) || 0) +
      Number(ctpPerUnit(frontColBot, "", qty, masterTable[0][25]) || 0) +
      Number(printPerunitActual(frontSurBot, "", frontColBot, 0, maxUpsOuter, masterTable[3][3]) || 0) +
      Number(surfacePerUnit(bestBrdOuter, bestLenOuter, maxUpsOuter, frontSurBot, "", masterTable, 4) || 0) +
      Number(kraftPerunit(bestBrdOuter, bestLenOuter, maxUpsOuter, 0, 0, kraftRate) || 0) +
      Number(diceCost(0, masterTable[2][17], masterTable[1][17], qty) || 0) +
      Number(window_foil_Cost(0, 0, masterTable) || 0) +
      Number(punch_paste(maxUpsOuter, masterTable[5][3], kraftGsmIn, bestBrdOuter, bestLenOuter, masterTable[7][3], masterTable[6][3]) || 0) +
      Number(pack_del(paperweightOut, kraftWeightOut, delCost, masterTable[8][3], qty) || 0) +
      Number(Corr_conv(kraftWeightOut, masterTable[12][3], qty) || 0);
    stepTime = logStep('>>> Variable costs for outer calculated', stepTime, requestStartTime);

    stepTime = Date.now();
    logStep('>>> Calculating final pricing for outer', stepTime, requestStartTime);
    const price_per_unit_Out = (Number(paperPerUnitOut || 0) + Number(ctpPerUnitOut || 0) + Number(printPerunitOut || 0) + Number(surfacePerUnitOut || 0) +
      Number(kraftPerunitOut || 0) + Number(diceCostOut || 0) + Number(window_foil_Cost_Out || 0) + Number(punch_paste_Out || 0) + Number(pack_del_Out || 0) + Number(Corr_conv_Out || 0)) * (1 + overhead);
    const varCostOutNum = Number(varCostOut) || 0;
    const gpPerOut = varCostOutNum > 0 ? (price_per_unit_Out / varCostOutNum) - 1 : 0;
    const gpPerImpOut = (price_per_unit_Out - varCostOutNum) * maxUpsOuter;
    stepTime = logStep('>>> Final pricing for outer completed', stepTime, requestStartTime);
    stepTime = logStep('>>> Outer costs calculation completed', stepTime, requestStartTime);

    stepTime = Date.now();
    logStep('>>> Preparing final output data', stepTime, requestStartTime);
    const formattedDate = new Date().toISOString().split('T')[0];

    const final_output_data = [flatten([
      formattedDate, inputData, calculateTable1,
      [wasteIn, paperweightIn, kraftWeightIn, paperPerUnitIn, ctpPerUnitIn, printPerunitIn,
        surfacePerUnitIn, kraftPerunitIn, diceCostIn, window_foil_Cost_In, punch_paste_In,
        pack_del_In, Corr_conv_In],
      [wasteOut, paperweightOut, kraftWeightOut, paperPerUnitOut, ctpPerUnitOut, printPerunitOut,
        surfacePerUnitOut, kraftPerunitOut, diceCostOut, window_foil_Cost_Out, punch_paste_Out,
        pack_del_Out, Corr_conv_Out],
      [varCostIn, gpPerIn, gpPerImpIn, varCostOut, gpPerOut, gpPerImpOut],
      [price_per_unit_In, (productType === "Top Bottom" ? price_per_unit_Out : 0)]
    ])];

    // Write to database (optional - can be disabled)
    if (process.env.ENABLE_DATABASE_WRITE === 'true') {
      stepTime = Date.now();
      logStep('>>> Writing to database', stepTime, requestStartTime);
      try {
        await writeToDatabase(final_output_data);
        stepTime = logStep('>>> Database write completed', stepTime, requestStartTime);
      } catch (error) {
        console.warn('Failed to write to database:', error.message);
        stepTime = logStep('>>> Database write failed', stepTime, requestStartTime);
      }
    }

    stepTime = Date.now();
    logStep('>>> Building response object', stepTime, requestStartTime);
    const result = {
      calculateTable: calculateTable1,
      innerCosts: {
        waste: wasteIn,
        paperweight: paperweightIn,
        kraftWeight: kraftWeightIn,
        paperPerUnit: paperPerUnitIn,
        ctpPerUnit: ctpPerUnitIn,
        printPerunit: printPerunitIn,
        surfacePerUnit: surfacePerUnitIn,
        kraftPerunit: kraftPerunitIn,
        diceCost: diceCostIn,
        window_foil_Cost: window_foil_Cost_In,
        punch_paste: punch_paste_In,
        pack_del: pack_del_In,
        Corr_conv: Corr_conv_In
      },
      outerCosts: {
        waste: wasteOut,
        paperweight: paperweightOut,
        kraftWeight: kraftWeightOut,
        paperPerUnit: paperPerUnitOut,
        ctpPerUnit: ctpPerUnitOut,
        printPerunit: printPerunitOut,
        surfacePerUnit: surfacePerUnitOut,
        kraftPerunit: kraftPerunitOut,
        diceCost: diceCostOut,
        window_foil_Cost: window_foil_Cost_Out,
        punch_paste: punch_paste_Out,
        pack_del: pack_del_Out,
        Corr_conv: Corr_conv_Out
      },
      pricing: {
        price_per_unit_In: price_per_unit_In,
        price_per_unit_Out: price_per_unit_Out,
        varCostIn: varCostIn,
        varCostOut: varCostOut,
        gpPerIn: gpPerIn,
        gpPerOut: gpPerOut,
        gpPerImpIn: gpPerImpIn,
        gpPerImpOut: gpPerImpOut
      },
      metadata: {
        foilIn: foilIn,
        windowIn: windowIn
      }
    };
    stepTime = logStep('>>> Response object built', stepTime, requestStartTime);
    logStep(`>>> calculatePricing: Completed in ${Date.now() - calcStartTime}ms`, calcStartTime, requestStartTime);
    
    return result;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error in calculatePricing:`, error);
    logStep(`>>> calculatePricing: Failed after ${Date.now() - calcStartTime}ms`, calcStartTime, requestStartTime);
    throw error;
  }
}

// Helper functions from original code
function selectStdSheet(stdArray, len, brd, height, glue, tuck) {
  let minAreaReq = 15000000;
  const bestSzArray = [];

  for (let i = 0; i < stdArray.length; i++) {
    const xh = Math.floor((stdArray[i][1] - bufferL) / (2 * brd + 2 * len + glue));
    const yh = Math.floor((stdArray[i][0] - brd - tuck - bufferW) / (height + brd + tuck));
    const hUps = xh * yh;
    const xv = Math.floor((stdArray[i][1] - brd - tuck - bufferL) / (height + brd + tuck));
    const yv = Math.floor((stdArray[i][0] - bufferW) / (2 * brd + 2 * len + glue));
    const vUps = xv * yv;

    const maxUps = Math.max(hUps, vUps);
    const areaPerUps = (stdArray[i][0] * stdArray[i][1]) / maxUps;

    if (areaPerUps < minAreaReq) {
      minAreaReq = areaPerUps;
      bestSzArray[0] = stdArray[i][1];
      bestSzArray[1] = stdArray[i][0];
      bestSzArray[2] = maxUps;
    }
  }
  return bestSzArray;
}

function getSheetSzRTI(mcWidth, mcheight, len, brd, height, glue, tuck) {
  const bestSzArray = [];

  const xv = Math.floor((mcWidth - bufferW) / (2 * brd + 2 * len + glue));
  const yv = Math.floor((mcheight - brd - tuck - bufferL) / (height + brd + tuck));
  const vUps = xv * yv;
  const xh = Math.floor((mcWidth - brd - tuck - bufferW) / (height + brd + tuck));
  const yh = Math.floor((mcheight - bufferL) / (2 * brd + 2 * len + glue));
  const hUps = xh * yh;

  const maxUps = Math.max(hUps, vUps);

  bestSzArray[0] = vUps >= hUps ? (Math.round((((2 * brd + 2 * len + glue) * xv) + bufferL) / 5)) * 5 :
    (Math.round((((height + brd + tuck) * xh) + bufferL + brd + tuck) / 5)) * 5;
  bestSzArray[1] = vUps >= hUps ? (Math.round((((height + brd + tuck) * yv) + bufferW + brd + tuck) / 5)) * 5 :
    (Math.round((((2 * brd + 2 * len + glue) * yh) + bufferW) / 5)) * 5;
  bestSzArray[2] = maxUps;

  return bestSzArray;
}

function calMachineSz(len, brd, height, tuck, glue, qty, productType) {
  let mcWidth, mcheight;

  if (productType === "Top Bottom") {
    mcWidth = 1020;
    mcheight = 720;
  } else {
    let surfaceSz;
    if (productType === "RTI") {
      surfaceSz = (2 * brd + 2 * len + glue) * (height + brd + tuck) * qty;
    } else if (productType === "Universal") {
      surfaceSz = (2 * brd + 2 * len + tuck) * (height + brd * 1.5) * qty;
    } else if (productType === "Crash Lock" || productType === "Haugland") {
      surfaceSz = (4 * brd + tuck) * (height + brd * 0.7 + brd + tuck) * qty;
    } else if (productType === "Cake Box") {
      surfaceSz = (2 * brd + tuck + 2 * height) * (len * height * 1.47) * qty;
    }

    if (surfaceSz >= 3000000000) {
      mcWidth = 1020;
      mcheight = 720;
    } else if (surfaceSz >= 2000000000) {
      mcWidth = 980;
      mcheight = 650;
    } else if (surfaceSz >= 1500000000) {
      mcWidth = 920;
      mcheight = 630;
    } else {
      mcWidth = 800;
      mcheight = 560;
    }
  }

  return [mcWidth, mcheight];
}

function getSheetSzTB(mcWidth, mcheight, len, brd, height, glue, tuck) {
  const bestSzArray = [];

  const xh = Math.floor((mcWidth - 8) / (height + 4 * brd + 2 * tuck));
  const yh = Math.floor((mcheight - 17) / (2 * tuck + 4 * brd + len));
  const hUps = xh * yh;
  const xv = Math.floor((mcWidth - 8) / (2 * tuck + 4 * brd + len));
  const yv = Math.floor((mcheight - 17) / (height + 4 * brd + 2 * tuck));
  const vUps = xv * yv;

  const maxUps = Math.max(hUps, vUps);

  bestSzArray[0] = vUps >= hUps ? (Math.round((((4 * (brd - 1) + len + 2 * tuck) * xv) + 8) / 5)) * 5 :
    (Math.round((((height + 4 * (brd - 1) + 2 * tuck) * xh) + 8) / 5)) * 5;
  bestSzArray[1] = vUps >= hUps ? (Math.round((((height + 4 * brd + 2 * tuck) * yv) + 17) / 5)) * 5 :
    (Math.round((((2 * tuck + 4 * brd + len) * yh) + 17) / 5)) * 5;
  bestSzArray[2] = maxUps;

  return bestSzArray;
}

function getSheetSzUn(mcWidth, mcheight, len, brd, height, glue, tuck) {
  const bestSzArray = [];

  const xv = Math.floor((mcWidth - 8) / (len * 2 + brd * 2 + tuck));
  const yv = Math.floor((mcheight - 17) / (height + 1.5 * brd));
  const vUps = xv * yv;
  const xh = Math.floor((mcWidth - 8) / (height + 1.5 * brd));
  const yh = Math.floor((mcheight - 17) / (len * 2 + brd * 2 + tuck));
  const hUps = xh * yh;

  const maxUps = Math.max(hUps, vUps);

  bestSzArray[0] = vUps >= hUps ? (Math.round((((len * 2 + brd * 2 + tuck) * xv) + 8) / 5)) * 5 :
    (Math.round((((height + 1.5 * brd) * xh) + 8) / 5)) * 5;
  bestSzArray[1] = vUps >= hUps ? (Math.round((((height + 1.5 * brd) * yv) + 17) / 5)) * 5 :
    (Math.round((((len * 2 + brd * 2 + tuck) * yh) + 17) / 5)) * 5;
  bestSzArray[2] = maxUps;

  return bestSzArray;
}

function getSheetSzCL_HL(mcWidth, mcheight, len, brd, height, glue, tuck) {
  const bestSzArray = [];

  const xh = Math.floor(Math.floor((mcWidth - 8) / (height + 0.7 * brd + (brd + tuck) / 2)) / 2) * 2;
  const yh = Math.floor((mcheight - 17) / ((len + brd) * 2 + glue));
  const hUps = xh * yh;
  const xv = Math.floor((mcWidth - 8) / ((len + brd) * 2 + glue));
  const yv = Math.floor(Math.floor((mcheight - 17) / (height + 0.7 * brd + (brd + tuck) / 2)) / 2) * 2;
  const vUps = xv * yv;

  const maxUps = Math.max(hUps, vUps);

  bestSzArray[0] = hUps >= vUps ? (Math.round((((height + 0.7 * brd + (brd + tuck) / 2) * xh) + 8) / 5)) * 5 :
    (Math.round(((((len + brd) * 2 + glue) * xv) + 8) / 5)) * 5;
  bestSzArray[1] = hUps >= vUps ? (Math.round(((((len + brd) * 2 + glue) * yh) + 17) / 5)) * 5 :
    (Math.round((((height + 0.7 * brd + (brd + tuck) / 2) * yv) + 17) / 5)) * 5;
  bestSzArray[2] = maxUps;

  return bestSzArray;
}

function getSheetSzCB(mcWidth, mcheight, len, brd, height, glue, tuck) {
  const bestSzArray = [];

  const xh = Math.floor((mcWidth - 8) / (brd * 2 + height * 2 + tuck));
  const yh = Math.floor((mcheight - 17) / (len + 1.47 * height));
  const hUps = xh * yh;
  const xv = Math.floor((mcWidth - 8) / (len + 1.47 * height));
  const yv = Math.floor((mcheight - 17) / (brd * 2 + height * 2 + tuck));
  const vUps = xv * yv;

  const maxUps = Math.max(hUps, vUps);

  bestSzArray[0] = hUps >= vUps ? (Math.round((((2 * brd + 2 * height + tuck) * xh) + 8) / 5)) * 5 :
    (Math.round((((len + 1.47 * height) * xv) + 8) / 5)) * 5;
  bestSzArray[1] = hUps >= vUps ? (Math.round((((len + 1.47 * height) * yh) + 17) / 5)) * 5 :
    (Math.round((((2 * brd + 2 * height + tuck) * yv) + 17) / 5)) * 5;
  bestSzArray[2] = maxUps;

  return bestSzArray;
}

function getTuckValue(corrLayer, brd, height, masterTable) {
  let tuck = 12;
  let glue = 10;
  const tuck_glue_array = [];

  if (corrLayer !== "" && corrLayer !== 0) {
    tuck = 20;
    glue = 15;
  } else {
    for (let i = 0; i < masterTable.length; i++) {
      if (brd >= masterTable[i][0]) {
        glue = masterTable[i][1];
      }
      if (height >= masterTable[i][3]) {
        tuck = masterTable[i][4];
      }
    }
  }
  tuck_glue_array[0] = tuck;
  tuck_glue_array[1] = glue;
  return tuck_glue_array;
}

function flatten(arr) {
  return arr.reduce(function (flat, toFlatten) {
    return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
  }, []);
}




function wastage(qty, ups, lookupArray) {
  console.log('[wastage] Input values:', { qty, ups, qtyType: typeof qty, upsType: typeof ups, lookupArrayLength: lookupArray?.length });
  const upsNum = Number(ups) || 1;
  if (upsNum === 0) return 1;
  const searchValue = qty / upsNum;
  console.log('[wastage] Calculated searchValue:', searchValue, 'qty:', qty, 'upsNum:', upsNum);
  
  // Log the wastage matrix data from columns 22 and 23
  if (lookupArray && lookupArray.length > 0) {
    console.log('[wastage] Wastage matrix data (columns 22-23):');
    for (let i = 0; i < Math.min(lookupArray.length, 20); i++) {
      if (lookupArray[i] && lookupArray[i][21] !== undefined && lookupArray[i][22] !== undefined) {
        console.log(`  Row ${i}: [${lookupArray[i][21]}, ${lookupArray[i][22]}]`);
      }
    }
  }
  
  const waste = XLOOKUP(searchValue, lookupArray, 22, 23, 1, 1);
  const wasteNum = Number(waste);
  const result = isNaN(wasteNum) ? 1 : wasteNum;
  console.log('[wastage] Final result:', result);
  return result;
}

function paperWt(qty, ups, bestLen, bestBrd, gsm, waste) {
  console.log('[paperWt] Input values:', { qty, ups, bestLen, bestBrd, gsm, waste });
  const upsNum = Number(ups) || 1;
  const wasteNum = Number(waste) || 1;
  const qtyNum = Number(qty);
  const bestLenNum = Number(bestLen);
  const bestBrdNum = Number(bestBrd);
  const gsmNum = Number(gsm);
  console.log('[paperWt] Converted values:', { qtyNum, upsNum, bestLenNum, bestBrdNum, gsmNum, wasteNum });
  const sheets = Math.ceil(qtyNum / upsNum);
  const areaPerSheet = (bestBrdNum * bestLenNum * gsmNum) / (1000 * 1000 * 1000);
  const paperweight = sheets * areaPerSheet * wasteNum;
  console.log('[paperWt] Calculation steps:', { sheets, areaPerSheet, wasteNum, paperweight });
  const result = isNaN(paperweight) ? 0 : paperweight;
  console.log('[paperWt] Final result:', result);
  return result;
}

function kraftWt(bestBrd, bestLen, ups, corrLayer, kraftGsm, qty) {
  const upsNum = Number(ups) || 1;
  if (upsNum === 0) return 0;
  const kraftWeight = Number(bestBrd) / 1000 * Number(bestLen) / 1000 / upsNum * ((Number(corrLayer) / 2 * 1.33 + Number(corrLayer) / 2) * Number(kraftGsm) / 1000) * Number(qty);
  return isNaN(kraftWeight) ? 0 : kraftWeight;
}

function paperPerUnit(paperweight, paperPrice, qty) {
  console.log('[paperPerUnit] Input values:', { paperweight, paperPrice, qty, paperweightType: typeof paperweight, paperPriceType: typeof paperPrice, qtyType: typeof qty });
  const qtyNum = Number(qty) || 1;
  if (qtyNum === 0) {
    console.log('[paperPerUnit] qty is 0, returning 0');
    return 0;
  }
  const paperweightNum = Number(paperweight);
  const paperPriceNum = Number(paperPrice);
  console.log('[paperPerUnit] Converted values:', { paperweightNum, paperPriceNum, qtyNum });
  const ppu = (paperweightNum * paperPriceNum) / qtyNum;
  console.log('[paperPerUnit] Calculation:', `${paperweightNum} * ${paperPriceNum} / ${qtyNum} = ${ppu}`);
  const result = isNaN(ppu) ? 0 : ppu;
  console.log('[paperPerUnit] Final result:', result);
  return result;
}

function ctpPerUnit(frontCol, backCol, qty, plateCost) {
  const frontColNum = Number(frontCol) || 0;
  const backColNum = Number(backCol) || 0;
  const qtyNum = Number(qty) || 1;
  if (qtyNum === 0) return 0;
  const ctppu = (frontColNum * Number(plateCost)) / qtyNum + (backColNum * Number(plateCost)) / qtyNum;
  return isNaN(ctppu) ? 0 : ctppu;
}

function printPerunit(frontSur, backSur, frontCol, backCol, qty, ups, printCost, minimp) {
  const frontSurUpper = String(frontSur || '').toUpperCase();
  const frontColNum = Number(frontCol) || 0;
  const backColNum = Number(backCol) || 0;
  const printCostNum = Number(printCost) || 0;
  const minimpNum = Number(minimp) || 0;
  const qtyNum = Number(qty) || 1;
  const upsNum = Number(ups) || 1;
  
  if (qtyNum === 0) {
    return 0;
  }
  
  let frontSurCostPerUnit = 0;
  if (frontColNum > 0 && printCostNum > 0) {
    if (frontSurUpper === "UV GLOSS" || frontSurUpper === "METPET DRIP" || frontSurUpper === "DRIP OFF COATING") {
      frontSurCostPerUnit = ((frontColNum * printCostNum * 2) / 1000) * (Math.max(qtyNum / upsNum, minimpNum)) / qtyNum;
    } else {
      frontSurCostPerUnit = ((frontColNum * printCostNum) / 1000) * (Math.max(qtyNum / upsNum, minimpNum)) / qtyNum;
    }
  }

  const backSurUpper = String(backSur || '').toUpperCase();
  let backSurCostPerUnit = 0;
  
  if (backColNum > 0 && printCostNum > 0) {
    if (backSurUpper === "UV GLOSS" || backSurUpper === "METPET DRIP" || backSurUpper === "DRIP OFF COATING") {
      backSurCostPerUnit = ((backColNum * printCostNum * 2) / 1000) * (Math.max(qtyNum / upsNum, minimpNum)) / qtyNum;
    } else {
      backSurCostPerUnit = ((backColNum * printCostNum) / 1000) * (Math.max(qtyNum / upsNum, minimpNum)) / qtyNum;
    }
  }

  const result = Number(frontSurCostPerUnit) + Number(backSurCostPerUnit);
  return isNaN(result) ? 0 : result;
}

function printPerunitActual(frontSur, backSur, frontCol, backCol, ups, printCost) {
  const frontSurUpper = String(frontSur || '').toUpperCase();
  const frontColNum = Number(frontCol) || 0;
  const backColNum = Number(backCol) || 0;
  const printCostNum = Number(printCost) || 0;
  const upsNum = Number(ups) || 1;
  
  let frontSurCostPerUnit = 0;
  if (frontColNum > 0 && printCostNum > 0 && upsNum > 0) {
    if (frontSurUpper === "UV GLOSS" || frontSurUpper === "METPET DRIP" || frontSurUpper === "DRIP OFF COATING") {
      frontSurCostPerUnit = ((frontColNum * printCostNum * 2) / upsNum / 1000);
    } else {
      frontSurCostPerUnit = ((frontColNum * printCostNum) / upsNum / 1000);
    }
  }

  const backSurUpper = String(backSur || '').toUpperCase();
  let backSurCostPerUnit = 0;
  
  if (backColNum > 0 && printCostNum > 0 && upsNum > 0) {
    if (backSurUpper === "UV GLOSS" || backSurUpper === "METPET DRIP" || backSurUpper === "DRIP OFF COATING") {
      backSurCostPerUnit = ((backColNum * printCostNum * 2) / upsNum / 1000);
    } else {
      backSurCostPerUnit = ((backColNum * printCostNum) / upsNum / 1000);
    }
  }

  const result = Number(frontSurCostPerUnit) + Number(backSurCostPerUnit);
  return isNaN(result) ? 0 : result;
}

function surfacePerUnit(bestBrd, bestLen, ups, frontSur, backSur, lookupArray, lookupCol) {
  const frontSurUpper = String(frontSur || '').toUpperCase();
  const backSurUpper = String(backSur || '').toUpperCase();
  const frontLookup = XLOOKUP(frontSurUpper, lookupArray, 1, lookupCol, 0, 0);
  const backLookup = XLOOKUP(backSurUpper, lookupArray, 1, lookupCol, 0, 0);
  const upsNum = Number(ups) || 1;
  if (upsNum === 0) return 0;
  const spu = (Number(bestBrd) / 25.4 * Number(bestLen) / 25.4 / 100 / upsNum * Number(frontLookup)) + 
              (Number(bestBrd) / 25.4 * Number(bestLen) / 25.4 / 100 / upsNum * Number(backLookup));
  return isNaN(spu) ? 0 : spu;
}

function kraftPerunit(bestBrd, bestLen, ups, corrLayer, kraftGsm, kraftRate) {
  const upsNum = Number(ups) || 1;
  if (upsNum === 0) return 0;
  const kpu = Number(bestBrd) / 1000 * Number(bestLen) / 1000 / upsNum * ((Number(corrLayer) / 2 * 1.33 + Number(corrLayer) / 2) * Number(kraftGsm) / 1000) * Number(kraftRate);
  return isNaN(kpu) ? 0 : kpu;
}

function diceCost(foil, dc1, dc2, qty) {
  const qtyNum = Number(qty) || 1;
  if (qtyNum === 0) return 0;
  if (foil === "" || foil === 0 || !foil) {
    const dCost = Number(dc1) / qtyNum;
    return isNaN(dCost) ? 0 : dCost;
  } else {
    const dCost = Number(dc2) / qtyNum;
    return isNaN(dCost) ? 0 : dCost;
  }
}

function window_foil_Cost(window, foil, lookupArray) {
  const w_f_c = (Number(window) * 0.02) + (Number(foil) * 0.02);
  return isNaN(w_f_c) ? 0 : w_f_c;
}

function punch_paste(ups, punch, kraftGsm, bestBrd, bestLen, paste1, paste2) {
  const upsNum = Number(ups) || 1;
  if (upsNum === 0) return 0;
  const punchNum = Number(punch) || 0;
  const kraftGsmNum = Number(kraftGsm) || 0;
  const bestLenNum = Number(bestLen) || 0;
  const bestBrdNum = Number(bestBrd) || 0;
  const paste1Num = Number(paste1) || 0;
  const paste2Num = Number(paste2) || 0;
  const pp = (1 / upsNum) * (punchNum / 1000) + ((kraftGsmNum / 1000 * 2.33 * bestLenNum / 1000 * bestBrdNum) > 0 ? paste1Num : paste2Num);
  return isNaN(pp) ? 0 : pp;
}

function pack_del(paperweight, kraftWeight, deliverycost, packing, qty) {
  console.log('[pack_del] Input values:', { paperweight, kraftWeight, deliverycost, packing, qty });
  const qtyNum = Number(qty) || 1;
  if (qtyNum === 0) {
    console.log('[pack_del] qty is 0, returning 0');
    return 0;
  }
  const paperweightNum = Number(paperweight);
  const kraftWeightNum = Number(kraftWeight);
  const deliverycostNum = Number(deliverycost);
  const packingNum = Number(packing);
  console.log('[pack_del] Converted values:', { paperweightNum, kraftWeightNum, deliverycostNum, packingNum, qtyNum });
  const totalWeight = paperweightNum + kraftWeightNum;
  const totalCost = deliverycostNum + packingNum;
  const pd = (totalWeight * totalCost) / qtyNum;
  console.log('[pack_del] Calculation steps:', { totalWeight, totalCost, pd });
  const result = isNaN(pd) ? 0 : pd;
  console.log('[pack_del] Final result:', result);
  return result;
}

function Corr_conv(kraftWeight, kraftConv, qty) {
  const qtyNum = Number(qty) || 1;
  if (qtyNum === 0) return 0;
  const cc = (Number(kraftWeight) * Number(kraftConv)) / qtyNum;
  return isNaN(cc) ? 0 : cc;
}

/**
 * Custom XLOOKUP function.
 *
 * @param {any} searchValue The value to search for.
 * @param {Array} searchArray The array to search in.
 * @param {number} searchCol The column number to search in (1-based index).
 * @param {number} returnCol The column number to return the value from (1-based index).
 * @param {any} [ifNotFound] The value to return if no match is found.
 * @param {number} [matchType=0] The match type: 0 (exact match), 1 (greater than or equal), -1 (less than or equal).
 * @return {any} The found value or ifNotFound.
 */
function XLOOKUP(searchValue, searchArray, searchCol, returnCol, ifNotFound = null, matchType = 0) {
  // Ensure searchArray is valid
  if (!Array.isArray(searchArray) || searchArray.length === 0) {
    return ifNotFound;
  }

  // Ensure searchCol and returnCol are 1-based indices
  const searchColIndex = searchCol - 1;
  const returnColIndex = returnCol - 1;

  // Convert the search array to a 2D array if it isn't already
  let normalizedArray = searchArray;
  if (!Array.isArray(searchArray[0])) {
    normalizedArray = searchArray.map(value => [value]);
  }

  // Validate column indices
  if (normalizedArray.length === 0 || 
      searchColIndex < 0 || 
      returnColIndex < 0 || 
      !normalizedArray[0] ||
      searchColIndex >= normalizedArray[0].length || 
      returnColIndex >= normalizedArray[0].length) {
    return ifNotFound;
  }

  // Convert searchValue to number for numeric comparisons
  const searchValueNum = Number(searchValue);
  const isNumericSearch = !isNaN(searchValueNum);

  let bestMatchIndex = -1;
  let bestMatchValue;

  // Log for wastage lookup debugging
  const isWastageLookup = searchCol === 22 && returnCol === 23 && matchType === 1;
  if (isWastageLookup) {
    console.log('[XLOOKUP] Wastage lookup - searchValue:', searchValue, 'searchValueNum:', searchValueNum);
    console.log('[XLOOKUP] Looking in column', searchColIndex, 'returning from column', returnColIndex);
  }

  for (let i = 0; i < normalizedArray.length; i++) {
    let currentValue = normalizedArray[i][searchColIndex];
    const currentValueNum = Number(currentValue);
    const isNumericCurrent = !isNaN(currentValueNum);

    if (matchType === 0) {
      // Exact match
      if (isNumericSearch && isNumericCurrent) {
        if (currentValueNum === searchValueNum) {
          return normalizedArray[i][returnColIndex];
        }
      } else {
        if (currentValue === searchValue) {
          return normalizedArray[i][returnColIndex];
        }
      }
    } else if (matchType === 1) {
      // Greater than or equal (find smallest value >= searchValue)
      // For numeric comparisons, use numeric values
      if (isNumericSearch && isNumericCurrent) {
        if (currentValueNum >= searchValueNum && (bestMatchIndex === -1 || currentValueNum < bestMatchValue)) {
          bestMatchIndex = i;
          bestMatchValue = currentValueNum;
          if (isWastageLookup) {
            console.log(`[XLOOKUP] Found match at index ${i}: ${currentValueNum} >= ${searchValueNum}, wastage value: ${normalizedArray[i][returnColIndex]}`);
          }
        }
      } else {
        // Fallback to string comparison
        if (currentValue >= searchValue && (bestMatchIndex === -1 || currentValue < bestMatchValue)) {
          bestMatchIndex = i;
          bestMatchValue = currentValue;
        }
      }
    } else if (matchType === -1) {
      // Less than or equal (find largest value <= searchValue)
      if (isNumericSearch && isNumericCurrent) {
        if (currentValueNum <= searchValueNum && (bestMatchIndex === -1 || currentValueNum > bestMatchValue)) {
          bestMatchIndex = i;
          bestMatchValue = currentValueNum;
        }
      } else {
        if (currentValue <= searchValue && (bestMatchIndex === -1 || currentValue > bestMatchValue)) {
          bestMatchIndex = i;
          bestMatchValue = currentValue;
        }
      }
    }
  }

  if (bestMatchIndex !== -1) {
    const result = normalizedArray[bestMatchIndex][returnColIndex];
    if (isWastageLookup) {
      console.log('[XLOOKUP] Final wastage result:', result, 'from row', bestMatchIndex, 'bestMatchValue:', bestMatchValue);
    }
    return result;
  }

  if (isWastageLookup) {
    console.log('[XLOOKUP] No match found, returning ifNotFound:', ifNotFound);
  }
  return ifNotFound;
}

/**
 * Custom IFERROR function.
 *
 * @param {function} func The function to evaluate.
 * @param {any} errorValue The value to return if an error occurs.
 * @return {any} The result of the function or the error value if an error occurs.
 */
function IFERROR(func, errorValue) {
  try {
    const result = func();
    if (result === "" || result === null || result === undefined) {
      return errorValue;
    }
    return result;
  } catch (e) {
    return errorValue;
  }
}

export {
  calculatePricing,
  selectStdSheet,
  getSheetSzRTI,
  calMachineSz,
  getSheetSzTB,
  getSheetSzUn,
  getSheetSzCL_HL,
  getSheetSzCB,
  getTuckValue,
  XLOOKUP
};

