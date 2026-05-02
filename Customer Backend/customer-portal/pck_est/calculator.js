import { getMasterTable, writeToDatabase, getTuckValueTable } from './sheetsService.js';

const bufferL = 10;
const bufferW = 20;

/**
 * Helper function for logging with timestamps
 */
function logStep(step, startTime = null, parentStartTime = null) {
  return Date.now();
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
    logStep('>>> Deriving tuck/glue grid from master table');
    const tuckValueTable = await getTuckValueTable();
    stepTime = logStep('>>> Tuck grid ready', stepTime, requestStartTime);

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
    const frontSurBot = String(input.frontSur || '').toUpperCase();
    const backColBot = Number(input.backColBot || 0);
    const backSurBot = String(input.backSurBot || '').toUpperCase();
    const corrLayBot = Number(input.corrLayBot || 0);
    const kraftGsmBot = Number(input.kraftGsmBot || 0);
    const windowBot = Number(input.windowBot || 0);
    const foilBot = Number(input.fooinBot != null ? input.fooinBot : 0) || 0;
    const isTopBottom = productType === "Top Bottom";

    stepTime = Date.now();
    logStep('>>> Looking up paper prices', stepTime, requestStartTime);
    const pricePerKGIn = XLOOKUP(paperTypeTopOrInner, masterTable, 1, 2, 78, 0);
    const { customer: kraftRateCustomer, actual: kraftRateActual } = kraftRatesFromMaster(masterTable);
    console.log('kraftRateCustomer', kraftRateCustomer);
    console.log('kraftRateActual', kraftRateActual);
    const pricePerKGOut = XLOOKUP(paperTypeBotOrOuter, masterTable, 1, 2, 78, 0);
    const delRaw = input.delivery_charges;
    const delParsed =
      delRaw !== undefined && delRaw !== null && String(delRaw).trim() !== ''
        ? Number(delRaw)
        : 2;
    const delCost = !isNaN(delParsed) && delParsed >= 0 ? delParsed : 2;
    const overheadRaw = input.overhead;
    const overheadParsed =
      overheadRaw !== undefined && overheadRaw !== null && String(overheadRaw).trim() !== ''
        ? Number(overheadRaw)
        : 0.1;
    const overhead = !isNaN(overheadParsed) && overheadParsed >= 0 ? overheadParsed : 0.1;
    stepTime = logStep('>>> Paper price lookup completed', stepTime, requestStartTime);

    const inputData = [
      len, brd, height, qty, paperTypeTopOrInner, gsmTopOrInner, corrLayerInn, productType,
      orderSz, boxPerOuter, lenOuter, brdOuter, heightOuter, frontColIn, backColIn,
      frontSurIn, backSurIn, kraftGsmIn, windowIn, foilIn, paperTypeBotOrOuter, gsmBot,
      frontColBot, frontSurBot, backColBot, backSurBot, corrLayBot, kraftGsmBot, windowBot, foilBot,
      pricePerKGIn, kraftRateCustomer, kraftRateActual, pricePerKGOut, delCost, overhead
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
    const kraftPerunitIn = kraftPerunit(bestBrd, bestLen, maxUps, corrLayerInn, kraftGsmIn, kraftRateCustomer);
    const diceCostIn = diceCost(foilIn, masterTable[2][17], masterTable[1][17], qty);
    const window_foil_Cost_In = window_foil_Cost(windowIn, foilIn, masterTable);
    const punch_paste_In = punch_paste(
      maxUps,
      masterTable[5][1],
      kraftGsmIn,
      bestBrd,
      bestLen,
      masterTable[7][1],
      masterTable[6][1],
      masterTable,
      kraftRateCustomer
    );
    const pack_del_In = pack_del(paperweightIn, kraftWeightIn, delCost, masterTable[8][1], qty);
    const Corr_conv_In = Corr_conv(kraftWeightIn, masterTable[12][1], qty);

    stepTime = Date.now();
    logStep('>>> Calculating variable costs for inner', stepTime, requestStartTime);
    const varIn_paper = Number(paperPerUnit(paperweightIn, XLOOKUP(paperTypeTopOrInner, masterTable, 1, 4, 78, 0), qty) || 0);
    const varIn_ctp = Number(ctpPerUnit(frontColIn, backColIn, qty, masterTable[0][25]) || 0);
    const varIn_print = Number(printPerunitActual(frontSurIn, backSurIn, frontColIn, backColIn, maxUps, masterTable[3][3]) || 0);
    const varIn_surface = Number(surfacePerUnit(bestBrd, bestLen, maxUps, frontSurIn, backSurIn, masterTable, 4) || 0);
    const varIn_kraft = Number(kraftPerunit(bestBrd, bestLen, maxUps, corrLayerInn, kraftGsmIn, kraftRateActual) || 0);
    const varIn_dice = Number(diceCost(foilIn, masterTable[2][17], masterTable[1][17], qty) || 0);
    const varIn_windowFoil = Number(window_foil_Cost(windowIn, foilIn, masterTable) || 0);
    const varIn_punchPaste = Number(
      punch_paste(
        maxUps,
        masterTable[5][3],
        kraftGsmIn,
        bestBrd,
        bestLen,
        masterTable[7][3],
        masterTable[6][3],
        masterTable,
        kraftRateActual
      ) || 0
    );
    const varIn_packDel = Number(pack_del(paperweightIn, kraftWeightIn, masterTable[13][3], masterTable[8][3], qty) || 0);
    console.log('varIn_packDel', [paperweightIn, kraftWeightIn, masterTable[13][3], masterTable[8][3], qty]);
    const varIn_corrConv = Number(Corr_conv(kraftWeightIn, masterTable[12][3], qty) || 0);
    const varCostIn =
      varIn_paper +
      varIn_ctp +
      varIn_print +
      varIn_surface +
      varIn_kraft +
      varIn_dice +
      varIn_windowFoil +
      varIn_punchPaste +
      varIn_packDel +
      varIn_corrConv;
    stepTime = logStep('>>> Variable costs for inner calculated', stepTime, requestStartTime);

    console.log('[pck-est] varCostIn components', {
      'Paper / unit (var basis)': varIn_paper,
      'CTP / unit': varIn_ctp,
      'Print / unit (actual)': varIn_print,
      'Surface / unit (var basis)': varIn_surface,
      'Kraft / unit': varIn_kraft,
      'Dice / unit': varIn_dice,
      'Window & Foil / unit': varIn_windowFoil,
      'Punch & Paste / unit': varIn_punchPaste,
      'Pack & Del / unit': varIn_packDel,
      'Corr Conv / unit': varIn_corrConv,
      'Var Cost (sum)': varCostIn
    });

    console.log('[pck-est] inner cost line', {
      'Sheet length': bestLen,
      'Sheet breadth': bestBrd,
      Ups: maxUps,
      Wastage: wasteIn,
      'Paper Wt': paperweightIn,
      'Kraft Wt': kraftWeightIn,
      'Paper Price/KG': pricePerKGIn,
      'Paper / unit': paperPerUnitIn,
      'CTP / unit': ctpPerUnitIn,
      'Print / unit': printPerunitIn,
      'Surface / unit': surfacePerUnitIn,
      'Kraft/Unit': kraftPerunitIn,
      'Dice Cost': diceCostIn,
      'Window & Foil Cost/unit': window_foil_Cost_In,
      'Punch & Paste Cost/unit': punch_paste_In,
      'Pack & Del Cost/unit': pack_del_In,
      'Corr Conv': Corr_conv_In,
      'Var Cost': varCostIn
    });

    // console.log('masterTable', masterTable);

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
    const kraftWeightOut = kraftWt(
      bestBrdOuter,
      bestLenOuter,
      maxUpsOuter,
      isTopBottom ? corrLayBot : 0,
      isTopBottom ? kraftGsmBot : 0,
      qty / boxPerOuter
    );
    const paperPerUnitOut = paperPerUnit(paperweightOut, pricePerKGOut, qty / boxPerOuter);
    const ctpPerUnitOut = ctpPerUnit(
      frontColBot,
      isTopBottom ? backColBot : "",
      qty / boxPerOuter,
      masterTable[0][25]
    );
    const printPerunitOut = printPerunit(
      frontSurBot,
      isTopBottom ? backSurBot : "",
      frontColBot,
      isTopBottom ? backColBot : 0,
      qty / boxPerOuter,
      maxUpsOuter,
      masterTable[3][1],
      masterTable[0][44]
    );
    const surfacePerUnitOut = surfacePerUnit(
      bestBrdOuter,
      bestLenOuter,
      maxUpsOuter,
      frontSurBot,
      isTopBottom ? backSurBot : "",
      masterTable,
      2
    );
    const outerCorrForKraft = isTopBottom ? corrLayBot : 0;
    const outerKraftGsmForKraft = isTopBottom ? kraftGsmBot : 0;
    const kraftPerunitOut = kraftPerunit(
      bestBrdOuter,
      bestLenOuter,
      maxUpsOuter,
      outerCorrForKraft,
      outerKraftGsmForKraft,
      kraftRateCustomer
    );
    const diceCostOut = isTopBottom
      ? diceCost(foilBot, masterTable[2][17], masterTable[1][17], qty)
      : diceCostIn;
    const window_foil_Cost_Out = isTopBottom ? window_foil_Cost(windowBot, foilBot, masterTable) : 0;
    const punch_paste_Out = punch_paste(
      maxUpsOuter,
      masterTable[5][1],
      isTopBottom ? kraftGsmBot : 0,
      bestBrdOuter,
      bestLenOuter,
      masterTable[7][1],
      masterTable[6][1],
      masterTable,
      kraftRateCustomer
    );
    const pack_del_Out = pack_del(paperweightOut, kraftWeightOut, delCost, masterTable[8][1], qty / boxPerOuter);
    const Corr_conv_Out = Corr_conv(kraftWeightOut, masterTable[12][1], qty / boxPerOuter);

    stepTime = Date.now();
    logStep('>>> Calculating variable costs for outer', stepTime, requestStartTime);
    const varOut_paper = Number(paperPerUnit(paperweightOut, XLOOKUP(paperTypeBotOrOuter, masterTable, 1, 4, 78, 0), qty) || 0);
    const varOut_ctp = Number(
      ctpPerUnit(frontColBot, isTopBottom ? backColBot : "", qty, masterTable[0][25]) || 0
    );
    const varOut_print = Number(
      printPerunitActual(
        frontSurBot,
        isTopBottom ? backSurBot : "",
        frontColBot,
        isTopBottom ? backColBot : 0,
        maxUpsOuter,
        masterTable[3][3]
      ) || 0
    );
    const varOut_surface = Number(
      surfacePerUnit(
        bestBrdOuter,
        bestLenOuter,
        maxUpsOuter,
        frontSurBot,
        isTopBottom ? backSurBot : "",
        masterTable,
        4
      ) || 0
    );
    const varOut_kraft = Number(
      kraftPerunit(
        bestBrdOuter,
        bestLenOuter,
        maxUpsOuter,
        outerCorrForKraft,
        outerKraftGsmForKraft,
        kraftRateActual
      ) || 0
    );
    const varOut_dice = Number(
      (isTopBottom
        ? diceCost(foilBot, masterTable[2][17], masterTable[1][17], qty)
        : diceCost(0, masterTable[2][17], masterTable[1][17], qty)) || 0
    );
    const varOut_windowFoil = Number(
      (isTopBottom ? window_foil_Cost(windowBot, foilBot, masterTable) : window_foil_Cost(0, 0, masterTable)) || 0
    );
    const varOut_punchPaste = Number(
      punch_paste(
        maxUpsOuter,
        masterTable[5][3],
        isTopBottom ? kraftGsmBot : kraftGsmIn,
        bestBrdOuter,
        bestLenOuter,
        masterTable[7][3],
        masterTable[6][3],
        masterTable,
        kraftRateActual
      ) || 0
    );
    const varOut_packDel = Number(pack_del(paperweightOut, kraftWeightOut, masterTable[13][3], masterTable[8][3], qty) || 0);
    const varOut_corrConv = Number(Corr_conv(kraftWeightOut, masterTable[12][3], qty) || 0);
    const varCostOut =
      varOut_paper +
      varOut_ctp +
      varOut_print +
      varOut_surface +
      varOut_kraft +
      varOut_dice +
      varOut_windowFoil +
      varOut_punchPaste +
      varOut_packDel +
      varOut_corrConv;
    stepTime = logStep('>>> Variable costs for outer calculated', stepTime, requestStartTime);

    console.log('[pck-est] varCostOut components', {
      'Paper / unit (var basis)': varOut_paper,
      'CTP / unit': varOut_ctp,
      'Print / unit (actual)': varOut_print,
      'Surface / unit (var basis)': varOut_surface,
      'Kraft / unit': varOut_kraft,
      'Dice / unit': varOut_dice,
      'Window & Foil / unit': varOut_windowFoil,
      'Punch & Paste / unit': varOut_punchPaste,
      'Pack & Del / unit': varOut_packDel,
      'Corr Conv / unit': varOut_corrConv,
      'Var Cost (sum)': varCostOut
    });

    console.log('[pck-est] outer cost line (bottom)', {
      'Sheet length': bestLenOuter,
      'Sheet breadth': bestBrdOuter,
      Ups: maxUpsOuter,
      Wastage: wasteOut,
      'Paper Wt': paperweightOut,
      'Kraft Wt': kraftWeightOut,
      'Paper Price/KG': pricePerKGOut,
      'Paper / unit': paperPerUnitOut,
      'CTP / unit': ctpPerUnitOut,
      'Print / unit': printPerunitOut,
      'Surface / unit': surfacePerUnitOut,
      'Kraft/Unit': kraftPerunitOut,
      'Dice Cost': diceCostOut,
      'Window & Foil Cost/unit': window_foil_Cost_Out,
      'Punch & Paste Cost/unit': punch_paste_Out,
      'Pack & Del Cost/unit': pack_del_Out,
      'Corr Conv': Corr_conv_Out,
      'Var Cost': varCostOut
    });

    stepTime = Date.now();
    logStep('>>> Calculating final pricing for outer', stepTime, requestStartTime);
    const price_per_unit_Out = (Number(paperPerUnitOut || 0) + Number(ctpPerUnitOut || 0) + Number(printPerunitOut || 0) + Number(surfacePerUnitOut || 0) +
      Number(kraftPerunitOut || 0) + Number(diceCostOut || 0) + Number(window_foil_Cost_Out || 0) + Number(punch_paste_Out || 0) + Number(pack_del_Out || 0) + Number(Corr_conv_Out || 0)) * (1 + overhead);
    const varCostOutNum = Number(varCostOut) || 0;
    const gpPerOut = varCostOutNum > 0 ? (price_per_unit_Out / varCostOutNum) - 1 : 0;
    const gpPerImpOut = (price_per_unit_Out - varCostOutNum) * maxUpsOuter;
    stepTime = logStep('>>> Final pricing for outer completed', stepTime, requestStartTime);
    stepTime = logStep('>>> Outer costs calculation completed', stepTime, requestStartTime);

    const varCostCombinedNum =
      productType === "Top Bottom" ? varCostInNum + varCostOutNum : varCostInNum;
    const priceCombinedNum =
      productType === "Top Bottom"
        ? Number(price_per_unit_In || 0) + Number(price_per_unit_Out || 0)
        : Number(price_per_unit_In || 0);
    const gpPercentIn = varCostInNum > 0 ? ((Number(price_per_unit_In) / varCostInNum) - 1) * 100 : null;
    const gpPercentOut = varCostOutNum > 0 ? ((Number(price_per_unit_Out) / varCostOutNum) - 1) * 100 : null;
    const gpPercentCombined =
      varCostCombinedNum > 0 ? (priceCombinedNum / varCostCombinedNum - 1) * 100 : null;
    const gpPerImpCombined =
      productType === "Top Bottom" ? Number(gpPerImpIn || 0) + Number(gpPerImpOut || 0) : gpPerImpIn;

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
        gpPerImpOut: gpPerImpOut,
        price_per_unit_combined:
          productType === "Top Bottom"
            ? Number(price_per_unit_In || 0) + Number(price_per_unit_Out || 0)
            : price_per_unit_In,
        var_cost_combined:
          productType === "Top Bottom"
            ? Number(varCostIn || 0) + Number(varCostOut || 0)
            : varCostIn,
        gp_percent_in: gpPercentIn,
        gp_percent_out: productType === "Top Bottom" ? gpPercentOut : null,
        gp_percent_combined: gpPercentCombined,
        gp_per_imp_combined: gpPerImpCombined
      },
      metadata: {
        foilIn: foilIn,
        windowIn: windowIn,
        kraft_rate_customer: kraftRateCustomer,
        kraft_rate_actual: kraftRateActual
      },
      quote_context: {
        client_name: String(input.client_name || '').trim(),
        sku_name: String(input.sku_name || '').trim(),
        delivery_charges: delCost,
        overhead: overhead,
        ptype: productType
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
  const upsNum = Number(ups) || 1;
  if (upsNum === 0) return 1;
  const searchValue = qty / upsNum;
  const waste = XLOOKUP(searchValue, lookupArray, 22, 23, 1, 1);
  const wasteNum = Number(waste);
  const result = isNaN(wasteNum) ? 1 : wasteNum;
  return result;
}

function paperWt(qty, ups, bestLen, bestBrd, gsm, waste) {
  const upsNum = Number(ups) || 1;
  const wasteNum = Number(waste) || 1;
  const qtyNum = Number(qty);
  const bestLenNum = Number(bestLen);
  const bestBrdNum = Number(bestBrd);
  const gsmNum = Number(gsm);
  const sheets = Math.ceil(qtyNum / upsNum);
  const areaPerSheet = (bestBrdNum * bestLenNum * gsmNum) / (1000 * 1000 * 1000);
  const paperweight = sheets * areaPerSheet * wasteNum;
  const result = isNaN(paperweight) ? 0 : paperweight;
  return result;
}

function kraftWt(bestBrd, bestLen, ups, corrLayer, kraftGsm, qty) {
  const upsNum = Number(ups) || 1;
  if (upsNum === 0) return 0;
  const kraftWeight = Number(bestBrd) / 1000 * Number(bestLen) / 1000 / upsNum * ((Number(corrLayer) / 2 * 1.33 + Number(corrLayer) / 2) * Number(kraftGsm) / 1000) * Number(qty);
  return isNaN(kraftWeight) ? 0 : kraftWeight;
}

function paperPerUnit(paperweight, paperPrice, qty) {
  const qtyNum = Number(qty) || 1;
  if (qtyNum === 0) {
    return 0;
  }
  const paperweightNum = Number(paperweight);
  const paperPriceNum = Number(paperPrice);
  const ppu = (paperweightNum * paperPriceNum) / qtyNum;
  const result = isNaN(ppu) ? 0 : ppu;
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
  // Excel parity:
  // =IF(B15="","", XLOOKUP(H8,Master!$AE$2:$AE$7,Master!$AF$2:$AF$7,"")+XLOOKUP(J8,Master!$AB$2:$AB$7,Master!$AC$2:$AC$7,""))
  if (window === "" || window === null || window === undefined) {
    return 0;
  }

  const windowLookup = XLOOKUP(window, lookupArray, 31, 32, "", 0);
  const foilLookup = XLOOKUP(foil, lookupArray, 28, 29, "", 0);
  const windowCost = Number(windowLookup) || 0;
  const foilCost = Number(foilLookup) || 0;
  const total = windowCost + foilCost;
  return isNaN(total) ? 0 : total;
}


/**
 * Master row index 11, e.g. ['Kratf','32','/Kg','30']:
 * - index 1 = rate to customer (quoted / price build)
 * - index 3 = actual rate (variable cost)
 * If one side is missing, the other is used so a single filled cell still works.
 */
function kraftRatesFromMaster(masterTable) {
  const row = Array.isArray(masterTable) && Array.isArray(masterTable[11]) ? masterTable[11] : [];
  const parse = (v) => {
    if (v === undefined || v === null || String(v).trim() === "") return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };
  let customer = parse(row[1]);
  let actual = parse(row[3]);
  if (customer <= 0 && actual > 0) customer = actual;
  if (actual <= 0 && customer > 0) actual = customer;
  return { customer, actual };
}

function kraftWastageFromMaster(masterTable) {
  const row = Array.isArray(masterTable) && Array.isArray(masterTable[2]) ? masterTable[2] : [];
  const d = row[3];
  if (d !== undefined && d !== null && String(d).trim() !== "") return Number(d) || 0;
  return Number(row[1]) || 0;
}

function punch_paste(ups, punch, kraftGsm, bestBrd, bestLen, paste1, paste2, masterTable, kraftRateForPaste) {
  const upsNum = Number(ups) || 1;
  if (upsNum === 0) return 0;
  const punchNum = Number(punch) || 0;
  const kraftGsmNum = Number(kraftGsm) || 0;
  const bestLenNum = Number(bestLen) || 0;
  const bestBrdNum = Number(bestBrd) || 0;
  const paste1Num = Number(paste1) || 0;
  const paste2Num = Number(paste2) || 0;
  const kraftRate =
    kraftRateForPaste !== undefined && kraftRateForPaste !== null && !isNaN(Number(kraftRateForPaste))
      ? Number(kraftRateForPaste)
      : kraftRatesFromMaster(masterTable).customer;
  const kraftWastage = kraftWastageFromMaster(masterTable);
  const kraftPasteTerm =
    (kraftGsmNum / 1000) *
    2.33 *
    (bestLenNum / 1000) *
    (bestBrdNum / 1000) *
    kraftRate *
    kraftWastage /
    upsNum;
  const usePaste1 = kraftPasteTerm > 0;
  const pp = (1 / upsNum) * (punchNum / 1000) + (usePaste1 ? paste1Num : paste2Num);
  return isNaN(pp) ? 0 : pp;
}

function pack_del(paperweight, kraftWeight, deliverycost, packing, qty) {
  const qtyNum = Number(qty) || 1;
  if (qtyNum === 0) {
    return 0;
  }
  const paperweightNum = Number(paperweight);
  const kraftWeightNum = Number(kraftWeight);
  const deliverycostNum = Number(deliverycost);
  const packingNum = Number(packing);
  const totalWeight = paperweightNum + kraftWeightNum;
  const totalCost = deliverycostNum + packingNum;
  const pd = (totalWeight * totalCost) / qtyNum;
  const result = isNaN(pd) ? 0 : pd;
  console.log('pack_del########################################################');
  console.log('paperweight', paperweight);
  console.log('kraftWeight', kraftWeight);
  console.log('deliverycost', deliverycost);
  console.log('packing', packing);
  console.log('qty', qty);
  console.log('totalWeight', totalWeight);
  console.log('totalCost', totalCost);
  console.log('pd', pd);
  console.log('result', result);
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
    return normalizedArray[bestMatchIndex][returnColIndex];
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

