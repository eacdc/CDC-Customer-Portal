var bufferL = 10;
var bufferW =20;

function Main(input) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();  
  var mastersheet=ss.getSheetByName("Master");
  var databaseSheet = ss.getSheetByName("DataBase");

  var masterTable = mastersheet.getRange(1,1,45,52).getValues(); 
  

  var len = input.len;
  var brd = input.brd;
  var height = input.height;
  var qty = Number(input.qty);
  var paperTypeTopOrInner = String(input.matin);  
  var gsmTopOrInner = Number(input.gsmTop);
  var corrLayerInn = Number(input.corrLayIn);
  var productType = String(input.ptype);
  var glue = getTuckValue(corrLayerInn,brd,height)[1];
  var tuck = getTuckValue(corrLayerInn,brd,height)[0];
  var orderSz = (((2*len+2*brd+glue)*(height+2*brd+tuck))*gsmTopOrInner/(1000*1000*1000))*qty;
  var boxPerOuter = productType === "Top Bottom" ? 1 : 10;
  var lenOuter =brd*boxPerOuter+10+1*boxPerOuter;
  var brdOuter = len+5;
  var heightOuter = height+7;
  var frontColIn = Number(input.frontColIn);
  var backColIn = Number(input.backColIn);
  var frontSurIn = String(input.frontSurIn).toUpperCase();
  var backSurIn = String(input.backSurIn).toUpperCase();
  var kraftGsmIn = Number(input.kraftGsmIn);
  var windowIn = Number(input.windowIn);
  var foilIn = Number(input.fooinIn);

  var paperTypeBotOrOuter = String(input.matBot);
  var gsmBot = Number(input.gsmBot);
  var frontColBot = Number(input.frontColBot);
  var frontSurBot = String(input.frontSur);

  var pricePerKGIn = XLOOKUP(paperTypeTopOrInner,masterTable,1,2,78,0);
  var kraftRate = 30;
  var pricePerKGOut = XLOOKUP(paperTypeBotOrOuter,masterTable,1,2,78,0);
  var delCost = 2;
  var overhead = 0.1;

  var inputData = [len,brd,height,qty,paperTypeTopOrInner,gsmTopOrInner,corrLayerInn,productType,orderSz,boxPerOuter,lenOuter,brdOuter,heightOuter,frontColIn,backColIn,frontSurIn,backSurIn,kraftGsmIn,windowIn,foilIn,paperTypeBotOrOuter,gsmBot,frontColBot,frontSurBot,pricePerKGIn,kraftRate,pricePerKGOut,delCost,overhead];

  // Logger.log([orderSz,productType,paperTypeTopOrInner]);

  
  if(productType==="RTI"){ 
    // Logger.log(orderSz);
    if(orderSz<1000 && paperTypeTopOrInner.indexOf("GB")!==-1){
      var bestLen = selectStdSheet(masterTable,len,brd,height,glue,tuck)[0];
      var bestBrd = selectStdSheet(masterTable,len,brd,height,glue,tuck)[1];
      var maxUps = selectStdSheet(masterTable,len,brd,height,glue,tuck)[2];
      // Logger.log("std");

    }else{
      var mcWidth= calMachineSz(len,brd,height,tuck,glue,qty,productType)[0];
      var mcheight= calMachineSz(len,brd,height,tuck,glue,qty,productType)[1];
      var bestLen = getSheetSzRTI(mcWidth,mcheight,len,brd,height,glue,tuck)[0];
      var bestBrd = getSheetSzRTI(mcWidth,mcheight,len,brd,height,glue,tuck)[1];
      var maxUps = getSheetSzRTI(mcWidth,mcheight,len,brd,height,glue,tuck)[2]; 

      // Logger.log([mcWidth,mcheight])
    }
      
  }else if(productType==="Top Bottom"){
    var mcWidth= calMachineSz(len,brd,height,tuck,glue,qty,productType)[0];
    var mcheight= calMachineSz(len,brd,height,tuck,glue,qty,productType)[1];
    var bestLen = getSheetSzTB(mcWidth,mcheight,len,brd,height,glue,tuck)[0];
    var bestBrd = getSheetSzTB(mcWidth,mcheight,len,brd,height,glue,tuck)[1];
    var maxUps = getSheetSzTB(mcWidth,mcheight,len,brd,height,glue,tuck)[2]; 
    // Logger.log([mcWidth,mcheight,len,brd,height,glue,tuck]);
  }else if(productType==="Universal"){
    var mcWidth= calMachineSz(len,brd,height,tuck,glue,qty,productType)[0];
    var mcheight= calMachineSz(len,brd,height,tuck,glue,qty,productType)[1];
    var bestLen = getSheetSzUn(mcWidth,mcheight,len,brd,height,glue,tuck)[0];
    var bestBrd = getSheetSzUn(mcWidth,mcheight,len,brd,height,glue,tuck)[1];
    var maxUps = getSheetSzUn(mcWidth,mcheight,len,brd,height,glue,tuck)[2];
  }else if(productType==="Haugland" || productType==="Crash Lock"){
    var mcWidth= calMachineSz(len,brd,height,tuck,glue,qty,productType)[0];
    var mcheight= calMachineSz(len,brd,height,tuck,glue,qty,productType)[1];
    var bestLen = getSheetSzCL_HL(mcWidth,mcheight,len,brd,height,glue,tuck)[0];
    var bestBrd = getSheetSzCL_HL(mcWidth,mcheight,len,brd,height,glue,tuck)[1];
    var maxUps = getSheetSzCL_HL(mcWidth,mcheight,len,brd,height,glue,tuck)[2];

  }else if(productType==="Cake Box"){
    var mcWidth= calMachineSz(len,brd,height,tuck,glue,qty,productType)[0];
    var mcheight= calMachineSz(len,brd,height,tuck,glue,qty,productType)[1];
    var bestLen = getSheetSzCB(mcWidth,mcheight,len,brd,height,glue,tuck)[0];
    var bestBrd = getSheetSzCB(mcWidth,mcheight,len,brd,height,glue,tuck)[1];
    var maxUps = getSheetSzCB(mcWidth,mcheight,len,brd,height,glue,tuck)[2];
  }
  var mcWidthOuter = 1020;
  var mcheightOuter = 730;

  if(productType!=="Top Bottom"){
    if(Math.ceil((2*heightOuter+brdOuter+20+16+brdOuter*1.4)/5)*5 <= mcheightOuter && Math.ceil(((2*lenOuter+2*brdOuter)+30)/5)*5 <=mcWidthOuter){
      var maxUpsOuter = 2;
      var bestLenOuter = Math.ceil(((2*lenOuter+2*brdOuter)+30)/5)*5;
      var bestBrdOuter = Math.ceil((heightOuter*maxUpsOuter+brdOuter+20+16+brdOuter*.7*maxUpsOuter)/5)*5;
    }else if(Math.ceil((2*heightOuter+brdOuter+20+16+brdOuter*1.4)/5)*5 > mcheightOuter && Math.ceil(((2*lenOuter+2*brdOuter)+30)/5)*5 <=mcWidthOuter){
      var maxUpsOuter = 1;
      var bestLenOuter = Math.ceil(((2*lenOuter+2*brdOuter)+30)/5)*5;
      var bestBrdOuter = Math.ceil((heightOuter*maxUpsOuter+brdOuter+20+16+brdOuter*.7*maxUpsOuter)/5)*5;
    }else if(Math.ceil((2*heightOuter+brdOuter+20+16+brdOuter*1.4)/5)*5 <= mcheightOuter && Math.ceil(((2*lenOuter+2*brdOuter)+30)/5)*5 >mcWidthOuter){
      var maxUpsOuter = 1;
      var bestLenOuter = Math.ceil(((lenOuter+brdOuter)+15)/5)*5;
      var bestBrdOuter = Math.ceil((heightOuter*2+brdOuter+20+16+brdOuter*.7*2)/5)*5;
    }else if(Math.ceil((2*heightOuter+brdOuter+20+16+brdOuter*1.4)/5)*5 > mcheightOuter && Math.ceil(((2*lenOuter+2*brdOuter)+30)/5)*5 >mcWidthOuter){
      var maxUpsOuter = 0.5;
      var bestLenOuter = Math.ceil(((lenOuter+brdOuter)+15)/5)*5;
      var bestBrdOuter = Math.ceil((heightOuter+brdOuter+20+16+brdOuter*.7)/5)*5;
    }
  }else{
    var maxUpsOuter = maxUps;
    var bestLenOuter = bestLen;
    var bestBrdOuter = bestBrd;
  }

    var calculateTable1 = [[],[]];

    calculateTable1[0][2]=maxUps;
    calculateTable1[0][0]=bestLen;
    calculateTable1[0][1]=bestBrd;
    calculateTable1[1][2]= maxUpsOuter;
    calculateTable1[1][0]= bestLenOuter;
    calculateTable1[1][1]= bestBrdOuter;

    // Logger.log("check: "+"{"+[masterTable[5][1],masterTable[7][1],masterTable[6][1]]+"}");

    var wasteIn = wastage(qty,maxUps,masterTable);
    var paperweightIn = paperWt(qty,maxUps,bestLen,bestBrd,gsmTopOrInner,wasteIn);
    var kraftWeightIn = kraftWt(bestBrd,bestLen,maxUps,corrLayerInn,kraftGsmIn,qty);
    var paperPerUnitIn = paperPerUnit(paperweightIn,pricePerKGIn,qty);
    var ctpPerUnitIn = ctpPerUnit(frontColIn,backColIn,qty,masterTable[0][25]);
    var printPerunitIn = printPerunit(frontSurIn,backSurIn,frontColIn,backColIn,qty,maxUps,masterTable[3][1],masterTable[0][43]);
    var surfacePerUnitIn = surfacePerUnit(bestBrd,bestLen,maxUps,frontSurIn,backSurIn,masterTable,2);
    var kraftPerunitIn = kraftPerunit(bestBrd,bestLen,maxUps,corrLayerInn,kraftGsmIn,kraftRate);
    var diceCostIn = diceCost(foilIn,masterTable[2][17],masterTable[1][17],qty);
    var window_foil_Cost_In = window_foil_Cost(windowIn,foilIn,masterTable);
    var punch_paste_In = punch_paste(maxUps,masterTable[5][1],kraftGsmIn,bestBrd,bestLen,masterTable[7][1],masterTable[6][1]);
    var pack_del_In = pack_del(paperweightIn,kraftWeightIn,delCost,masterTable[8][1],qty);
    var Corr_conv_In = Corr_conv(kraftWeightIn,masterTable[12][1],qty);

    var varCostIn = paperPerUnit(paperweightIn,XLOOKUP(paperTypeTopOrInner,masterTable,1,4,78,0),qty)+ctpPerUnit(frontColIn,backColIn,qty,masterTable[0][25])+printPerunitActual(frontSurIn,backSurIn,frontColIn,backColIn,maxUps,masterTable[3][3])+surfacePerUnit(bestBrd,bestLen,maxUps,frontSurIn,backSurIn,masterTable,4)+kraftPerunit(bestBrd,bestLen,maxUps,corrLayerInn,kraftGsmIn,kraftRate)+diceCost(foilIn,masterTable[2][17],masterTable[1][17],qty)+window_foil_Cost(windowIn,foilIn,masterTable)+punch_paste(maxUps,masterTable[5][3],kraftGsmIn,bestBrd,bestLen,masterTable[7][3],masterTable[6][3])+pack_del(paperweightIn,kraftWeightIn,delCost,masterTable[8][3],qty)+Corr_conv(kraftWeightIn,masterTable[12][3],qty);

    // Logger.log([paperPerUnit(paperweightIn,XLOOKUP(paperTypeTopOrInner,masterTable,1,4,78,0),qty),ctpPerUnit(frontColIn,backColIn,qty,masterTable[0][25]),printPerunitActual(frontSurIn,backSurIn,frontColIn,backColIn,maxUps,masterTable[3][3]),surfacePerUnit(bestBrd,bestLen,maxUps,frontSurIn,backSurIn,masterTable,4),kraftPerunit(bestBrd,bestLen,maxUps,corrLayerInn,kraftGsmIn,kraftRate),diceCost(foilIn,masterTable[2][17],masterTable[1][17],qty),window_foil_Cost(windowIn,foilIn,masterTable),punch_paste(maxUps,masterTable[5][3],kraftGsmIn,bestBrd,bestLen,masterTable[7][3],masterTable[6][3]),pack_del(paperweightIn,kraftWeightIn,delCost,masterTable[8][3],qty),Corr_conv(kraftWeightIn,masterTable[12][3],qty)]);


    var price_per_unit_In = (paperPerUnitIn+ctpPerUnitIn+printPerunitIn+surfacePerUnitIn+kraftPerunitIn+diceCostIn+window_foil_Cost_In+punch_paste_In+pack_del_In+Corr_conv_In)*(1+overhead);
    var gpPerIn = (price_per_unit_In/varCostIn)-1;
    var gpPerImpIn = (price_per_unit_In-varCostIn)*maxUps;


    var wasteOut = wastage(qty/boxPerOuter,maxUpsOuter,masterTable);
    var paperweightOut = paperWt(qty/boxPerOuter,maxUpsOuter,bestLenOuter,bestBrdOuter,gsmBot ,wasteOut);
    var kraftWeightOut = kraftWt(bestBrdOuter,bestLenOuter,maxUpsOuter,0,0,qty/boxPerOuter);
    var paperPerUnitOut = paperPerUnit(paperweightOut,pricePerKGOut,qty/boxPerOuter);
    var ctpPerUnitOut = ctpPerUnit(frontColBot,"",qty/boxPerOuter,masterTable[0][25]);
    var printPerunitOut = printPerunit(frontSurBot,"",frontColBot,0,qty/boxPerOuter,maxUpsOuter,masterTable[3][1],masterTable[0][44]);
    var surfacePerUnitOut = surfacePerUnit(bestBrdOuter,bestLenOuter,maxUpsOuter,frontSurBot,"",masterTable,2);
    var kraftPerunitOut = kraftPerunit(bestBrdOuter,bestLenOuter,maxUpsOuter,0,0,kraftRate);
    var diceCostOut = diceCostIn;
    var window_foil_Cost_Out = 0;
    var punch_paste_Out = punch_paste(maxUpsOuter,masterTable[5][1],0,bestBrdOuter,bestLenOuter,masterTable[7][1],masterTable[6][1]);
    var pack_del_Out = pack_del(paperweightOut,kraftWeightOut,delCost,masterTable[8][1],qty/boxPerOuter);
    var Corr_conv_Out = Corr_conv(kraftWeightOut,masterTable[12][1],qty/boxPerOuter);

    var varCostOut = paperPerUnit(paperweightOut,XLOOKUP(paperTypeBotOrOuter,masterTable,1,4,78,0),qty)+ctpPerUnit(frontColBot,"",qty,masterTable[0][25])+printPerunitActual(frontSurBot,"",frontColBot,0,maxUpsOuter,masterTable[3][3])+surfacePerUnit(bestBrdOuter,bestLenOuter,maxUpsOuter,frontSurBot,"",masterTable,4)+kraftPerunit(bestBrdOuter,bestLenOuter,maxUpsOuter,0,0,kraftRate)+diceCost(0,masterTable[2][17],masterTable[1][17],qty)+window_foil_Cost(0,0,masterTable)+punch_paste(maxUpsOuter,masterTable[5][3],kraftGsmIn,bestBrdOuter,bestLenOuter,masterTable[7][3],masterTable[6][3])+pack_del(paperweightOut,kraftWeightOut,delCost,masterTable[8][3],qty)+Corr_conv(kraftWeightOut,masterTable[12][3],qty);

    var price_per_unit_Out = (paperPerUnitOut+ctpPerUnitOut+printPerunitOut+surfacePerUnitOut+kraftPerunitOut+diceCostOut+window_foil_Cost_Out+punch_paste_Out+pack_del_Out+Corr_conv_Out)*(1+overhead);
    var gpPerOut = (price_per_unit_Out/varCostOut)-1;
    var gpPerImpOut = (price_per_unit_Out-varCostOut)*maxUpsOuter;


  var formattedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var final_output_data = [flatten([formattedDate,inputData,calculateTable1,[wasteIn,paperweightIn,kraftWeightIn,paperPerUnitIn,ctpPerUnitIn,printPerunitIn,surfacePerUnitIn,kraftPerunitIn,diceCostIn,window_foil_Cost_In,punch_paste_In,pack_del_In,Corr_conv_In],[wasteOut,paperweightOut,kraftWeightOut,paperPerUnitOut,ctpPerUnitOut,printPerunitOut,surfacePerUnitOut,kraftPerunitOut,diceCostOut,window_foil_Cost_Out,punch_paste_Out,pack_del_Out,Corr_conv_Out],[varCostIn,gpPerIn,gpPerImpIn,varCostOut,gpPerOut,gpPerImpOut],[price_per_unit_In,(productType==="Top Bottom"?price_per_unit_Out:0)]])];

    
  databaseSheet.getRange(databaseSheet.getLastRow()+1,1,1,final_output_data[0].length).setValues(final_output_data);

  Logger.log([calculateTable1,[wasteIn,paperweightIn,kraftWeightIn,paperPerUnitIn,ctpPerUnitIn,printPerunitIn,surfacePerUnitIn,kraftPerunitIn,diceCostIn,window_foil_Cost_In,punch_paste_In,pack_del_In,Corr_conv_In],[wasteOut,paperweightOut,kraftWeightOut,paperPerUnitOut,ctpPerUnitOut,printPerunitOut,surfacePerUnitOut,kraftPerunitOut,diceCostOut,window_foil_Cost_Out,punch_paste_Out,pack_del_Out,Corr_conv_Out],[price_per_unit_Out,price_per_unit_In],[foilIn,windowIn]]);

  logThis([foilIn,windowIn])

  return ([calculateTable1,[wasteIn,paperweightIn,kraftWeightIn,paperPerUnitIn,ctpPerUnitIn,printPerunitIn,surfacePerUnitIn,kraftPerunitIn,diceCostIn,window_foil_Cost_In,punch_paste_In,pack_del_In,Corr_conv_In],[wasteOut,paperweightOut,kraftWeightOut,paperPerUnitOut,ctpPerUnitOut,printPerunitOut,surfacePerUnitOut,kraftPerunitOut,diceCostOut,window_foil_Cost_Out,punch_paste_Out,pack_del_Out,Corr_conv_Out],[price_per_unit_Out,price_per_unit_In],[foilIn,windowIn]]);

}




