import { getCalculateSheetData, getOptionsSheetData } from './sheetsService.js';

const lenbuffer = 8;
const widbuffer = 4;

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

/** Min qty threshold → target gross-profit margin on quoted total (decimal, e.g. 0.5 = 50%). */
const COMMERCIAL_QTY_GP_TIERS = [
  [1000, 0.55],
  [3000, 0.5],
  [5000, 0.4],
  [10000, 0.35],
  [100000000, 0.3]
];

const COMMERCIAL_OVERHEAD_FALLBACK = 0.15;
const COMMERCIAL_OVERHEAD_AUTO_CAP = 10;

/**
 * First tier whose threshold qty >= order qty gets that row's target GP (e.g. qty 2500 → 3000 tier → 50%).
 */
function commercialTargetGpDecimalFromQty(qty) {
  const q = Number(qty);
  if (!isFinite(q) || q <= 0) return COMMERCIAL_QTY_GP_TIERS[0][1];
  for (let i = 0; i < COMMERCIAL_QTY_GP_TIERS.length; i++) {
    const [threshold, gp] = COMMERCIAL_QTY_GP_TIERS[i];
    if (threshold >= q) return gp;
  }
  return COMMERCIAL_QTY_GP_TIERS[COMMERCIAL_QTY_GP_TIERS.length - 1][1];
}

/** Optional body.overhead_percent: fraction (0.15) or percent-style number (>1 divided by 100). */
function parseCommercialOverheadPercentInput(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (isNaN(n) || n < 0) return null;
  if (n > 1) return n / 100;
  return n;
}

/**
 * GP% = (1 - (varCostActual + packing) / total) × 100 with total = baseCust×(1+r)+packing+shipping+addl.
 * Solve for r given target GP when mode is auto; manual uses fixed r from overhead_percent.
 */
function resolveCommercialOverheadPercent(ctx) {
  const {
    quoteinfo,
    qty,
    baseCust,
    componentsActualSubtotal,
    bindcost,
    packing,
    shipping_fob,
    addlOrderCosts
  } = ctx;

  const manual = parseCommercialOverheadPercentInput(quoteinfo.overhead_percent);
  const bindingActual = bindcost[1];
  const varCostActual = componentsActualSubtotal + bindingActual;

  if (manual != null) {
    return {
      rate: manual,
      mode: 'manual',
      targetGpDecimal: null
    };
  }

  const targetGpDecimal = commercialTargetGpDecimalFromQty(qty);
  const T = targetGpDecimal;
  const denom = 1 - T;

  if (!(T > 0 && T < 1 && denom > 0)) {
    return {
      rate: COMMERCIAL_OVERHEAD_FALLBACK,
      mode: 'auto',
      targetGpDecimal,
      auto_note: 'fallback_invalid_target_gp'
    };
  }

  const A = varCostActual + packing;
  const requiredTotal = A / denom;
  const marginPart = requiredTotal - packing - shipping_fob - addlOrderCosts;

  if (baseCust <= 0 || !isFinite(marginPart)) {
    return {
      rate: COMMERCIAL_OVERHEAD_FALLBACK,
      mode: 'auto',
      targetGpDecimal,
      auto_note: baseCust <= 0 ? 'fallback_zero_base' : 'fallback_margin'
    };
  }

  let r = marginPart / baseCust - 1;
  if (r < 0) r = 0;
  if (r > COMMERCIAL_OVERHEAD_AUTO_CAP) r = COMMERCIAL_OVERHEAD_AUTO_CAP;

  return {
    rate: r,
    mode: 'auto',
    targetGpDecimal
  };
}

/**
 * Main calculation function
 */
