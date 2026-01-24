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
    const compCol = convertStringToArray(quoteinfo.components);
    const gsmCol = convertStringToArray(quoteinfo.gsm);
    const textPagesCol = convertStringToArray(quoteinfo.page_number);
    const paperTypeCol = convertStringToArray(quoteinfo.material);
    const front_print_col = convertStringToArray(quoteinfo.front_print);
    const back_print_col = convertStringToArray(quoteinfo.back_print);
    const front_surface_col = convertStringToArray(quoteinfo.front_surface);
    const back_surface_col = convertStringToArray(quoteinfo.back_surface);
    
    let spineStr = '';
    const maxUpsArray = [];
    
    // Declare variables outside the loop so they're accessible after the loop
    const bindingStyle = quoteinfo.binding_style;
    const noOfTitles = quoteinfo.no_of_titles !== "" ? Number(quoteinfo.no_of_titles) : 1;
    const Qty = Number(quoteinfo.Qty) * noOfTitles;
    
    if (compCol[0] === "" || !compCol[0]) {
      throw new Error("Please insert mandatory information!");
    } else {
      for (let i = 0; i < (lastRow - inputStartRow + 1); i++) {
        const comp = compCol[i] ? compCol[i][0] : null;
        const complexity = "Simple";
        
        if (comp != null) {
          console.log(comp);
          const Bklen = getStdLenBrd(Number(quoteinfo.len), bindingStyle);
          const BkBrd = getStdLenBrd(Number(quoteinfo.brd), bindingStyle);
          
          const noOfPages = Number(textPagesCol[i] ? textPagesCol[i][0] : 0);
          const gsm = Number(gsmCol[i] ? gsmCol[i][0] : 0);
          const paperType = paperTypeCol[i] ? paperTypeCol[i][0] : "";
          const front_print = Number(front_print_col[i] ? front_print_col[i][0] : 0);
          const back_print = back_print_col[i] === "" || !back_print_col[i] ? 0 : Number(back_print_col[i][0]);
          const front_surface = front_surface_col[i] ? front_surface_col[i][0] : "";
          const back_surface = back_surface_col[i] ? back_surface_col[i][0] : "";
          
          const webOrSheet = paperType === "Bible Paper" ? "Web" : paperType !== "" ? "Sheet" : "Sheet";
          
          const forcePaper = "Default";
          const indexNo = inputTable[i] ? inputTable[i][0] : i + 1;
          
          console.log([comp, noOfPages, noOfTitles, Qty, gsm, paperType, front_print, back_print, front_surface, Bklen, BkBrd, quoteinfo.len, quoteinfo.brd]);
          
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
              
              console.log([machineLen, machineWidth]);
              
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
            const leftAddPlusRightADD = 0;
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

          // [sheetLen, sheetWid, gsm, noOfPages, maxUps, Qty, noOfTitles]
          console.log(SheetLen, SheetWid, gsm, noOfPages, maxUps, Qty, noOfTitles,"######################################");
          const paperPrice = paperPriceRaw === "" || paperPriceRaw === null || paperPriceRaw === undefined ? 0 : Number(paperPriceRaw) || 0;
          
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

          console.log(paperWt,"######################################",paperWtNum);
          
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
          const surfaceFinishCost = Number(SheetLen) / 25.4 * Number(SheetWid) / 25.4 / 100 * Number(noOfPages) / Number(maxUps) * Number(Qty) / Number(noOfTitles) / 2 * frontSurfaceCost + backSurfaceCost;
          displayTable[i][13] = isNaN(surfaceFinishCost) ? 0 : surfaceFinishCost;
          
          maxUpsArray.push(maxUps || 0);
        }
      }
    }
    
    stepTime = Date.now();
    logStep('>>> Calculating final costs', stepTime, requestStartTime);
    
    const bookWt = quoteinfo.len / 1000 * quoteinfo.brd / 1000 * (sumProduct(gsmCol.flat(), textPagesCol.flat())) / 2000;
    const totalPaperCost = sumColumn(displayTable, 10);
    const totalCTPPrint = sumColumn(displayTable, 11) + sumColumn(displayTable, 12);
    const totalSurfceFinish = sumColumn(displayTable, 13);
    
    const bindcost = calcbindcostNew(bindingStyle, Qty / noOfTitles, costarr, maxUpsArray, compCol, textPagesCol);
    
    console.log(displayTable);
    
    const overheadPercent3 = 0.15;
    const overheads = overheadPercent3 * (totalPaperCost + totalCTPPrint + totalSurfceFinish + bindcost[0]);
    const packing = bookWt * Qty / noOfTitles * XLOOKUP("Carton", opsTable1, 19, 20, 0);
    const shipping_fob = 3 * bookWt * Qty / noOfTitles;
    
    const total = totalCTPPrint + totalSurfceFinish + totalPaperCost + bindcost[0] + overheads + packing + shipping_fob;
    
    const price_per_unit = total / (Qty / noOfTitles);
    console.log([bookWt, totalCTPPrint, totalPaperCost, totalSurfceFinish, packing, shipping_fob, total, price_per_unit]);
    console.log(price_per_unit);
    
    logStep(`>>> calCulate: Completed in ${Date.now() - calcStartTime}ms`, calcStartTime, requestStartTime);
    
    return {
      price_per_unit: price_per_unit,
      displayTable: displayTable
    };
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