function selectStdSheet(stdArray,len,brd,height,glue,tuck){
  var minAreaReq = 15000000;
  var bestSzArray =[];

  for(i=0;i<stdArray.length;i++){
    var xh= Math.floor((stdArray[i][1]-bufferL)/(2*brd+2*len+glue));
    var yh= Math.floor((stdArray[i][0]-brd-tuck-bufferW)/(height+brd+tuck));
    var hUps= xh*yh;
    var xv=Math.floor((stdArray[i][1]-brd-tuck-bufferL)/(height+brd+tuck));
    var yv=Math.floor((stdArray[i][0]-bufferW)/(2*brd+2*len+glue));
    var vUps= xv*yv;

    var maxUps = Math.max(hUps,vUps);
    var areaPerUps = (stdArray[i][0]*stdArray[i][1])/maxUps;
    // Logger.log(areaPerUps);

    if(areaPerUps<minAreaReq){
      minAreaReq = areaPerUps;
      bestSzArray[0] = stdArray[i][1];
      bestSzArray[1] = stdArray[i][0];
      bestSzArray[2] = maxUps;
    }
  }
  // Logger.log(minAreaReq);
  return bestSzArray;
}

function getSheetSzRTI(mcWidth,mcheight,len,brd,height,glue,tuck){
  var bestSzArray =[];

  var xv= Math.floor((mcWidth-bufferW)/(2*brd+2*len+glue));
  var yv= Math.floor((mcheight-brd-tuck-bufferL)/(height+brd+tuck));
  var vUps= xv*yv;
  var xh=Math.floor((mcWidth-brd-tuck-bufferW)/(height+brd+tuck));
  var yh=Math.floor((mcheight-bufferL)/(2*brd+2*len+glue));
  var hUps= xh*yh;

  var maxUps = Math.max(hUps,vUps);
  
  bestSzArray[0] = vUps>=hUps ? (Math.round((((2*brd+2*len+glue)*xv)+bufferL)/5))*5 : (Math.round((((height+brd+tuck)*xh)+bufferL+brd+tuck)/5))*5;
  bestSzArray[1] = vUps>=hUps ? (Math.round((((height+brd+tuck)*yv)+bufferW+brd+tuck)/5))*5 : (Math.round((((2*brd+2*len+glue)*yh)+bufferW)/5))*5;
  bestSzArray[2] = maxUps;

  // Logger.log(((Math.round(((tuck+brd+height)*xh)+brd+tuck+bufferL))/5));

  return bestSzArray;
}