async function calCulate(quoteinfo, requestStartTime = null) {
  const calcStartTime = Date.now();
  logStep('>>> calCulate: Starting calculation');
  
  try {
    let stepTime = Date.now();
    logStep('>>> Fetching sheet data from Google Sheets');
    
    // Get sheet data
    const calculateData = await getCalculateSheetData();
    const optionsData = await getOptionsSheetData();
    
    stepTime = logStep('>>> Sheet data fetched', stepTime, requestStartTime);
    
    const mainTable = [calculateData.mainTable];
    const inputTable = calculateData.inputTable;
    const displayTable = calculateData.displayTable;
    const costarr = optionsData.costarr;
    const overHeadPerOps = optionsData.overHeadPerOps;
    const opsTable = optionsData.opsTable;
    const opsTable1 = optionsData.opsTable1;
    const opsTable2 = optionsData.opsTable2;
    
    stepTime = Date.now();
    logStep('>>> Processing quote information', stepTime, requestStartTime);
    
    const lastRow = 10;
    const lastCol = 17;
    const inputStartRow = 5;
    
    // Convert string inputs to arrays
    const compCol = convertStringToArray(quoteinfo.components ?? '');
    const gsmCol = convertStringToArray(quoteinfo.gsm);
    const textPagesCol = convertStringToArray(quoteinfo.page_number);
    const paperTypeCol = convertStringToArray(quoteinfo.material);
    const front_print_col = convertStringToArray(quoteinfo.front_print);
    const back_print_col = convertStringToArray(quoteinfo.back_print);
    const front_surface_col = convertStringToArray(quoteinfo.front_surface ?? '');
    const back_surface_col = convertStringToArray(quoteinfo.back_surface ?? '');
    const web_or_sheet_col = dollarFieldToCols(quoteinfo, 'web_or_sheet');
    const force_paper_col = dollarFieldToCols(quoteinfo, 'force_paper');
    const manual_price_per_kg_col = dollarFieldToCols(quoteinfo, 'manual_price_per_kg');
    const right_add_col = dollarFieldToCols(quoteinfo, 'right_add');
    const left_add_col = dollarFieldToCols(quoteinfo, 'left_add');
    const complexity_col = dollarFieldToCols(quoteinfo, 'complexity');
    
    let spineStr = '';
    const maxUpsArray = [];
    
    // Declare variables outside the loop so they're accessible after the loop
    const bindingStyle = quoteinfo.binding_style;
    const rawTitles = quoteinfo.no_of_titles;
    const parsedTitles =
      rawTitles !== undefined && rawTitles !== null && String(rawTitles).trim() !== ''
        ? Number(rawTitles)
        : 1;
    const noOfTitles = !isNaN(parsedTitles) && parsedTitles > 0 ? parsedTitles : 1;
    const Qty = Number(quoteinfo.Qty) * noOfTitles;
    
    if (!dollarCell(compCol, 0)) {
      throw new Error("Please insert mandatory information!");
    } else {
      for (let i = 0; i < (lastRow - inputStartRow + 1); i++) {
        const comp = dollarCell(compCol, i);
        if (!comp) {
          continue;
        }

        const Bklen = getStdLenBrd(Number(quoteinfo.len), bindingStyle);
          const BkBrd = getStdLenBrd(Number(quoteinfo.brd), bindingStyle);
          
          const noOfPages = Number(textPagesCol[i] ? textPagesCol[i][0] : 0);
          const gsm = Number(gsmCol[i] ? gsmCol[i][0] : 0);
          const paperType = paperTypeCol[i] ? paperTypeCol[i][0] : "";
          const front_print = Number(front_print_col[i] ? front_print_col[i][0] : 0);
          const back_print = back_print_col[i] === "" || !back_print_col[i] ? 0 : Number(back_print_col[i][0]);
          const front_surface = dollarCell(front_surface_col, i);
          const back_surface = dollarCell(back_surface_col, i);

          const wsRaw = dollarCell(web_or_sheet_col, i).toLowerCase();
          let webOrSheet;
          if (wsRaw === 'web') {
            webOrSheet = 'Web';
          } else if (wsRaw === 'sheet') {
            webOrSheet = 'Sheet';
          } else {
            webOrSheet = paperType === 'Bible Paper' ? 'Web' : paperType !== '' ? 'Sheet' : 'Sheet';
          }

          const fpRaw = dollarCell(force_paper_col, i);
          const fpLower = fpRaw.toLowerCase();
          let forcePaper;
          if (fpRaw === 'Special' || fpLower === 'sp' || fpLower === 'special') {
            forcePaper = 'Special';
          } else if (fpLower === 'standard') {
            forcePaper = 'Standard';
          } else {
            forcePaper = 'Default';
          }

          let complexity = dollarCell(complexity_col, i);
          if (complexity === '') {
            complexity = 'Simple';
          }

          const leftAdd = Number(dollarCell(left_add_col, i)) || 0;
          const rightAdd = Number(dollarCell(right_add_col, i)) || 0;
          const leftAddPlusRightADD = leftAdd + rightAdd;

          const indexNo = inputTable[i] ? inputTable[i][0] : i + 1;

          let SheetLen, SheetWid, maxUps = 0, sheetWaistepercent, paperSzType;
          
          //--------------------Text Type Component---------------------------------//
          if ((comp === "Text" || comp === "End Paper" || comp === "Text - 2" || comp === "Sticker Paper") && comp !== "") {
            const orderSize = (Bklen / 1000) * (BkBrd / 1000) * (gsm / 1000) * Qty * (noOfPages / 2);
            
            if (((((paperType === "FBB" || paperType === "CBB") && orderSize >= 1500) || 
                  (paperType.indexOf("Maplitho") !== -1 && orderSize >= 3000) || 
                  ((paperType === "Gloss Art" || paperType === "Matt Art") && gsm >= 110 && orderSize >= 6000) || 
                  ((paperType === "Gloss Art" || paperType === "Matt Art") && gsm < 110 && orderSize >= 10000)) && 
                  forcePaper === "Default") || 
                forcePaper === "Special" || 
                webOrSheet === "Web" || 
                (comp === "Sticker Paper" && orderSize >= 1000)) {
              
              let machineWidth, machineLen;
              
              if (webOrSheet === "Sheet") {
                if (Qty * noOfPages > 4500000) {
                  machineWidth = comp === "Sticker Paper" ? 510 : 720;
                  machineLen = comp === "Sticker Paper" ? 760 : 1020;
                } else {
                  machineWidth = comp === "Sticker Paper" ? 510 : 640;
                  machineLen = comp === "Sticker Paper" ? 760 : 920;
                }
              } else {
                machineWidth = comp === "Sticker Paper" ? 510 : 578;
                machineLen = comp === "Sticker Paper" ? 760 : 890;
              }
              
              const xv = Math.floor((machineWidth - 10) / (Bklen + lenbuffer));
              const yv = Math.floor((machineLen - 10) / (2 * (BkBrd + widbuffer)));
              const vUps = xv * yv * 2;
              const xh = Math.floor((machineWidth - 10) / (2 * (BkBrd + widbuffer)));
              const yh = Math.floor((machineLen - 10) / (Bklen + lenbuffer));
              const hUps = xh * yh * 2;
              maxUps = Math.max(stdUps1(vUps, complexity), stdUps1(hUps, complexity));
              
              let SheetLenInit = (Math.min((Bklen + lenbuffer), (BkBrd + widbuffer))) * (Math.max(calculateXY(maxUps)[0], calculateXY(maxUps)[1]));
              let SheetWidInit = (Math.max((Bklen + lenbuffer), (BkBrd + widbuffer))) * (Math.min(calculateXY(maxUps)[0], calculateXY(maxUps)[1]));
              
              SheetLenInit = SheetLenInit + ((SheetLenInit < SheetWidInit) ? 20 : 10);
              SheetWidInit = SheetWidInit + ((SheetLenInit < SheetWidInit) ? 10 : 20);
              
              SheetLen = webOrSheet === "Web" ? multiplierFive(Math.max(SheetLenInit, SheetWidInit) - 11) : multiplierFive(Math.max(SheetLenInit, SheetWidInit));
              SheetWid = webOrSheet === "Web" ? multiplierFive(webSizeConv((Math.min(SheetWidInit, SheetLenInit) - 9))) : multiplierFive(Math.min(SheetWidInit, SheetLenInit));
              
              sheetWaistepercent = 1 - (Bklen * BkBrd * maxUps) / (SheetLen * SheetWid);
              paperSzType = "Special";
              
            } else {
              sheetWaistepercent = 1;
              for (let j = 0; j < opsTable.length; j++) {
                if (opsTable[j] && opsTable[j][0] !== "" && 
                    calculateWaiste((comp === "Sticker Paper" ? 760 : opsTable[j][1]), 
                                    (comp === "Sticker Paper" ? 510 : opsTable[j][0]), 
                                    Bklen, BkBrd, complexity)[0] < sheetWaistepercent) {
                  SheetLen = opsTable[j][1];
                  SheetWid = opsTable[j][0];
                  maxUps = calculateWaiste((comp === "Sticker Paper" ? 760 : opsTable[j][1]), 
                                          (comp === "Sticker Paper" ? 510 : opsTable[j][0]), 
                                          Bklen, BkBrd, complexity)[1];
                  paperSzType = "Standard";
                  sheetWaistepercent = calculateWaiste((comp === "Sticker Paper" ? 760 : opsTable[j][1]), 
                                                       (comp === "Sticker Paper" ? 510 : opsTable[j][0]), 
                                                       Bklen, BkBrd, complexity)[0];
                }
              }
              // Fallback: if maxUps still not set, use first valid opsTable entry
              if (maxUps === 0 && opsTable.length > 0 && opsTable[0] && opsTable[0][0] !== "") {
                SheetLen = opsTable[0][1];
                SheetWid = opsTable[0][0];
                maxUps = calculateWaiste((comp === "Sticker Paper" ? 760 : opsTable[0][1]), 
                                        (comp === "Sticker Paper" ? 510 : opsTable[0][0]), 
                                        Bklen, BkBrd, complexity)[1];
                paperSzType = "Standard";
                sheetWaistepercent = calculateWaiste((comp === "Sticker Paper" ? 760 : opsTable[0][1]), 
                                                     (comp === "Sticker Paper" ? 510 : opsTable[0][0]), 
                                                     Bklen, BkBrd, complexity)[0];
              }
            }
            
          } else if (comp === "Cover") {
            const spine1 = calSpine(bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm);
            const orderSize = (Bklen / 1000) * ((BkBrd + spine1 / 2) / 1000) * (gsm / 1000) * Qty * 2;
            const calArray = cal_PLC_Cover(paperType, orderSize, forcePaper, Qty, bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm, Bklen, BkBrd, webOrSheet, opsTable, complexity);
            SheetLen = calArray[1];
            SheetWid = calArray[2];
            maxUps = calArray[0];
            sheetWaistepercent = calArray[3];
            paperSzType = calArray[4];
            spineStr = spineStr + "Cover: " + parseFloat(spine1).toFixed(2) + "##";
            
          } else if (comp === "PLC") {
            const spine2 = calSpine(bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm);
            const orderSize = (Bklen / 1000) * ((BkBrd + spine2 / 2) / 1000) * (gsm / 1000) * Qty * 2;
            
            const calArray = cal_PLC_Cover(paperType, orderSize, forcePaper, Qty, bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm, Bklen + 50, BkBrd + 25, webOrSheet, opsTable, complexity);
            SheetLen = calArray[1];
            SheetWid = calArray[2];
            maxUps = calArray[0];
            sheetWaistepercent = calArray[3];
            paperSzType = calArray[4];
            spineStr = spineStr + "PLC: " + parseFloat(spine2).toFixed(2) + "##";
            
          } else if (comp === "Gate Fold Cover") {
            const spine3 = calSpine(bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm);
            const orderSize = (Bklen / 1000) * ((BkBrd + spine3 / 2) / 1000) * (gsm / 1000) * Qty * 2;
            
            const calArray = cal_PLC_Cover(paperType, orderSize, forcePaper, Qty, bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm, Bklen, BkBrd + (leftAddPlusRightADD / 2), webOrSheet, opsTable, complexity);
            SheetLen = calArray[1];
            SheetWid = calArray[2];
            maxUps = calArray[0];
            sheetWaistepercent = calArray[3];
            paperSzType = calArray[4];
            spineStr = spineStr + "Gate Fold Cover: " + parseFloat(spine3).toFixed(2) + "##";
            
          } else if (comp === "Binding Board") {
            const spine4 = calSpine(bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm);
            const orderSize = (Bklen / 1000) * ((BkBrd + spine4 / 2) / 1000) * (gsm / 1000) * Qty * 2;
            spineStr = spineStr + "Binding Board: " + parseFloat(spine4).toFixed(2) + "##";
            
            if (forcePaper === "Special" || (orderSize >= 1000 && forcePaper === "Default")) {
              let machineWidth, machineLen;
              
              if (Qty > 1) {
                machineWidth = 720;
                machineLen = 1020;
              } else {
                machineWidth = 640;
                machineLen = 920;
              }
              
              const xv = Math.floor(machineWidth / (Bklen + lenbuffer));
              const yv = Math.floor(machineLen / (2 * (BkBrd + spine4 / 2 + widbuffer)));
              const vUps = xv * yv * 2;
              const xh = Math.floor(machineWidth / (2 * (BkBrd + spine4 / 2 + widbuffer)));
              const yh = Math.floor(machineLen / (Bklen + lenbuffer));
              const hUps = xh * yh * 2;
              maxUps = Math.max(vUps, hUps);
              
              const xyArray = [];
              
              if (vUps >= hUps) {
                xyArray[0] = xv;
                xyArray[1] = yv * 2;
              } else {
                xyArray[0] = yh;
                xyArray[1] = xh * 2;
              }
              
              let SheetLenInit = (Math.min((Bklen + lenbuffer), ((BkBrd + spine4 / 2 + widbuffer)))) * (Math.max(xyArray[0], xyArray[1])) + 10;
              let SheetWidInit = (Math.max((Bklen + lenbuffer), ((BkBrd + spine4 / 2 + lenbuffer)))) * (Math.min(xyArray[0], xyArray[1])) + 20;
              SheetLen = webOrSheet === "Web" ? multiplierFive(Math.max(SheetLenInit, SheetWidInit) - 11) : multiplierFive(Math.max(SheetLenInit, SheetWidInit));
              SheetWid = webOrSheet === "Web" ? multiplierFive(webSizeConv((Math.min(SheetWidInit, SheetLenInit)))) : multiplierFive(Math.min(SheetWidInit, SheetLenInit));
              
              sheetWaistepercent = 1 - (Bklen * (BkBrd + spine4 / 2) * maxUps) / (SheetLen * SheetWid);
              paperSzType = "Special";
              
            } else {
              const SheetLenArray = [1050, 910];
              const SheetWidArray = [800, 635];
              
              sheetWaistepercent = 1;
              for (let j = 0; j < SheetLenArray.length; j++) {
                if (calculateWaisteFoamOrBoard(SheetLenArray[j], SheetWidArray[j], Bklen, BkBrd, complexity)[0] < sheetWaistepercent) {
                  SheetLen = SheetLenArray[j];
                  SheetWid = SheetWidArray[j];
                  maxUps = calculateWaisteFoamOrBoard(SheetLenArray[j], SheetWidArray[j], Bklen, BkBrd, complexity)[1];
                  paperSzType = "Standard";
                  sheetWaistepercent = calculateWaisteFoamOrBoard(SheetLenArray[j], SheetWidArray[j], Bklen, BkBrd, complexity)[0];
                }
              }
              // Fallback: if maxUps still not set, use first array entry
              if (maxUps === 0 && SheetLenArray.length > 0) {
                SheetLen = SheetLenArray[0];
                SheetWid = SheetWidArray[0];
                maxUps = calculateWaisteFoamOrBoard(SheetLenArray[0], SheetWidArray[0], Bklen, BkBrd, complexity)[1];
                paperSzType = "Standard";
                sheetWaistepercent = calculateWaisteFoamOrBoard(SheetLenArray[0], SheetWidArray[0], Bklen, BkBrd, complexity)[0];
              }
            }
            
          } else if (comp === "Foam") {
            const spine = 0;
            SheetLen = 1800;
            SheetWid = 900;
            maxUps = calculateWaisteFoamOrBoard(SheetLen, SheetWid, Bklen, (BkBrd))[1];
            paperSzType = "Standard";
            sheetWaistepercent = calculateWaisteFoamOrBoard(SheetLen, SheetWid, Bklen, (BkBrd))[0];
          }
          
          // Safety check: ensure maxUps is set before using it
          if (maxUps === 0 && (SheetLen === undefined || SheetWid === undefined)) {
            throw new Error(`maxUps is not defined for component: ${comp}. Please check the component type and input data.`);
          }
          
          // Calculate paper weight with proper validation
          const paperWt = comp !== "Foam" ? 
            (Number(SheetLen) / 1000 * Number(SheetWid) / 1000 * Number(gsm) / 1000 * Number(noOfPages) / Number(maxUps) * Number(Qty) / Number(noOfTitles)) * (1 + 0.07) / 2 : 
            (Number(noOfPages) / Number(maxUps) * Number(Qty) / Number(noOfTitles) * (1.15) / 2);
          const paperPriceRaw = XLOOKUP(paperType, opsTable1, 2, 3, "");
          // Convert empty string to 0 for numeric calculations

          let paperPrice = paperPriceRaw === "" || paperPriceRaw === null || paperPriceRaw === undefined ? 0 : Number(paperPriceRaw) || 0;
          const manualPriceSeg = dollarCell(manual_price_per_kg_col, i);
          if (manualPriceSeg !== '') {
            const mp = Number(manualPriceSeg);
            if (!isNaN(mp) && mp > 0) {
              paperPrice = mp;
            }
          }
          
          // Get opsTable1 values with defaults
          const opsTable1_4_13 = Number(opsTable1[4]?.[13]) || 0;
          const opsTable1_5_13 = Number(opsTable1[5]?.[13]) || 0;
          const opsTable1_1_13 = Number(opsTable1[1]?.[13]) || 0;
          const opsTable1_2_13 = Number(opsTable1[2]?.[13]) || 0;
          const opsTable1_3_13 = Number(opsTable1[3]?.[13]) || 0;
          const defaultPrintCost = Math.max(opsTable1_1_13, opsTable1_2_13, opsTable1_3_13);
          
          const printcost = webOrSheet === "Web" ? 
            (noOfPages / maxUps * Math.max(Qty / noOfTitles - 3000, 0) / 2) / 1000 * (front_print * opsTable1_4_13 + back_print * opsTable1_4_13) : 
            (noOfPages / maxUps * Math.max(Qty / noOfTitles - 3000, 0) / 2) / 1000 * (Number(XLOOKUP(front_print, opsTable1, 12, 13, defaultPrintCost)) * front_print + Number(XLOOKUP(back_print, opsTable1, 12, 13, defaultPrintCost)) * back_print);
          
          // Update display table
          if (!displayTable[i]) displayTable[i] = [];
          displayTable[i][1] = comp;
          displayTable[i][2] = SheetLen;
          displayTable[i][3] = SheetWid;
          displayTable[i][4] = maxUps;
          displayTable[i][5] = sheetWaistepercent;
          displayTable[i][6] = paperSzType;
          displayTable[i][0] = indexNo;
          displayTable[i][7] = paperType;
          // Ensure all values are numbers, not null/NaN
          const paperWtNum = Number(paperWt) || 0;
          const paperPriceNum = Number(paperPrice) || 0;
          
          displayTable[i][8] = isNaN(paperWtNum) ? 0 : paperWtNum;
          displayTable[i][9] = isNaN(paperPriceNum) ? 0 : paperPriceNum;
          displayTable[i][10] = isNaN(paperPriceNum * paperWtNum) ? 0 : (paperPriceNum * paperWtNum);
          // Calculate CTP cost: (fractional part lookup + integer part) * (front + back print) * cost per plate
          const formsPerSheet = noOfPages / maxUps / 2;
          const integerForms = Math.floor(formsPerSheet);
          const fractionalPart = formsPerSheet - integerForms;
          // If fractional part is 0 (or very close to 0 due to floating point), use 0 directly
          // Otherwise lookup the multiplier from the table
          const fractionalMultiplierRaw = (fractionalPart < 0.0001) ? 0 : XLOOKUP(fractionalPart, opsTable1, 28, 29, 1);
          const fractionalMultiplier = Number(fractionalMultiplierRaw) || 0;
          const totalForms = fractionalMultiplier + integerForms;
          // Calculate CTP cost with validation
          const frontPrintNum = Number(front_print) || 0;
          const backPrintNum = Number(back_print) || 0;
          const ctpCost = totalForms * (frontPrintNum + backPrintNum) * opsTable1_5_13;
          displayTable[i][11] = isNaN(ctpCost) ? 0 : ctpCost;
          
          // Calculate print cost with validation
          const printCostNum = Number(printcost) || 0;
          displayTable[i][12] = isNaN(printCostNum) ? 0 : printCostNum;
          
          // Calculate surface finish cost with validation
          const frontSurfaceCost = Number(XLOOKUP(front_surface, opsTable1, 7, 8, 0)) || 0;
          const backSurfaceCost = Number(XLOOKUP(back_surface, opsTable1, 7, 8, 0)) || 0;
          console.log('[COMMERCIAL_SURFACE_COST]', {
            front_surface,
            back_surface,
            front_surface_cost: frontSurfaceCost,
            back_surface_cost: backSurfaceCost
          });
          const surfaceFinishCost =
            (Number(SheetLen) / 25.4) *
            (Number(SheetWid) / 25.4) /
            100 *
            (Number(noOfPages) / Number(maxUps)) *
            (Number(Qty) / Number(noOfTitles)) /
            2 *
            (frontSurfaceCost + backSurfaceCost);
          displayTable[i][13] = isNaN(surfaceFinishCost) ? 0 : surfaceFinishCost;

          // Actual (master) rates from opsTable2 — same column layout as pricing UI (Material / Surface "actual").
          const paperTypeKey = String(paperType || '').trim();
          const paperPriceActRaw = XLOOKUP(paperTypeKey, opsTable2, 2, 3, '');
          const paperPriceAct =
            paperPriceActRaw === '' || paperPriceActRaw === null || paperPriceActRaw === undefined
              ? 0
              : Number(paperPriceActRaw) || 0;
          const paperCostAct = isNaN(paperWtNum * paperPriceAct) ? 0 : paperWtNum * paperPriceAct;

          const opsTable2_3_13 = Number(opsTable2[3]?.[13]) || 0;
          const opsTable2_4_13 = Number(opsTable2[4]?.[13]) || 0;
          const opsTable2_5_13 = Number(opsTable2[5]?.[13]) || 0;
          const defaultPrintCostAct = Math.max(opsTable2_3_13, opsTable2_4_13, opsTable2_5_13);
          const opsTable2Web13 = commCol13WhereCol12Label(opsTable2, 'Web');
          const printcostAct =
            webOrSheet === 'Web'
              ? ((noOfPages / maxUps) * Math.max(Qty / noOfTitles - 3000, 0) / 2) /
                  1000 *
                  (front_print * opsTable2Web13 + back_print * opsTable2Web13)
              : ((noOfPages / maxUps) * Math.max(Qty / noOfTitles - 3000, 0) / 2) /
                  1000 *
                  (Number(XLOOKUP(front_print, opsTable2, 13, 14, defaultPrintCostAct)) * front_print +
                    Number(XLOOKUP(back_print, opsTable2, 13, 14, defaultPrintCostAct)) * back_print);

          const plateRateAct = commCol13WhereCol12Label(opsTable2, 'Plate');
          const ctpCostAct = totalForms * (frontPrintNum + backPrintNum) * plateRateAct;

          const frontSurfaceKey = String(front_surface || '').trim();
          const backSurfaceKey = String(back_surface || '').trim();
          const frontSurfaceAct = Number(XLOOKUP(frontSurfaceKey, opsTable2, 7, 8, 0)) || 0;
          const backSurfaceAct = Number(XLOOKUP(backSurfaceKey, opsTable2, 7, 8, 0)) || 0;
          const surfaceFinishCostAct =
            (Number(SheetLen) / 25.4) *
            (Number(SheetWid) / 25.4) /
            100 *
            (Number(noOfPages) / Number(maxUps)) *
            (Number(Qty) / Number(noOfTitles)) /
            2 *
            (frontSurfaceAct + backSurfaceAct);

          displayTable[i][14] = isNaN(paperCostAct) ? 0 : paperCostAct;
          displayTable[i][15] = isNaN(ctpCostAct) ? 0 : ctpCostAct;
          displayTable[i][16] = isNaN(printcostAct) ? 0 : printcostAct;
          displayTable[i][17] = isNaN(surfaceFinishCostAct) ? 0 : surfaceFinishCostAct;

          const componentVarCost = (displayTable[i][10] || 0) + (displayTable[i][11] || 0) + (displayTable[i][12] || 0) + (displayTable[i][13] || 0);
          const componentVarCostActual =
            (displayTable[i][14] || 0) + (displayTable[i][15] || 0) + (displayTable[i][16] || 0) + (displayTable[i][17] || 0);
          console.log('[var cost components]', {
            paper_cost: displayTable[i][10] || 0,
            ctp_cost: displayTable[i][11] || 0,
            print_cost: displayTable[i][12] || 0,
            surface_cost: displayTable[i][13] || 0,
            var_cost: componentVarCost,
            paper_cost_actual: displayTable[i][14] || 0,
            ctp_cost_actual: displayTable[i][15] || 0,
            print_cost_actual: displayTable[i][16] || 0,
            surface_cost_actual: displayTable[i][17] || 0,
            var_cost_actual: componentVarCostActual
          });
          console.log('[COMMERCIAL_COMPONENT_COST]', {
            component_index: indexNo,
            component_name: comp,
            mat_len: Number(SheetLen) || 0,
            mat_wid: Number(SheetWid) || 0,
            ups: Number(maxUps) || 0,
            sheet_waste: Number(sheetWaistepercent) || 0,
            paper_size_type: paperSzType || '',
            paper_type: paperType || '',
            paper_wt: displayTable[i][8] || 0,
            paper_price: displayTable[i][9] || 0,
            paper_cost: displayTable[i][10] || 0,
            ctp_cost: displayTable[i][11] || 0,
            print_cost: displayTable[i][12] || 0,
            surface_cost: displayTable[i][13] || 0,
            var_cost: componentVarCost,
            paper_price_actual: paperPriceAct,
            paper_cost_actual: displayTable[i][14] || 0,
            ctp_cost_actual: displayTable[i][15] || 0,
            print_cost_actual: displayTable[i][16] || 0,
            surface_cost_actual: displayTable[i][17] || 0,
            var_cost_actual: componentVarCostActual
          });
          
        maxUpsArray.push(maxUps || 0);
      }
    }
    
    stepTime = Date.now();
    logStep('>>> Calculating final costs', stepTime, requestStartTime);
    
    const bookWt = quoteinfo.len / 1000 * quoteinfo.brd / 1000 * (sumProduct(gsmCol.flat(), textPagesCol.flat())) / 2000;
    const totalPaperCost = sumColumn(displayTable, 10);
    const totalCTPPrint = sumColumn(displayTable, 11) + sumColumn(displayTable, 12);
    const totalSurfceFinish = sumColumn(displayTable, 13);

    const bindcost = calcbindcostNew(bindingStyle, Qty / noOfTitles, costarr, maxUpsArray, compCol, textPagesCol);
    const componentsActualSubtotal = sumRowsActualComponentsOnly(displayTable);

    const baseCust = totalPaperCost + totalCTPPrint + totalSurfceFinish + bindcost[0];

    const packingLookupRaw = String(quoteinfo.packing_type || quoteinfo.packing_lookup || 'Carton').trim();
    const packingLookup =
      packingLookupRaw.toLowerCase() === 'pallet' ? 'Pallet' : 'Carton';
    let packing = bookWt * Qty / noOfTitles * XLOOKUP(packingLookup, opsTable1, 19, 20, 0);
    const packingOverrideRaw = quoteinfo.packing_override;
    if (packingOverrideRaw !== undefined && packingOverrideRaw !== null && packingOverrideRaw !== '') {
      const po = Number(packingOverrideRaw);
      if (!isNaN(po) && po >= 0) {
        packing = po;
      }
    }

    let shipping_fob = 3 * bookWt * Qty / noOfTitles;
    const cifFobPerKg = Number(quoteinfo.cif_fob_per_kg);
    if (!isNaN(cifFobPerKg) && cifFobPerKg >= 0) {
      shipping_fob = cifFobPerKg * bookWt * Qty / noOfTitles;
    }

    const addlBindMatCost = Number(quoteinfo.addl_binding_mat_cost) || 0;
    const addlBindLabourCost = Number(quoteinfo.addl_binding_labour_cost) || 0;
    const diceBlockCost = Number(quoteinfo.dice_block_cost) || 0;
    const addlOrderCosts = addlBindMatCost + addlBindLabourCost + diceBlockCost;

    const overheadResolved = resolveCommercialOverheadPercent({
      quoteinfo,
      qty: Qty,
      baseCust,
      componentsActualSubtotal,
      bindcost,
      packing,
      shipping_fob,
      addlOrderCosts
    });
    const overheadPercent3 = overheadResolved.rate;
    const overheads = overheadPercent3 * baseCust;
    const overheadsActual = overheadPercent3 * (componentsActualSubtotal + bindcost[1]);
    const varCost = baseCust + overheads;
    const varCostActual = componentsActualSubtotal + bindcost[1];
    const totalVarCustomer = varCost + packing + shipping_fob;
    const totalVar = varCostActual + packing + shipping_fob;

    const total = totalVarCustomer + addlOrderCosts;

    const price_per_unit = total / (Qty / noOfTitles);

    const currency = String(quoteinfo.currency || 'INR').trim() || 'INR';
    const fxInrPerFc = Number(quoteinfo.exchange_rate_inr_per_fc);
    const quotedPriceInInr = price_per_unit;
    const quotedPriceInCurrency =
      currency === 'INR'
        ? price_per_unit
        : !isNaN(fxInrPerFc) && fxInrPerFc > 0
          ? Math.round((price_per_unit / fxInrPerFc) * 100) / 100
          : null;
    /** Total VAR for GP (matches UI): actual variable cost + packing; excludes shipping. */
    const totalVarForGp = varCostActual + packing;
    const gpPercent =
      total > 0 && isFinite(total) && isFinite(totalVarForGp)
        ? (1 - totalVarForGp / total) * 100
        : null;
    console.log('[COMMERCIAL_COST_SUMMARY]', {
      book_wt: bookWt,
      total_paper_cost: totalPaperCost,
      total_print_ctp_cost: totalCTPPrint,
      total_surface_finish_cost: totalSurfceFinish,
      total_binding_cost: bindcost[0],
      overhead_percent: overheadPercent3,
      overheads,
      var_cost: varCost,
      components_actual_subtotal: componentsActualSubtotal,
      total_binding_cost_actual: bindcost[1],
      overheads_actual: overheadsActual,
      var_cost_actual: varCostActual,
      packing,
      shipping_fob,
      total_var: totalVar,
      total_var_customer: totalVarCustomer,
      total,
      quoted_price_in_inr: quotedPriceInInr,
      quoted_price_in_currency: quotedPriceInCurrency,
      gp_percent: gpPercent
    });
    const commercial_extras = {
      addl_binding_mat_description: String(quoteinfo.addl_binding_mat_description || '').trim(),
      addl_binding_mat_cost: addlBindMatCost,
      addl_binding_labour_description: String(quoteinfo.addl_binding_labour_description || '').trim(),
      addl_binding_labour_cost: addlBindLabourCost,
      dice_block_cost: diceBlockCost,
      cif_fob_per_kg: !isNaN(cifFobPerKg) && cifFobPerKg >= 0 ? cifFobPerKg : null,
      packing_applied: packing,
      packing_lookup: packingLookup,
      packing_default_used: packingOverrideRaw === undefined || packingOverrideRaw === null || packingOverrideRaw === '',
      shipping_fob_applied: shipping_fob,
      currency,
      quoted_price_in_inr: quotedPriceInInr,
      quoted_price_in_currency: quotedPriceInCurrency,
      gp_percent: gpPercent,
      variable_cost_actual: {
        components_actual_subtotal: componentsActualSubtotal,
        total_binding: bindcost[1],
        overheads: overheadsActual,
        components_plus_binding: varCostActual,
        packing,
        shipping_fob,
        total_var: totalVar,
        per_unit_components_binding: varCostActual / (Qty / noOfTitles),
        per_unit_with_logistics: totalVar / (Qty / noOfTitles)
      }
    };

    logStep(`>>> calCulate: Completed in ${Date.now() - calcStartTime}ms`, calcStartTime, requestStartTime);

    const commercial_cost_summary = {
      book_wt: bookWt,
      total_paper_cost: totalPaperCost,
      total_print_ctp_cost: totalCTPPrint,
      total_surface_finish_cost: totalSurfceFinish,
      total_binding_cost: bindcost[0],
      overhead_percent: overheadPercent3,
      overhead_mode: overheadResolved.mode,
      target_gp_percent:
        overheadResolved.targetGpDecimal != null
          ? Math.round(overheadResolved.targetGpDecimal * 10000) / 100
          : null,
      overheads,
      var_cost: varCost,
      components_actual_subtotal: componentsActualSubtotal,
      total_binding_cost_actual: bindcost[1],
      overheads_actual: overheadsActual,
      var_cost_actual: varCostActual,
      packing,
      shipping_fob,
      total_var: totalVar,
      total_var_customer: totalVarCustomer,
      total,
      quoted_price_in_inr: quotedPriceInInr,
      quoted_price_in_currency: quotedPriceInCurrency,
      gp_percent: gpPercent
    };

    const result = {
      price_per_unit,
      displayTable,
      commercial_extras,
      commercial_cost_summary,
      quote_context: {
        client_name: String(quoteinfo.client_name || '').trim(),
        sku_name: String(quoteinfo.sku_name || '').trim(),
        no_of_titles: noOfTitles,
        overhead: overheadPercent3,
        overhead_mode: overheadResolved.mode,
        target_gp_percent:
          overheadResolved.targetGpDecimal != null
            ? Math.round(overheadResolved.targetGpDecimal * 10000) / 100
            : null
      }
    };

    result.currency = currency;

    if (currency !== 'INR' && !isNaN(fxInrPerFc) && fxInrPerFc > 0) {
      result.price_per_unit_foreign = quotedPriceInCurrency;
      result.exchange_rate_inr_per_fc = fxInrPerFc;
    }

    return result;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error in calCulate:`, error);
    logStep(`>>> calCulate: Failed after ${Date.now() - calcStartTime}ms`, calcStartTime, requestStartTime);
    throw error;
  }
}

// Helper functions
function extractElements(array2D, startCol, endCol) {
  return array2D.map(function(subArray) {
    return subArray.slice(startCol, endCol);
  });
}

/** Loose match for text / numeric sheet cells (e.g. 1 vs "1"). Empty search never matches (avoids first blank row). */
function commercialLookupKeyEqual(searchValue, currentValue) {
  const s = searchValue == null ? '' : String(searchValue).trim();
  if (s === '') return false;
  if (searchValue === currentValue) return true;
  const c = String(currentValue == null ? '' : currentValue).trim();
  if (s === c) return true;
  const ns = Number(s);
  const nc = Number(currentValue);
  if (c !== '' && !isNaN(ns) && !isNaN(nc) && ns === nc) return true;
  return false;
}

function XLOOKUP(searchValue, searchArray, searchCol, returnCol, ifNotFound = null, matchType = 0) {
  searchCol = searchCol - 1;
  returnCol = returnCol - 1;
  
  let foundValue = ifNotFound;

  if (!Array.isArray(searchArray) || searchArray.length === 0) {
    return ifNotFound;
  }
  
  if (!Array.isArray(searchArray[0])) {
    searchArray = searchArray.map(value => [value]);
  }

  let maxCols = 0;
  for (let r = 0; r < searchArray.length; r++) {
    const row = searchArray[r];
    if (Array.isArray(row) && row.length > maxCols) maxCols = row.length;
  }
  
  if (searchArray.length === 0 || searchCol < 0 || returnCol < 0 || maxCols === 0 || searchCol >= maxCols || returnCol >= maxCols) {
    return ifNotFound;
  }
  
  let bestMatchIndex = -1;
  let bestMatchValue;
  
  for (let i = 0; i < searchArray.length; i++) {
    const row = searchArray[i];
    if (!Array.isArray(row) || row.length <= searchCol || row.length <= returnCol) {
      continue;
    }
    let currentValue = row[searchCol];
    if (matchType === 0) {
      if (commercialLookupKeyEqual(searchValue, currentValue)) {
        return row[returnCol];
      }
    } else if (matchType === 1) {
      if (currentValue >= searchValue && (bestMatchIndex === -1 || currentValue < bestMatchValue)) {
        bestMatchIndex = i;
        bestMatchValue = currentValue;
      }
    } else if (matchType === -1) {
      if (currentValue <= searchValue && (bestMatchIndex === -1 || currentValue > bestMatchValue)) {
        bestMatchIndex = i;
        bestMatchValue = currentValue;
      }
    }
  }
  
  if (bestMatchIndex !== -1) {
    const hit = searchArray[bestMatchIndex];
    if (Array.isArray(hit) && hit.length > returnCol) {
      foundValue = hit[returnCol];
    }
  }
  
  // Convert empty strings to null for consistency, or to 0 if ifNotFound is numeric
  if (foundValue === "" || foundValue === null || foundValue === undefined) {
    // If ifNotFound is a number, return it; otherwise return the ifNotFound value
    return (typeof ifNotFound === 'number') ? ifNotFound : foundValue;
  }
  
  return foundValue;
}

function calculateWaiste(SheetLen, SheetWid, Bklen1, BkBrd1, complexity) {
  const xv = Math.floor((SheetWid - 12) / (Bklen1 + lenbuffer));
  const yv = Math.floor((SheetLen - 10) / (2 * (BkBrd1 + widbuffer)));
  const vUps = xv * yv * 2;
  const xh = Math.floor((SheetWid - 12) / (2 * (BkBrd1 + widbuffer)));
  const yh = Math.floor((SheetLen - 10) / (Bklen1 + lenbuffer));
  const hUps = xh * yh * 2;
  const maxUps = stdUps1(Math.max(vUps, hUps), complexity);
  
  const sheetWaistepercent = 1 - (Bklen1 * BkBrd1 * maxUps) / (SheetLen * SheetWid);
  return [sheetWaistepercent, maxUps];
}

function calculateWaisteFoamOrBoard(SheetLen, SheetWid, Bklen1, BkBrd1) {
  const xv = Math.floor((SheetWid - 20) / (Bklen1 + lenbuffer));
  const yv = Math.floor((SheetLen - 10) / (2 * (BkBrd1 + widbuffer)));
  const vUps = xv * yv * 2;
  const xh = Math.floor((SheetWid - 20) / (2 * (BkBrd1 + widbuffer)));
  const yh = Math.floor((SheetLen - 10) / (Bklen1 + lenbuffer));
  const hUps = xh * yh * 2;
  const maxUps = Math.max(vUps, hUps);
  
  const sheetWaistepercent = 1 - (Bklen1 * BkBrd1 * maxUps) / (SheetLen * SheetWid);
  return [sheetWaistepercent, maxUps];
}

function calculateXY(ups) {
  let x = 0;
  let y = 0;
  const Ups = ups;
  if (Ups === 1) {
    x = 1;
    y = 1;
  } else if (Ups === 2) {
    x = 2;
    y = 1;
  } else if (Ups === 4) {
    x = 2;
    y = 2;
  } else if (Ups === 6) {
    x = 2;
    y = 3;
  } else if (Ups === 8) {
    x = 4;
    y = 2;
  } else if (Ups === 12) {
    x = 4;
    y = 3;
  } else if (Ups === 16) {
    x = 4;
    y = 4;
  } else if (Ups === 24) {
    x = 4;
    y = 6;
  } else if (Ups === 32) {
    x = 4;
    y = 8;
  } else if (Ups === 40) {
    x = 5;
    y = 8;
  } else {
    x = 6;
    y = 8;
  }
  return [x, y];
}

function webSizeConv(width) {
  let SheetWid = 0;
  if (width <= 508) {
    SheetWid = 508;
  } else if (width > 508 && width <= 546) {
    SheetWid = 546;
  } else if (width > 546 && width <= 578) {
    SheetWid = 578;
  } else {
    SheetWid = 635;
  }
  return SheetWid;
}

function calSpine(bindSt, compCol, gsmCol, textPages, paperTypeCol, coverGSM) {
  let textGSM = 0;
  let spine = 0;
  for (let k = 0; k <= 5; k++) {
    if ((compCol[k] && (compCol[k][0] === "Text" || compCol[k][0] === "End Paper" || compCol[k][0] === "Text - 2" || compCol[k][0] === "Sticker" || compCol[k][0] === "Binding Board")) && compCol[k][0] !== "") {
      if (paperTypeCol[k] && paperTypeCol[k][0] === "Gloss Art") {
        textGSM = textGSM + ((textPages[k][0] / 2) * gsmCol[k][0] * 0.1);
      } else if (paperTypeCol[k] && paperTypeCol[k][0] === "Matt Art") {
        textGSM = textGSM + ((textPages[k][0] / 2) * gsmCol[k][0] * 0.1);
      } else if (paperTypeCol[k] && paperTypeCol[k][0].indexOf("Maplitho") !== -1) {
        textGSM = textGSM + ((textPages[k][0] / 2) * gsmCol[k][0] * 0.135);
      } else if (paperTypeCol[k] && paperTypeCol[k][0] === "Sticker Sheet") {
        textGSM = textGSM + ((textPages[k][0] / 2) * gsmCol[k][0] * 0.135);
      } else {
        textGSM = textGSM + ((textPages[k][0] / 2) * gsmCol[k][0] * 0.17);
      }
      textGSM = textGSM / 100;
    }
  }
  if (bindSt !== "CS") {
    spine = textGSM + (coverGSM * 2 * 0.175) / 100 + 2;
  }
  return spine;
}

function cal_PLC_Cover(paperType, orderSize, forcePaper, Qty, bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm, Bklen, BkBrd, webOrSheet, opsTable, complexity) {
  const spine = calSpine(bindingStyle, compCol, gsmCol, textPagesCol, paperTypeCol, gsm);
  
  if (((((paperType === "FBB" || paperType === "CBB") && orderSize >= 1500) || 
        (paperType.indexOf("Maplitho") !== -1 && orderSize >= 3000) || 
        ((paperType === "Gloss Art" || paperType === "Matt Art") && gsm >= 110 && orderSize >= 6000) || 
        ((paperType === "Gloss Art" || paperType === "Matt Art") && gsm < 110 && orderSize >= 10000)) && 
        forcePaper === "Default") || 
      forcePaper === "Special") {
    let machineWidth, machineLen;
    
    if (Qty > 30000) {
      machineWidth = 720;
      machineLen = 1020;
    } else {
      machineWidth = 640;
      machineLen = 920;
    }
    
    const xv = Math.floor(machineWidth / (Bklen + lenbuffer));
    const yv = Math.floor(machineLen / (2 * (BkBrd + widbuffer) + spine));
    const vUps = xv * yv * 2;
    const xh = Math.floor(machineWidth / (2 * (BkBrd + widbuffer) + spine));
    const yh = Math.floor(machineLen / (Bklen + lenbuffer));
    const hUps = xh * yh * 2;
    const maxUps = Math.max(stdUps1(vUps, complexity), stdUps1(hUps, complexity));
    let SheetLenInit = (Math.min((Bklen + lenbuffer), (BkBrd + widbuffer + (spine / 2)))) * (Math.max(calculateXY(maxUps)[0], calculateXY(maxUps)[1])) + 10;
    let SheetWidInit = (Math.max((Bklen + lenbuffer), (BkBrd + widbuffer + (spine / 2)))) * (Math.min(calculateXY(maxUps)[0], calculateXY(maxUps)[1])) + 20;
    const SheetLen = webOrSheet === "Web" ? multiplierFive(Math.max(SheetLenInit, SheetWidInit) - 11) : multiplierFive(Math.max(SheetLenInit, SheetWidInit));
    const SheetWid = webOrSheet === "Web" ? multiplierFive(webSizeConv((Math.min(SheetWidInit, SheetLenInit)))) : multiplierFive(Math.min(SheetWidInit, SheetLenInit));
    const sheetWaistepercent = 1 - ((Bklen + 6) * (BkBrd + 5 + (spine / 2)) * maxUps) / (SheetLen * SheetWid);
    const paperSzType = "Special";
    
    return [maxUps, SheetLen, SheetWid, sheetWaistepercent, paperSzType];
  } else {
    let sheetWaistepercent = 1;
    let SheetLen, SheetWid, maxUps, paperSzType;
    
    for (let j = 0; j < opsTable.length; j++) {
      if (opsTable[j] && opsTable[j][0] !== "" && 
          calculateWaiste(opsTable[j][1], opsTable[j][0], (Bklen), (BkBrd + 5 + (spine / 2) - 4), complexity)[0] < sheetWaistepercent) {
        SheetLen = opsTable[j][1];
        SheetWid = opsTable[j][0];
        maxUps = calculateWaiste(opsTable[j][1], opsTable[j][0], Bklen, (BkBrd + 5 + (spine / 2) - 4), complexity)[1];
        paperSzType = "Standard";
        sheetWaistepercent = calculateWaiste(opsTable[j][1], opsTable[j][0], Bklen, (BkBrd + 5 + (spine / 2) - 4), complexity)[0];
      }
    }
    
    return [maxUps, SheetLen, SheetWid, sheetWaistepercent, paperSzType];
  }
}

function multiplierFive(Num) {
  const mltplier = Num / 5;
  const opt = Math.ceil(mltplier) * 5;
  return opt;
}

function calcbindcostNew(binding_style, Qty, costarr, maxUpsArray, compCol, textPagesCol) {
  let bindcost = 0;
  let bindcostact = 0;
  
  const process = String(binding_style || '').trim();
  
  if (process !== "") {
    const bindcostbreakup = getbindcost(costarr, process);
    const bindcostbreakupact = getbindcostact(costarr, process);
    const bindPerSig = Number(bindcostbreakup[0]) || 0;
    const bindFixed = Number(bindcostbreakup[1]) || 0;
    const bindActPerSig = Number(bindcostbreakupact[0]) || 0;
    const bindActFixed = Number(bindcostbreakupact[1]) || 0;
    let sig = 0;
    let spread = 0;
    
    for (let ct = 0; ct < compCol.length; ct++) {
      if (compCol[ct] && (compCol[ct][0] === "Text" || compCol[ct][0] === "Text - 2" || compCol[ct][0] === "Sticker Paper")) {
        sig = sig + Math.ceil(textPagesCol[ct][0] / Math.min(32, maxUpsArray[ct] * 2));
        spread = spread + textPagesCol[ct][0] / 4;
      }
    }
    
    if (process === "Plain Board Book" || process === "HC + Board Book" || process === "HC+Foam+Board Book") {
      bindcost = (spread * bindPerSig + bindFixed) * Qty;
      bindcostact = (spread * bindActPerSig + bindActFixed) * Qty;
    } else {
      bindcost = Math.round((sig * bindPerSig + bindFixed) * Qty);
      bindcostact = Math.round((sig * bindActPerSig + bindActFixed) * Qty);
    }
  }
  
  const bindcostcomp = [];
  bindcostcomp[0] = bindcost;
  bindcostcomp[1] = bindcostact;
  return bindcostcomp;
}

function separateString(inputString) {
  const parts = inputString.split("/");
  return parts;
}

function convertArrayFormat(array1) {
  const array2 = [];
  
  for (let i = 0; i < array1[0].length; i++) {
    array2.push([array1[i]]);
  }
  
  return array2;
}

function getStdLenBrd(dim, bindingStyle) {
  if (dim < 100) {
    const newDim = bindingStyle.indexOf("Board Book") !== -1 ? dim + 2 + 3 : dim + 2;
    return newDim;
  } else {
    const newDim = bindingStyle.indexOf("Board Book") !== -1 ? dim + 3 : dim;
    return newDim;
  }
}

function sumProduct(array1, array2) {
  if (array1.length !== array2.length) {
    throw new Error("Arrays must be of the same length");
  }
  
  let sumProduct = 0;
  
  for (let i = 0; i < array1.length; i++) {
    sumProduct += array1[i] * array2[i];
  }
  
  return sumProduct;
}

function getbindcost(costarr, process) {
  const bindcost = [];
  bindcost[0] = 0;
  bindcost[1] = 0;
  if (!process) {
    return bindcost;
  }
  
  for (let i = 0; i < costarr.length; i++) {
    if (Array.isArray(costarr[i]) && costarr[i].length && String(costarr[i][3] || '').trim() === process) {
      bindcost[0] = costarr[i][4];
      bindcost[1] = costarr[i][5];
      return bindcost;
    }
    if (Array.isArray(costarr[i]) && costarr[i].length && String(costarr[i][3] || '').trim() === "") {
      return bindcost;
    }
  }
  return bindcost;
}

/** First material row index in costarr after the duplicate "Parameter / Rate" header (actual binding block). */
function actualBindingCostarrStart(costarr) {
  if (!Array.isArray(costarr)) return 0;
  for (let i = 0; i < costarr.length; i++) {
    const row = costarr[i];
    if (!Array.isArray(row) || row.length < 3) continue;
    if (String(row[1] || '').trim() === 'Parameter' && String(row[2] || '').trim() === 'Rate') {
      return i + 1;
    }
  }
  return 17;
}

function getbindcostact(costarr, process) {
  const bindcost = [];
  bindcost[0] = 0;
  bindcost[1] = 0;
  if (!process) {
    return bindcost;
  }
  const start = actualBindingCostarrStart(costarr);
  for (let i = start; i < costarr.length; i++) {
    const row = costarr[i];
    if (!Array.isArray(row) || !row.length) continue;
    const col3 = String(row[3] || '').trim();
    if (col3 === 'Actual Binding') continue;
    if (col3 === process) {
      bindcost[0] = row[4];
      bindcost[1] = row[5];
      return bindcost;
    }
  }
  return bindcost;
}

/**
 * Helper function to convert string to 2D array
 */
function convertStringToArray(inputString) {
  if (inputString === undefined || inputString === null) {
    return [[''], [''], [''], [''], [''], ['']];
  }
  const s = String(inputString).trim();
  if (s === '') {
    return [[''], [''], [''], [''], [''], ['']];
  }
  const elements = s.split('$');
  const result = elements.map((element) => [String(element).trim()]);
  while (result.length < 6) {
    result.push(['']);
  }
  return result;
}

/** Same shape as convertStringToArray; empty when field omitted from request. */
function dollarFieldToCols(quoteinfo, key) {
  const v = quoteinfo[key];
  if (v === undefined || v === null || String(v).trim() === '') {
    return [[], [], [], [], [], []];
  }
  return convertStringToArray(String(v));
}

function dollarCell(col, i) {
  if (!col[i] || col[i][0] === undefined || col[i][0] === null) return '';
  return String(col[i][0]).trim();
}

/**
 * Calculate standard ups based on ups value and complexity
 */
function stdUps1(Ups, complexity) {
  let maxUps = 0;
  if (complexity === "Simple" || complexity === "") {
    if (Ups === 3) {
      maxUps = 2;
    } else if (Ups === 6) {
      maxUps = 6;
    } else if (Ups === 10) {
      maxUps = 8;
    } else if (Ups === 14) {
      maxUps = 12;
    } else if (Ups > 16 && Ups < 24) {
      maxUps = 16;
    } else if (Ups > 24 && Ups < 32) {
      maxUps = 24;
    } else if (Ups > 32) {
      maxUps = 32;
    } else {
      maxUps = Ups;
    }
  } else {
    if (Ups === 3) {
      maxUps = 2;
    } else if (Ups === 6) {
      maxUps = 6;
    } else if (Ups === 10) {
      maxUps = 8;
    } else if (Ups === 14) {
      maxUps = 12;
    } else if (Ups > 16 && Ups < 24) {
      maxUps = 16;
    } else if (Ups > 24 && Ups < 32) {
      maxUps = 24;
    } else if (Ups > 32 && Ups < 40) {
      maxUps = 32;
    } else if (Ups > 40 && Ups < 48) {
      maxUps = 40;
    } else if (Ups > 48) {
      maxUps = 48;
    } else {
      maxUps = Ups;
    }
  }

  return maxUps;
}

/** 0-based col 12 (1-based col 13) equals label; return numeric col 13 (0-based). Used for Web / Plate print rates in ops tables. */
function commCol13WhereCol12Label(opsTable, label) {
  if (!Array.isArray(opsTable)) return 0;
  const want = String(label).trim();
  for (let i = 0; i < opsTable.length; i++) {
    const row = opsTable[i];
    if (!row || row.length < 14) continue;
    if (String(row[12]).trim() === want) {
      const n = Number(row[13]);
      return isNaN(n) ? 0 : n;
    }
  }
  return 0;
}

/**
 * Sum values in a specific column of a 2D array
 */
function sumColumn(array2D, columnNumber) {
  let sum = 0;

  // Iterate through each row in the 2D array
  for (let i = 0; i < array2D.length; i++) {
    // Check if the row has the specified column index
    if (array2D[i] && array2D[i].length > columnNumber) {
      sum += Number(array2D[i][columnNumber]) || 0;
    }
  }

  return sum;
}

/** Sum of each row's actual component costs only (displayTable cols 14–17); excludes binding. */
function sumRowsActualComponentsOnly(displayTable) {
  if (!Array.isArray(displayTable)) return 0;
  let sum = 0;
  for (let i = 0; i < displayTable.length; i++) {
    const row = displayTable[i];
    if (!Array.isArray(row)) continue;
    sum += (Number(row[14]) || 0) + (Number(row[15]) || 0) + (Number(row[16]) || 0) + (Number(row[17]) || 0);
  }
  return sum;
}

export {
  calCulate,
  extractElements,
  XLOOKUP,
  calculateWaiste,
  calculateWaisteFoamOrBoard,
  calculateXY,
  webSizeConv,
  calSpine,
  cal_PLC_Cover,
  multiplierFive,
  calcbindcostNew,
  separateString,
  convertArrayFormat,
  getStdLenBrd,
  sumProduct,
  getbindcost,
  getbindcostact,
  convertStringToArray,
  stdUps1,
  sumColumn
};