function XLOOKUP(searchValue, searchArray, searchCol, returnCol, ifNotFound = null, matchType = 0) {
  searchCol = searchCol - 1;
  returnCol = returnCol - 1;
  
  let foundValue = ifNotFound;
  
  if (!Array.isArray(searchArray[0])) {
    searchArray = searchArray.map(value => [value]);
  }
  
  if (searchArray.length === 0 || searchCol < 0 || returnCol < 0 || searchCol >= searchArray[0].length || returnCol >= searchArray[0].length) {
    return ifNotFound;
  }
  
  let bestMatchIndex = -1;
  let bestMatchValue;
  
  for (let i = 0; i < searchArray.length; i++) {
    let currentValue = searchArray[i][searchCol];
    if (matchType === 0) {
      if (currentValue === searchValue) {
        return searchArray[i][returnCol];
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
    foundValue = searchArray[bestMatchIndex][returnCol];
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
  
  const process = binding_style;
  
  if (process !== "") {
    const bindcostbreakup = getbindcost(costarr, process);
    const bindcostbreakupact = getbindcostact(costarr, process);
    let sig = 0;
    let spread = 0;
    
    for (let ct = 0; ct < compCol.length; ct++) {
      if (compCol[ct] && (compCol[ct][0] === "Text" || compCol[ct][0] === "Text - 2" || compCol[ct][0] === "Sticker Paper")) {
        sig = sig + Math.ceil(textPagesCol[ct][0] / Math.min(32, maxUpsArray[ct] * 2));
        spread = spread + textPagesCol[ct][0] / 4;
      }
    }
    
    if (process === "Plain Board Book" || process === "HC + Board Book" || process === "HC+Foam+Board Book") {
      bindcost = (spread * bindcostbreakup[0] + bindcostbreakup[1]) * Qty;
      bindcostact = (spread * bindcostbreakupact[0] + bindcostbreakupact[1]) * Qty;
    } else {
      bindcost = Math.round((sig * bindcostbreakup[0] + bindcostbreakup[1]) * Qty);
      bindcostact = Math.round((sig * bindcostbreakupact[0] + bindcostbreakupact[1]) * Qty);
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
  
  for (let i = 0; i < costarr.length; i++) {
    if (costarr[i] && costarr[i][3] === process) {
      bindcost[0] = costarr[i][4];
      bindcost[1] = costarr[i][5];
      return bindcost;
    }
    if (costarr[i] && costarr[i][3] === "") {
      return bindcost;
    }
  }
  return bindcost;
}

function getbindcostact(costarr, process) {
  const bindcost = [];
  bindcost[0] = 0;
  bindcost[1] = 0;
  
  for (let i = 17; i < costarr.length; i++) {
    if (costarr[i] && costarr[i][3] === process) {
      bindcost[0] = costarr[i][4];
      bindcost[1] = costarr[i][5];
      return bindcost;
    }
    if (costarr[i] && costarr[i][3] === "") {
      return bindcost;
    }
  }
  return bindcost;
}

/**
 * Helper function to convert string to 2D array
 */
function convertStringToArray(inputString) {
  // Split the input string by '$' delimiter
  const elements = inputString.split('$');

  // Map each element into its own array
  const result = elements.map(element => [element]);

  // Fill the result array with empty arrays if fewer than 6 elements are present
  while (result.length < 6) {
    result.push([]);
  }

  return result;
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