function calMachineSz(len,brd,height,tuck,glue,qty,productType){

  if(productType==="Top Bottom"){
    var mcWidth = 1020;
    var mcheight = 720;
  }else{

    if(productType=== "RTI"){
      var surfaceSz = (2*brd+2*len+glue)*(height+brd+tuck)*qty; 
    }else if(productType==="Universal"){
      var surfaceSz = (2*brd+2*len+tuck)*(height+brd*1.5)*qty;
    }else if(productType==="Crash Lock" || productType==="Haugland"){
      var surfaceSz = (4*brd+tuck)*(height+brd*0.7+brd+tuck)*qty;
    }else if(productType==="Cake Box"){
      var surfaceSz = (2*brd+tuck+2*height)*(len*height*1.47)*qty;
    }

    if(surfaceSz>=3000000000){
      var mcWidth = 1020;
      var mcheight = 720;
    }else if(surfaceSz>=2000000000){
      var mcWidth = 980;
      var mcheight = 650;
    }else if(surfaceSz>=1500000000){
      var mcWidth = 920;
      var mcheight = 630;
    }else{
      var mcWidth = 800;
      var mcheight = 560;
    }
  } 
  // Logger.log("surface "+mcWidth);
  var machineArray = [];
  machineArray[0]=mcWidth;
  machineArray[1]=mcheight;

  return machineArray;
}

function getSheetSzTB(mcWidth,mcheight,len,brd,height,glue,tuck){
  var bestSzArray =[];

  var xh= Math.floor((mcWidth-8)/(height+4*brd+2*tuck));
  var yh= Math.floor((mcheight-17)/(2*tuck+4*brd+len));
  var hUps= xh*yh;
  var xv=Math.floor((mcWidth-8)/(2*tuck+4*brd+len));
  var yv=Math.floor((mcheight-17)/(height+4*brd+2*tuck));
  var vUps= xv*yv;

  var maxUps = Math.max(hUps,vUps);
  // Logger.log([xh,yh,xv,yv]);
  
  bestSzArray[0] = vUps>=hUps ? (Math.round((((4*(brd-1)+len+2*tuck)*xv)+8)/5))*5 : (Math.round((((height+4*(brd-1)+2*tuck)*xh)+8)/5))*5;
  bestSzArray[1] = vUps>=hUps ? (Math.round((((height+4*brd+2*tuck)*yv)+17)/5))*5 : (Math.round((((2*tuck+4*brd+len)*yh)+17)/5))*5;
  bestSzArray[2] = maxUps;

  // Logger.log(((Math.round(((tuck+brd+height)*xh)+brd+tuck+bufferL))/5));

  return bestSzArray;
}

function getSheetSzUn(mcWidth,mcheight,len,brd,height,glue,tuck){
  var bestSzArray =[];

  var xv= Math.floor((mcWidth-8)/(len*2+brd*2+tuck));
  var yv= Math.floor((mcheight-17)/(height+1.5*brd));
  var vUps= xv*yv;
  var xh=Math.floor((mcWidth-8)/(height+1.5*brd));
  var yh=Math.floor((mcheight-17)/(len*2+brd*2+tuck));
  var hUps= xh*yh;

  var maxUps = Math.max(hUps,vUps);
  // Logger.log([xh,yh,xv,yv]);
  
  bestSzArray[0] = vUps>=hUps ? (Math.round((((len*2+brd*2+tuck)*xv)+8)/5))*5 : (Math.round(((((height+1.5*brd))*xh)+8)/5))*5;
  bestSzArray[1] = vUps>=hUps ? (Math.round((((height+1.5*brd)*yv)+17)/5))*5 : (Math.round((((len*2+brd*2+tuck)*yh)+17)/5))*5;
  bestSzArray[2] = maxUps;

  // Logger.log(((Math.round(((tuck+brd+height)*xh)+brd+tuck+bufferL))/5));

  return bestSzArray;
}

function getSheetSzCL_HL(mcWidth,mcheight,len,brd,height,glue,tuck){
  var bestSzArray =[];

  var xh= Math.floor(Math.floor((mcWidth-8)/(height+0.7*brd+(brd+tuck)/2))/2)*2;
  var yh= Math.floor((mcheight-17)/((len+brd)*2+glue));
  var hUps= xh*yh;
  var xv=Math.floor((mcWidth-8)/((len+brd)*2+glue));
  var yv=Math.floor(Math.floor((mcheight-17)/(height+0.7*brd+(brd+tuck)/2))/2)*2;
  var vUps= xv*yv;

  var maxUps = Math.max(hUps,vUps);
  // Logger.log([xh,yh,xv,yv,(height+0.7*brd+(brd+tuck)/2),((len+brd)*2+glue)]);
  
  bestSzArray[0] = hUps>=vUps ? (Math.round((((height+0.7*brd+(brd+tuck)/2)*xh)+8)/5))*5 : (Math.round(((((len+brd)*2+glue)*xv)+8)/5))*5;
  bestSzArray[1] = hUps>=vUps ? (Math.round(((((len+brd)*2+glue)*yh)+17)/5))*5 : (Math.round((((height+0.7*brd+(brd+tuck)/2)*yv)+17)/5))*5;
  bestSzArray[2] = maxUps;

  // Logger.log(((Math.round(((tuck+brd+height)*xh)+brd+tuck+bufferL))/5));

  return bestSzArray;
}

function getSheetSzCB(mcWidth,mcheight,len,brd,height,glue,tuck){
  var bestSzArray =[];

  var xh= Math.floor((mcWidth-8)/(brd*2+height*2+tuck));
  var yh= Math.floor((mcheight-17)/(len+1.47*height));
  var hUps= xh*yh;
  var xv=Math.floor((mcWidth-8)/(len+1.47*height));
  var yv=Math.floor((mcheight-17)/(brd*2+height*2+tuck));
  var vUps= xv*yv;

  var maxUps = Math.max(hUps,vUps);
  // Logger.log([xh,yh,xv,yv,(height+0.7*brd+(brd+tuck)/2),(brd*4+tuck)]);
  
  bestSzArray[0] = hUps>=vUps ? (Math.round((((2*brd+2*height+tuck)*xh)+8)/5))*5 : (Math.round((((len+1.47*height)*xv)+8)/5))*5;
  bestSzArray[1] = hUps>=vUps ? (Math.round((((len+1.47*height)*yh)+17)/5))*5 : (Math.round((((2*brd+2*height+tuck)*yv)+17)/5))*5;
  bestSzArray[2] = maxUps;

  // Logger.log(((Math.round(((tuck+brd+height)*xh)+brd+tuck+bufferL))/5));

  // Logger.log("bestarray"+bestSzArray);

  return bestSzArray;
}

function getTuckValue(corrLayer,brd,height){
  var ss = SpreadsheetApp.getActiveSpreadsheet();  
  var mastersheet=ss.getSheetByName("Master");
  var masterTable=mastersheet.getRange(2,37,3,5).getValues();
  Logger.log(masterTable);
  var tuck=12;
  var glue=10;
  var tuck_glue_array=[];
  if(corrLayer!=="" && corrLayer!==0){
    tuck=20;
    glue=15; 
    Logger.log(corrLayer);
  }else{
    for(i=0;i<masterTable.length;i++){
      if(brd>=masterTable[i][0]){
        glue=masterTable[i][1];
      }
      if(height>=masterTable[i][3]){
        tuck=masterTable[i][4];
      }
    }

  }
  tuck_glue_array[0]=tuck;
  tuck_glue_array[1]=glue;
  // Logger.log(tuck_glue_array);
  return(tuck_glue_array);
}


function test4(){
  var quoteinfo = {
        len:120,
        brd:50,
        height:75,
        ptype:'Top Bottom',
        qty:15000,
        matin:'FBB',
        gsmTop:300,
        frontColIn:4,
        backColIn:0,
        frontSurIn:'DRIP OFF COATING',
        backSurIn:'None',
        corrLayIn:0,
        kraftGsmIn:0,
        windowIn:0,
        fooinIn:4,

        matBot:'FBB',
        gsmBot:300,
        frontColBot:4,
        frontSur:'DRIP OFF COATING',
    }
  Logger.log(Main(quoteinfo))
}

function flatten(arr) {
  return arr.reduce(function(flat, toFlatten) {
    return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
  }, []);
}