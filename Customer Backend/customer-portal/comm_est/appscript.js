function calCulate(quoteinfo) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();  
    var mainsheet=ss.getSheetByName("Calculate_1");
    var opsSheet = ss.getSheetByName("Options");
    mainsheet.getRange("F27").clearContent();
    
    var lastRow = 10;
    var lastCol = 17;
    var inputStartRow=5;
    var mainTable = mainsheet.getRange(2,1,1,lastCol).getValues();
    var inputTable = mainsheet.getRange(inputStartRow,1,(lastRow-inputStartRow+1),17).getValues();
    var costarr=opsSheet.getRange(2,1,opsSheet.getLastRow(),15).getValues();
  
    // Logger.log(costarr);
    var overHeadPerOps = opsSheet.getRange("Z1").getValue();
    // var overheadPercent = mainsheet.getRange("F27").getValue();
    // Logger.log(overheadPercent);
    // var forcePaper = mainTable;
    // mainsheet.getRange(15,1,7,8).clearContent();
    // mainsheet.getRange("E27:E28").clearContent();  
    // mainsheet.getRange("A30").clearContent();
    var displayTable = mainsheet.getRange(15,1,7,8).getValues();
    var opsTable=opsSheet.getRange(2,16,opsSheet.getLastRow(),2).getValues();
    var opsTable1=opsSheet.getRange(1,1,16,29).getValues();
    var opsTable2=opsSheet.getRange(17,1,16,29).getValues();
    // Logger.log(quoteinfo)
    var compCol = convertStringToArray(quoteinfo.components);
    var gsmCol = convertStringToArray(quoteinfo.gsm);
    var textPagesCol = convertStringToArray(quoteinfo.page_number);
    var paperTypeCol = convertStringToArray(quoteinfo.material);
    var front_print_col= convertStringToArray(quoteinfo.front_print)
    var back_print_col= convertStringToArray(quoteinfo.back_print)
    var front_surface_col = convertStringToArray(quoteinfo.front_surface)
    var back_surface_col = convertStringToArray(quoteinfo.back_surface)
  
    // Logger.log([compCol,gsmCol,textPagesCol,paperTypeCol,front_print_col,back_print_col,front_surface_col,back,BkBrd,Bklen,])
  
    var spineStr = '';
    var maxUpsArray=[];
    if(compCol[0]===""){
      var ui = SpreadsheetApp.getUi();
      ui.alert("Alert!", "Please insert mandatory information!", ui.ButtonSet.OK);
      return;
    }else{
      for(i=0;i<(lastRow-inputStartRow+1);i++){
        var comp = compCol[i][0];
        var complexity = "Simple";
        if(comp !=null){
          Logger.log(comp)
          var bindingStyle = quoteinfo.binding_style;
          var Bklen = getStdLenBrd(Number(quoteinfo.len),bindingStyle);
          var BkBrd = getStdLenBrd(Number(quoteinfo.brd),bindingStyle);
  
          // Logger.log(Bklen+":"+BkBrd);
          var noOfPages =Number(textPagesCol[i][0]);
          // var paperPrice =XLOOKUP(paperTypeCol[i][0],costarr.slice(0,13),1,2);
          var noOfTitles = quoteinfo.no_of_titles !=="" ? Number(quoteinfo.no_of_titles): 1;
          var Qty = Number(quoteinfo.Qty)*noOfTitles;
          var gsm = Number(gsmCol[i][0]);
          var paperType = paperTypeCol[i][0];
          var front_print = Number(front_print_col[i][0]);
          var back_print = back_print_col[i][0]===""?0:Number(back_print_col[i][0]);
          var front_surface = front_surface_col[i][0];
          var back_surface= back_surface_col[i][0];
  
          var webOrSheet = paperType === "Bible Paper"? "Web" : paperType!==""? "Sheet" : "Sheet";
                
          
          var forcePaper = "Default";
          var indexNo = inputTable[i][0];
  
          Logger.log([comp,noOfPages,noOfTitles,Qty,gsm,paperType,front_print,back_print,front_surface,Bklen,BkBrd,quoteinfo.len,quoteinfo.brd])
          
          // Logger.log(inputTable);
  
          
          //--------------------Text Type Component---------------------------------//
          if((comp==="Text" || comp==="End Paper" || comp==="Text - 2" || comp==="Sticker Paper") && comp !== "") {
            var orderSize = (Bklen/1000)*(BkBrd/1000)*(gsm/1000)*Qty*(noOfPages/2);
              
            if(((((paperType==="FBB" || paperType==="CBB") && orderSize>=1500) || (paperType.indexOf("Maplitho") !== -1 && orderSize >=3000)|| ((paperType==="Gloss Art" ||  paperType==="Matt Art") && gsm >= 110 && orderSize >= 6000) || ((paperType==="Gloss Art" ||  paperType==="Matt Art") && gsm < 110 && orderSize >= 10000)) && forcePaper==="Default") || forcePaper ==="Special" || webOrSheet==="Web" || (comp==="Sticker Paper" && orderSize>=1000)){
              if(webOrSheet==="Sheet"){
                if (Qty*noOfPages > 4500000) {
                  var machineWidth = comp==="Sticker Paper"? 510: 720;
                  var machineLen = comp==="Sticker Paper"? 760: 1020;
                } 
  
                else {
                  var machineWidth = comp==="Sticker Paper"? 510: 640;
                  var machineLen = comp==="Sticker Paper"? 760: 920;
                }
              }else{
                var machineWidth = comp==="Sticker Paper"? 510: 578;
                var machineLen = comp==="Sticker Paper"? 760: 890; 
              }
  
              Logger.log([machineLen,machineWidth])
              
              var xv=Math.floor((machineWidth-10)/(Bklen+lenbuffer));
              var yv=Math.floor((machineLen-10)/(2*(BkBrd+widbuffer)));
              var vUps=xv*yv*2;
              var xh=Math.floor((machineWidth-10)/(2*(BkBrd+widbuffer)));
              var yh=Math.floor((machineLen-10)/(Bklen+lenbuffer));
              var hUps=xh*yh*2;
              var maxUps=Math.max(stdUps1(vUps,complexity),stdUps1(hUps,complexity));
  
              
  
              var SheetLenInit=(Math.min((Bklen+lenbuffer),(BkBrd+widbuffer)))*(Math.max(calculateXY(maxUps)[0],calculateXY(maxUps)[1]));
              var SheetWidInit=(Math.max((Bklen+lenbuffer),(BkBrd+widbuffer)))*(Math.min(calculateXY(maxUps)[0],calculateXY(maxUps)[1]));
              
              SheetLenInit=SheetLenInit+((SheetLenInit<SheetWidInit)?20:10);
              SheetWidInit=SheetWidInit+((SheetLenInit<SheetWidInit)?10:20);
  
              var SheetLen=webOrSheet==="Web"? multiplierFive(Math.max(SheetLenInit,SheetWidInit)-11): multiplierFive(Math.max(SheetLenInit,SheetWidInit));
              var SheetWid = webOrSheet==="Web"?multiplierFive(webSizeConv((Math.min(SheetWidInit,SheetLenInit)-9))):multiplierFive(Math.min(SheetWidInit,SheetLenInit));
              
              var sheetWaistepercent= 1-(Bklen*BkBrd*maxUps)/(SheetLen*SheetWid);
              var paperSzType = "Special";
  
            }else{
              // var stdLen = 0;
              // var stdBrd = 0;
              var sheetWaistepercent = 1;
              for(j=0;j<opsTable.length;j++){
  
                if(opsTable[j][0] !== "" && calculateWaiste((comp==="Sticker Paper"? 760: opsTable[j][1]),(comp==="Sticker Paper"? 510: opsTable[j][0]),Bklen,BkBrd,complexity)[0]< sheetWaistepercent){
                  var SheetLen=opsTable[j][1];
                  var SheetWid =opsTable[j][0];
                  var maxUps = calculateWaiste((comp==="Sticker Paper"? 760: opsTable[j][1]),(comp==="Sticker Paper"? 510: opsTable[j][0]),Bklen,BkBrd,complexity)[1];
                  var paperSzType = "Standard";
                  sheetWaistepercent = calculateWaiste((comp==="Sticker Paper"? 760: opsTable[j][1]),(comp==="Sticker Paper"? 510: opsTable[j][0]),Bklen,BkBrd,complexity)[0];
                }
              }
              
            }
  
  
          }else if(comp==="Cover" ){
            var spine1 = calSpine(bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm);
            var orderSize = (Bklen/1000)*((BkBrd+spine1/2)/1000)*(gsm/1000)*Qty*2;
            var calArray = cal_PLC_Cover(paperType,orderSize,forcePaper,Qty,bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm,Bklen,BkBrd,webOrSheet,opsTable,complexity);
            var SheetLen= calArray[1];
            var SheetWid= calArray[2];
            var maxUps= calArray[0];
            var sheetWaistepercent= calArray[3];
            var paperSzType= calArray[4];
            spineStr = spineStr+"Cover: "+parseFloat(spine1).toFixed(2)+"##";
            // Logger.log("comp: "+ complexity);
  
          }else if(comp==="PLC"){
            var spine2 = calSpine(bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm)
            var orderSize = (Bklen/1000)*((BkBrd+spine2/2)/1000)*(gsm/1000)*Qty*2;
            
            var calArray = cal_PLC_Cover(paperType,orderSize,forcePaper,Qty,bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm,Bklen+50,BkBrd+25,webOrSheet,opsTable,complexity);
            var SheetLen= calArray[1];
            var SheetWid= calArray[2];
            var maxUps= calArray[0];
            var sheetWaistepercent= calArray[3];
            var paperSzType= calArray[4];
            spineStr = spineStr+"PLC: "+parseFloat(spine2).toFixed(2)+"##";
          }else if(comp==="Gate Fold Cover"){
            var spine3 = calSpine(bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm);
            var leftAddPlusRightADD = 0;
            var orderSize = (Bklen/1000)*((BkBrd+spine3/2)/1000)*(gsm/1000)*Qty*2;
            
            var calArray = cal_PLC_Cover(paperType,orderSize,forcePaper,Qty,bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm,Bklen,BkBrd+(leftAddPlusRightADD/2),webOrSheet,opsTable,complexity);
            var SheetLen= calArray[1];
            var SheetWid= calArray[2];
            var maxUps= calArray[0];
            var sheetWaistepercent= calArray[3];
            var paperSzType= calArray[4];
            spineStr = spineStr+"Gate Fold Cover: "+parseFloat(spine3).toFixed(2)+"##";
          }
          else if(comp==="Binding Board"){
              var spine4 = calSpine(bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm);
              var orderSize = (Bklen/1000)*((BkBrd+spine4/2)/1000)*(gsm/1000)*Qty*2;
              spineStr = spineStr+"Binding Board: "+parseFloat(spine4).toFixed(2)+"##";
              if( forcePaper ==="Special" || (orderSize >= 1000 && forcePaper ==="Default")){
                
                if (Qty > 1) {
                  var machineWidth = 720;
                  var machineLen = 1020;
                }else {
                  var machineWidth = 640;
                  var machineLen = 920;
                }
                
                var xv=Math.floor(machineWidth/(Bklen+lenbuffer));
                var yv=Math.floor(machineLen/(2*(BkBrd+spine4/2+widbuffer)));
  
                var vUps=xv*yv*2;
                var xh=Math.floor(machineWidth/(2*(BkBrd+spine4/2+widbuffer)));
                var yh=Math.floor(machineLen/(Bklen+lenbuffer));
                
                var hUps=xh*yh*2;
                var maxUps=Math.max(vUps,hUps);
  
                var xyArray =[];
  
                if(vUps>=hUps){
                  xyArray[0]=xv;
                  xyArray[1]=yv*2;
                }else{
                  xyArray[0]=yh;
                  xyArray[1]=xh*2;
                }
                
                
                var SheetLenInit=(Math.min((Bklen+lenbuffer),((BkBrd+spine4/2+widbuffer))))*(Math.max(xyArray[0],xyArray[1]))+10;
                var SheetWidInit=(Math.max((Bklen+lenbuffer),((BkBrd+spine4/2+lenbuffer))))*(Math.min(xyArray[0],xyArray[1]))+20;
                var SheetLen=webOrSheet==="Web"? multiplierFive(Math.max(SheetLenInit,SheetWidInit)-11): multiplierFive(Math.max(SheetLenInit,SheetWidInit));
                var SheetWid = webOrSheet==="Web"?multiplierFive(webSizeConv((Math.min(SheetWidInit,SheetLenInit)))):multiplierFive(Math.min(SheetWidInit,SheetLenInit));
  
                // Logger.log(SheetWidInit+" sheet");
                
                var sheetWaistepercent= 1-(Bklen*(BkBrd+spine4/2)*maxUps)/(SheetLen*SheetWid);
                var paperSzType = "Special";
  
              }else{
                // var stdLen = 0;
                // var stdBrd = 0;
                
                var SheetLenArray=[1050,910];
                var SheetWidArray =[800,635];
  
                var sheetWaistepercent = 1;
                for(j=0;j<SheetLenArray.length;j++){
  
                  if(calculateWaisteFoamOrBoard(SheetLenArray[j],SheetWidArray[j],Bklen,BkBrd,complexity)[0]< sheetWaistepercent){
                    var SheetLen=SheetLenArray[j];
                    var SheetWid =SheetWidArray[j];
                    var maxUps = calculateWaisteFoamOrBoard(SheetLenArray[j],SheetWidArray[j],Bklen,BkBrd,complexity)[1];
                    var paperSzType = "Standard";
                    sheetWaistepercent = calculateWaisteFoamOrBoard(SheetLenArray[j],SheetWidArray[j],Bklen,BkBrd,complexity)[0];
                  }
                }        
                          
              }
            }    
            else if(comp==="Foam"){
              var spine = 0;            
              var SheetLen=1800;
              var SheetWid =900;
              var maxUps = calculateWaisteFoamOrBoard(SheetLen,SheetWid,Bklen,(BkBrd))[1];
              var paperSzType = "Standard";
              sheetWaistepercent = calculateWaisteFoamOrBoard(SheetLen,SheetWid,Bklen,(BkBrd))[0];             
              
            }  
          var paperWt = comp!=="Foam"? (SheetLen/1000*SheetWid/1000*gsm/1000*noOfPages/maxUps*Qty/noOfTitles)*(1+.07)/2:(noOfPages/maxUps*Qty/noOfTitles*(1.15)/2);
          var paperPrice=XLOOKUP(paperType,opsTable1,2,3,"");
          // Logger.log([SheetLen,SheetWid,noOfPages,maxUps,Qty,noOfTitles])
  
          //*************************************************** */
          var printcost = webOrSheet==="Web"?(noOfPages/maxUps*Math.max(Qty/noOfTitles-3000,0)/2)/1000*(front_print*opsTable1[4][13]+back_print*opsTable1[4][13]):(noOfPages/maxUps*Math.max(Qty/noOfTitles-3000,0)/2)/1000*(XLOOKUP(front_print,opsTable1,12,13,Math.max(opsTable1[1][13],opsTable1[2][13],opsTable1[3][13]))*front_print+XLOOKUP(back_print,opsTable1,12,13,Math.max(opsTable1[1][13],opsTable1[2][13],opsTable1[3][13]))*back_print);
          // Logger.log(XLOOKUP(back_print,opsTable1,12,13,Math.max(opsTable1[1][13],opsTable1[2][13],opsTable1[3][13])))
          
          displayTable[i][1]=comp;
          displayTable[i][2]=SheetLen;
          displayTable[i][3]=SheetWid;
          displayTable[i][4]=maxUps;
          displayTable[i][5]=sheetWaistepercent;
          displayTable[i][6]=paperSzType;
          displayTable[i][0]=indexNo;   
          displayTable[i][7]=paperType; 
          displayTable[i][8]=paperWt;
          displayTable[i][9]=paperPrice;
          displayTable[i][10]=paperPrice*paperWt;
          // Logger.log([paperPrice,paperWt])
          displayTable[i][11]=(XLOOKUP((noOfPages/maxUps/2)-Math.floor(noOfPages/maxUps/2),opsTable1,28,29,1)+Math.floor(noOfPages/maxUps/2))*(front_print+back_print)*opsTable1[5][13];
  
          // Logger.log(front_print+back_print)
      
          displayTable[i][12]=printcost;
          displayTable[i][13]=SheetLen/25.4*SheetWid/25.4/100*noOfPages/maxUps*Qty/noOfTitles/2*XLOOKUP(front_surface,opsTable1,7,8,0)+XLOOKUP(back_surface,opsTable1,7,8,0);
  
                 
  
          // Logger.log([front_surface,XLOOKUP(front_surface,opsTable1,6,7,0)]); 
        }
        maxUpsArray.push(maxUps);  
      }
    }
  
    var bookWt = quoteinfo.len/1000*quoteinfo.brd/1000*(sumProduct(gsmCol.flat(),textPagesCol.flat()))/2000;
    var totalPaperCost = sumColumn(displayTable,10);
    var totalCTPPrint = sumColumn(displayTable,11)+sumColumn(displayTable,12);
    var totalSurfceFinish = sumColumn(displayTable,13);
  
    
  
    var bindcost=calcbindcostNew(bindingStyle,Qty/noOfTitles,costarr,maxUpsArray,compCol,textPagesCol);
  
    Logger.log(displayTable);
    
  
    // Logger.log(bindcost[0]+bindcost[1]+bindcost[2]);
    // var overheadPercent2 = overheadPercent !== ""?overheadPercent: overHeadPerOps;
    // mainsheet.getRange(15,1,displayTable.length,8).setValues(displayTable);
    // mainsheet.getRange("F27").setValue(overHeadPerOps);
    // mainsheet.getRange("E27").setValue(bindcost[0]+((mainTable[0][9]*1.25)+(mainTable[0][11]*1.5))*Qty/noOfTitles+mainTable[0][12]/noOfTitles);
    // mainsheet.getRange("E28").setValue(bindcost[1]+((mainTable[0][9])+(mainTable[0][11]))*Qty/noOfTitles+mainTable[0][12]/noOfTitles);
    
    var overheadPercent3 = 0.15;
    // mainsheet.getRange("F27").setValue(overheadPercent3);
    var overheads = overheadPercent3*(totalPaperCost+totalCTPPrint+totalSurfceFinish+bindcost[0]);
    var packing = bookWt*Qty/noOfTitles*XLOOKUP("Carton",opsTable1,19,20,0);
    var shipping_fob = 3*bookWt*Qty/noOfTitles;
    
    var total = totalCTPPrint+totalSurfceFinish+totalPaperCost+bindcost[0]+overheads+packing+shipping_fob
    
    var price_per_unit = total/(Qty/noOfTitles);
    Logger.log([bookWt,totalCTPPrint,totalPaperCost,totalSurfceFinish,packing,shipping_fob,total,price_per_unit])
    // Logger.log([shipping_fob,packing]) 
    Logger.log(price_per_unit)
    return price_per_unit;
  }

  var lenbuffer=8;
var widbuffer=4;


function extractElements(array2D,startCol,endCol) {
  var result = array2D.map(function(subArray) {
    return subArray.slice(startCol,endCol); // Extract all elements except the last two
  });

  return result;
}

function XLOOKUP(searchValue, searchArray, searchCol, returnCol, ifNotFound = null, matchType = 0) {
  // Ensure searchCol and returnCol are 1-based indices
  searchCol = searchCol - 1;
  returnCol = returnCol - 1;

  let foundValue = ifNotFound;

  // Convert the search array to a 2D array if it isn't already
  if (!Array.isArray(searchArray[0])) {
    searchArray = searchArray.map(value => [value]);
  }

  // Ensure searchArray is a 2D array and validate column indices
  if (searchArray.length === 0 || searchCol < 0 || returnCol < 0 || searchCol >= searchArray[0].length || returnCol >= searchArray[0].length) {
    return ifNotFound;
  }

  let bestMatchIndex = -1;
  let bestMatchValue;

  for (let i = 0; i < searchArray.length; i++) {
    let currentValue = searchArray[i][searchCol];
    // Logger.log([currentValue,searchValue]);
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

  return foundValue;
}

function calculateWaiste(SheetLen,SheetWid,Bklen1,BkBrd1,complexity){
  var xv=Math.floor((SheetWid-12)/(Bklen1+lenbuffer));
  var yv=Math.floor((SheetLen-10)/(2*(BkBrd1+widbuffer)));
  var vUps=xv*yv*2;
  var xh=Math.floor((SheetWid-12)/(2*(BkBrd1+widbuffer)));
  var yh=Math.floor((SheetLen-10)/(Bklen1+lenbuffer));
  var hUps=xh*yh*2;
  var maxUps=stdUps1(Math.max(vUps,hUps),complexity);
  // Logger.log(xv+":"+yv+":"+vUps+":"+xh+":"+yh+":"+hUps+":");  

  var sheetWaistepercent= 1-(Bklen1*BkBrd1*maxUps)/(SheetLen*SheetWid);
  return [sheetWaistepercent,maxUps];
}

function calculateWaisteFoamOrBoard(SheetLen,SheetWid,Bklen1,BkBrd1){
  var xv=Math.floor((SheetWid-20)/(Bklen1+lenbuffer));
  var yv=Math.floor((SheetLen-10)/(2*(BkBrd1+widbuffer)));
  var vUps=xv*yv*2;
  var xh=Math.floor((SheetWid-20)/(2*(BkBrd1+widbuffer)));
  var yh=Math.floor((SheetLen-10)/(Bklen1+lenbuffer));
  var hUps=xh*yh*2;
  var maxUps=Math.max(vUps,hUps);

  

  var sheetWaistepercent= 1-(Bklen1*BkBrd1*maxUps)/(SheetLen*SheetWid);
  return [sheetWaistepercent,maxUps];
}




function calculateXY(ups){
  var x=0;
  var y=0;
  var Ups=ups;
  if(Ups===1){
    x=1;
    y=1;
  }else if(Ups===2){
    x=2;
    y=1;
  }else if(Ups===4){
    x=2;
    y=2;
  }else if(Ups===6){
    x=2;
    y=3;
  }  else if(Ups===8){
    x=4;
    y=2;
  }else if(Ups===12){
    x=4;
    y=3;
  }else if(Ups===16){
    x=4;
    y=4;
  }else if(Ups===24){
    x=4;
    y=6;
  }else if(Ups===32){
    x=4;
    y=8;
  }else if(Ups===40){
    x=5;
    y=8;
  }else{
    x=6;
    y=8;
  }
  return [x,y];
}

function webSizeConv(width){
  var SheetWid=0;
  if(width<=508){
    SheetWid=508;
  }else if(width>508 && width<=546){
    SheetWid=546;
  }else if(width>546 && width<=578){
    SheetWid=578;
  }else{
    SheetWid=635;
  }
  return SheetWid;
}




function calSpine(bindSt,compCol,gsmCol,textPages,paperTypeCol,coverGSM){
  var textGSM =0;
  var spine =0;
  for(k=0;k<=5;k++){
    if((compCol[k][0]==="Text" || compCol[k][0]==="End Paper" || compCol[k][0]==="Text - 2" || compCol[k][0]==="Sticker" || compCol[k][0]==="Binding Board" ) && compCol[k][0] !==""){
      // Logger.log(compCol[k][0]+"-"+textPages[k][0]+"---"+gsmCol[k][0]+"---"+paperType[k][0]);
      if(paperTypeCol[k][0]==="Gloss Art"){
      textGSM=textGSM+((textPages[k][0]/2)*gsmCol[k][0]*0.1);
      }else if(paperTypeCol[k][0]==="Matt Art"){
        textGSM=textGSM+((textPages[k][0]/2)*gsmCol[k][0]*0.1);
      }else if(paperTypeCol[k][0].indexOf("Maplitho") !== -1){
        textGSM=textGSM+((textPages[k][0]/2)*gsmCol[k][0]*0.135);
      }else if(paperTypeCol[k][0]==="Sticker Sheet"){
        textGSM=textGSM+((textPages[k][0]/2)*gsmCol[k][0]*0.135);
      }
      else
      {
        textGSM=textGSM+((textPages[k][0]/2)*gsmCol[k][0]*0.17);
      }
      textGSM=textGSM/100;
    }
  }
  if(bindSt !== "CS"){
  spine = textGSM+(coverGSM*2*0.175)/100+2;
  }
  return spine;
}

function cal_PLC_Cover(paperType,orderSize,forcePaper,Qty,bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm,Bklen,BkBrd,webOrSheet,opsTable,complexity){
  var spine = calSpine(bindingStyle,compCol,gsmCol,textPagesCol,paperTypeCol,gsm);

  if(((((paperType==="FBB" || paperType==="CBB") && orderSize>=1500) || (paperType.indexOf("Maplitho") !== -1 && orderSize >=3000)|| ((paperType==="Gloss Art" ||  paperType==="Matt Art") && gsm >= 110 && orderSize >= 6000) || ((paperType==="Gloss Art" ||  paperType==="Matt Art") && gsm < 110 && orderSize >= 10000)) && forcePaper==="Default") || forcePaper ==="Special"){           
    if (Qty > 30000) {
      var machineWidth = 720;
      var machineLen = 1020;
    }else {
      var machineWidth = 640;
      var machineLen = 920;
    }

    
    var xv=Math.floor(machineWidth/(Bklen+lenbuffer));
    var yv=Math.floor(machineLen/(2*(BkBrd+widbuffer)+spine));
    var vUps=xv*yv*2;
    var xh=Math.floor(machineWidth/(2*(BkBrd+widbuffer)+spine));
    var yh=Math.floor(machineLen/(Bklen+lenbuffer));
    var hUps=xh*yh*2;
    var maxUps=Math.max(stdUps1(vUps,complexity),stdUps1(hUps,complexity));
    var SheetLenInit=(Math.min((Bklen+lenbuffer),(BkBrd+widbuffer+(spine/2))))*(Math.max(calculateXY(maxUps)[0],calculateXY(maxUps)[1]))+10;
    var SheetWidInit=(Math.max((Bklen+lenbuffer),(BkBrd+widbuffer+(spine/2))))*(Math.min(calculateXY(maxUps)[0],calculateXY(maxUps)[1]))+20;
    var SheetLen=webOrSheet==="Web"? multiplierFive(Math.max(SheetLenInit,SheetWidInit)-11): multiplierFive(Math.max(SheetLenInit,SheetWidInit));
    var SheetWid = webOrSheet==="Web"?multiplierFive(webSizeConv((Math.min(SheetWidInit,SheetLenInit)))):multiplierFive(Math.min(SheetWidInit,SheetLenInit));
    var sheetWaistepercent= 1-((Bklen+6)*(BkBrd+5+(spine/2))*maxUps)/(SheetLen*SheetWid);
    var paperSzType = "Special";
    
    

  }else{
      // var stdLen = 0;
      // var stdBrd = 0;
    var sheetWaistepercent = 1;
    for(j=0;j<opsTable.length;j++){

      if(opsTable[j][0] !== "" && calculateWaiste(opsTable[j][1],opsTable[j][0],(Bklen),(BkBrd+5+(spine/2)-4),complexity)[0]< sheetWaistepercent){
        var SheetLen=opsTable[j][1];
        var SheetWid =opsTable[j][0];

        // Logger.log(SheetLen+":"+SheetWid)
        var maxUps = calculateWaiste(opsTable[j][1],opsTable[j][0],Bklen,(BkBrd+5+(spine/2)-4),complexity)[1];
        var paperSzType = "Standard";
        sheetWaistepercent = calculateWaiste(opsTable[j][1],opsTable[j][0],Bklen,(BkBrd+5+(spine/2)-4),complexity)[0];
      }
    }
      
  }
  return [maxUps,SheetLen,SheetWid,sheetWaistepercent,paperSzType];
}


function multiplierFive(Num){
  var mltplier = Num/5;
  var opt= Math.ceil(mltplier)*5;
  return opt;
}



function calcbindcostNew(binding_style,Qty,costarr,maxUpsArray,compCol,textPagesCol)
{
 
  bindcost=0;
  bindcostact=0;

  var process=binding_style;

  if(process!="")
  {
    var bindcostbreakup=getbindcost(costarr,process);
    var bindcostbreakupact=getbindcostact(costarr,process);
    //Logger.log(bindcostbreakup);
    sig=0;spread=0;
    for(var ct=0;ct<compCol.length;ct++)
    {
      if(compCol[ct][0]=="Text"||compCol[ct][0]=="Text - 2" || compCol[ct][0]=="Sticker Paper")
      {
        sig=sig+Math.ceil(textPagesCol[ct][0]/Math.min(32,maxUpsArray[ct]*2));
        spread=spread+textPagesCol[ct][0]/4;
      }
    }
    
    if(process=="Plain Board Book"||process=="HC + Board Book" || process=="HC+Foam+Board Book")
    {
      bindcost=(spread*bindcostbreakup[0]+bindcostbreakup[1])*Qty;
      bindcostact=(spread*bindcostbreakupact[0]+bindcostbreakupact[1])*Qty;
    }
    else
    {
      bindcost=Math.round((sig*bindcostbreakup[0]+bindcostbreakup[1])*Qty);
      bindcostact=Math.round((sig*bindcostbreakupact[0]+bindcostbreakupact[1])*Qty);
    }
  }
    // bindcost[1]=Math.round(mainTable[0][9]*1.3*mainTable[0][3]);
    // bindcost[2]=Math.round(mainTable[0][10]*2*mainTable[0][3]);
  var bindcostcomp=[];
  bindcostcomp[0]=bindcost;
  bindcostcomp[1]=bindcostact;
  return bindcostcomp;
}



function separateString(inputString) {
  // var inputString = "example/string/to/parse";
  
  // Split the string based on "/"
  var parts = inputString.split("/");
  return parts;  
}

function convertArrayFormat(array1) {
  var array2 = [];

  for (var i = 0; i < array1[0].length; i++) {
    array2.push([array1[i]]);
  }

  // Logger.log(array2);
  return array2;
}



function onEditUser(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var sheetName = sheet.getName();
  var editedValue = e.value;
  
  // Check if the edited range falls within B5-B10 and the sheet is named "Calculate"
  if ((sheetName == "Calculate_1" || sheetName == "Calculate_2" || sheetName == "Calculate_3" || sheetName == "Calculate_4") && range.getColumn() == 2 && range.getRow() >= 5 && range.getRow() <= 10 && editedValue === "Gate Fold Cover") {
    var ui = SpreadsheetApp.getUi(); // Initialize the user interface;
    var massage = "Please enter Right ADD and Left ADD in cells O"+range.getRow()+" ,P"+range.getRow();
    var response = ui.alert(massage, ui.ButtonSet.OK_CANCEL);
    var button = response == ui.Button.OK;
    if (button) {
      var row = range.getRow();
      sheet.getRange(row, 15).activate(); // Column O
    }
  }
}

function onEditSetValueFour(e) {

  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var editedValue = e.value;
  var row = range.getRow();
  var sheetName = sheet.getName();
  // Logger.log(editedValue);
  
  // Check if the edited range falls within B5-B10 and the sheet is named "Calculate"
  if ((sheetName == "Calculate_1" || sheetName == "Calculate_2" || sheetName == "Calculate_3" || sheetName == "Calculate_4") && range.getColumn() == 2 && range.getRow() >= 5 && range.getRow() <= 10) {
    // Check if the edited value is "Cover" or "PLC"
    if (editedValue === "Cover" || editedValue === "PLC" || editedValue === "Foam" || editedValue === "Binding Board" || editedValue === "Gate Fold Cover") {      
      sheet.getRange(row, 6).setValue(4); // Set value in corresponding row of column F to 4
    }else{
      // Logger.log("else");
      sheet.getRange(row, 6).clearContent();
    }
  }
  
}

function onEditSetValuePrint(e) {

  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var editedValue = e.value;
  var row = range.getRow();
  var sheetName = sheet.getName();
  // Logger.log(editedValue);
  
  // Check if the edited range falls within B5-B10 and the sheet is named "Calculate"
  if ((sheetName == "Calculate_1" || sheetName == "Calculate_2" || sheetName == "Calculate_3" || sheetName == "Calculate_4") && range.getColumn() == 2 && range.getRow() >= 5 && range.getRow() <= 10) {
    // Check if the edited value is "Cover" or "PLC"
    if (editedValue === "Foam" || editedValue === "Binding Board") {      
      sheet.getRange(row, 7).setValue(0);
      sheet.getRange(row, 8).setValue(0);
       // Set value in corresponding row of column F to 4
    }else{
      
      sheet.getRange(row, 7).clearContent();
      sheet.getRange(row, 8).clearContent();
    }
  }
  
}


function onEditMaterial(e) {

  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var editedValue = e.value;
  var row = range.getRow();
  var sheetName = sheet.getName();
  // Logger.log(editedValue);
  
  // Check if the edited range falls within B5-B10 and the sheet is named "Calculate"
  if ((sheetName == "Calculate_1" || sheetName == "Calculate_2" || sheetName == "Calculate_3" || sheetName == "Calculate_4") && range.getColumn() == 2 && range.getRow() >= 5 && range.getRow() <= 10) {
    // Check if the edited value is "Cover" or "PLC"
    if (editedValue === "Binding Board") {      
      sheet.getRange(row, 3).setValue("Binding Board");
       // Set value in corresponding row of column F to 4
    }else{
      
      sheet.getRange(row, 3).clearContent();
    }
  }
  
}


function getStdLenBrd(dim,bindingStyle){
  if(dim<100){
    var newDim = bindingStyle.indexOf("Board Book") !== -1? dim+2+3 : dim+2;
  }else{
    var newDim =bindingStyle.indexOf("Board Book") !== -1? dim+3 : dim;
  }
  // Logger.log("newdim: "+newDim)
  return newDim;
}

function calOverHead(sheetName,qty){
  var ss = SpreadsheetApp.getActiveSpreadsheet();  
  var opsSheet=ss.getSheetByName("Options");
  var mainsheet=ss.getSheetByName(sheetName);

  var opsTable =opsSheet.getRange(5,26,5,2).getValues();
  var finalTable = mainsheet.getRange(27,1,1,15).getValues();
  var Curr_Rate = mainsheet.getRange("Q2:R2").getValues();
  var varExchangeRateArray = opsSheet.getRange(19,22,3,2).getValues();
  var totalVar= finalTable[0][10];
  var currency = Curr_Rate[0][0];
  var currentOverHead = finalTable[0][6];
  var currentOverHeadPercent = finalTable[0][5];
  var rate = currency === "INR"? 1 : Curr_Rate[0][1] ;
  var varExchangeRate = 1;
  var gpPercent = finalTable[0][14];
  var pricePerUnit = finalTable[0][13];
  var total = finalTable[0][11];
  // Logger.log("total "+rate);

  for(i=0;i<varExchangeRateArray.length;i++){
    if(currency===varExchangeRateArray[i][0]){
      varExchangeRate= varExchangeRateArray[i][1];
    }
  }

  
  for(i=0;i<opsTable.length;i++){
    // Logger.log(opsTable[i][0]+ " qty");
    if(qty<=opsTable[i][0]){
      var targetGP= opsTable[i][1];      
      break;
    }
  }
  // Logger.log([targetGP,gpPercent,totalVar,qty,varExchangeRate,rate,total,currentOverHead,currentOverHeadPercent]);
  if(targetGP>gpPercent){
    var x = ((totalVar/((1-targetGP)*qty*varExchangeRate))*qty*rate)-total+currentOverHead;
    var reqOverHead = (currentOverHeadPercent/currentOverHead)*x;
    // Logger.log("req "+reqOverHead);
  }else{
    reqOverHead=currentOverHeadPercent;
  }
  return reqOverHead;
  
}


function sumProduct(array1, array2) {
  // Check if both arrays have the same length
  if (array1.length !== array2.length) {
    throw new Error("Arrays must be of the same length");
  }

  // Initialize a variable to store the sum product
  let sumProduct = 0;

  // Loop through each element in the arrays
  for (let i = 0; i < array1.length; i++) {
    sumProduct += array1[i] * array2[i];
  }

  return sumProduct;
}

function calculateups(bkw,bkl,shw,shl,comp)
{
  var ups=0;
  if(shw<shl)
  {
    t=shw;
    shw=shl;
    shl=t;
  }
  shw=shw-6;
  shl=shl-15;
  
  if(comp=="Cover")
  {
    bkw=bkw*2+6+25;
    bkl=bkl+6;
    t1=Math.floor(shw/bkw)*Math.floor(shl/bkl);
    t2=Math.floor(shw/bkl)*Math.floor(shl/bkw);
    ups=Math.max(t1,t2)*2; 
  }
  else if(comp=="PLC")
  {
    bkw=bkw*2+50+25;
    bkl=bkl+50;
    t1=Math.floor(shw/bkw)*Math.floor(shl/bkl);
    t2=Math.floor(shw/bkl)*Math.floor(shl/bkw);
    ups=Math.max(t1,t2)*2; 
  }
  else
  {
    bkw=2*(bkw+5);
    bkl=bkl+6;
    t1=Math.floor(shw/bkw)*Math.floor(shl/bkl);
    t2=Math.floor(shw/bkl)*Math.floor(shl/bkw);
    ups=Math.max(t1,t2)*2; 
  }
  return ups;
}

function getsurfacecost(op,costarr)
{
  for(i=0;i<costarr.length;i++)
  {
    if(costarr[i][6]==op)
    {
      return costarr[i][7];
    }
    if(costarr[i][6]=="")
    {
      return 0;
    }
  }
}

function getprintcost(costarr,col)
{
  if(col==1)
  {
    return costarr[0][13];
  }
  else if(col==2)
  {
    return costarr[1][13];
  }
  else
  {
    return costarr[2][13];
  }
}

function getplatecost(costarr)
{
  return costarr[4][13];
}

function calccompcost(mainarr,costarr,startindex, row)
{
  var finalcost=[];
  finalcost[0]=0;
  finalcost[1]=0;
  finalcost[2]=0;
  finalcost[3]=0;

  if(mainarr[row][startindex]!="")
  {
    //Logger.log("Reached");
    gsm=mainarr[row][startindex+2];
    ppkg=mainarr[row][startindex+3];
    pgs=mainarr[row][startindex+4];
    plen=mainarr[row][startindex+5];
    pwid=mainarr[row][startindex+6];
    ups=mainarr[row][startindex+7];

    fc=mainarr[row][startindex+9];
    bc=mainarr[row][startindex+10];

    fscost=getsurfacecost(mainarr[row][startindex+11],costarr);
    bscost=getsurfacecost(mainarr[row][startindex+12],costarr);
    qty=mainarr[row][4];
    wastage=1+mainarr[row][7];
    fpcost=getprintcost(costarr, fc);
    bpcost=getprintcost(costarr, bc);
    plate=getplatecost(costarr);
    //Logger.log(plate);
    sheets=pgs/ups*qty*wastage/2;
    //Logger.log(sheets);
    printcost=sheets/1000*(fc*fpcost+bc*bpcost);
    surfacecost=plen/25.4*pwid/25.4/100*sheets*(fscost+bscost);
    papercost=plen/1000*pwid/1000*gsm/1000*sheets*ppkg;
    platecost=Math.ceil(pgs/ups/2)*(fc+bc)*plate;
  
    finalcost[0]=Math.round(papercost);
    finalcost[1]=Math.round(platecost);
    finalcost[2]=Math.round(printcost);
    finalcost[3]=Math.round(surfacecost);
  }
  return finalcost;
}
function getbindcost(costarr,process)
{
  var bindcost=[];
  bindcost[0]=0;
  bindcost[1]=0;

  for(i=0;i<costarr.length;i++)
  {
    if(costarr[i][3]==process)
    {
      bindcost[0]=costarr[i][4];
      bindcost[1]=costarr[i][5];
      return bindcost;
    }
    if(costarr[i][3]=="")
    {
      return bindcost;
    }
  }
}

function getbindcostact(costarr,process)
{
  var bindcost=[];
  bindcost[0]=0;
  bindcost[1]=0;

  for(i=17;i<costarr.length;i++)
  {
    if(costarr[i][3]==process)
    {
      bindcost[0]=costarr[i][4];
      bindcost[1]=costarr[i][5];
      return bindcost;
    }
    if(costarr[i][3]=="")
    {
      return bindcost;
    }
  }
}

function calcbindcost(mainarr,costarr,startindex,nocomps,nocolsinstep,row)
{
  var bindcost=[];
  bindcost[0]=0;
  bindcost[1]=0;
  bindcost[2]=0;
  process=mainarr[row][9];

  if(process!="")
  {
    bindcostbreakup=getbindcost(costarr,process);
    //Logger.log(bindcostbreakup);
    sig=0;spread=0;
    for(var ct=0;ct<nocomps;ct++)
    {
      if(mainarr[row][startindex+ct*nocolsinstep]=="Text"||mainarr[row][startindex+ct*nocolsinstep]=="Text - 2")
      {
        sig=sig+Math.ceil(mainarr[row][startindex+ct*nocolsinstep+4]/Math.min(16,mainarr[row][startindex+ct*nocolsinstep+7]*2));
        spread=spread+mainarr[row][startindex+ct*nocolsinstep+4]/4;
      }
    }
    
    if(process=="Plain Board Book"||process=="HC + Board Book")
    {
      bindcost[0]=(spread*bindcostbreakup[0]+bindcostbreakup[1])*mainarr[row][4];
    }
    else
    {
      bindcost[0]=Math.round((sig*bindcostbreakup[0]+bindcostbreakup[1])*mainarr[row][4]);
    }
  }
    bindcost[1]=Math.round(mainarr[row][11]*1.3*mainarr[row][4]);
    bindcost[2]=Math.round(mainarr[row][13]*2*mainarr[row][4]);

  return bindcost;
}
function getcost()
{
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var mainsheet=ss.getSheetByName("Main");
  var costsheet=ss.getSheetByName("Options");
  
  var startindex=18;
  var nocolsinstep=14;
  var validatecol=8;
  var nocomps=6;
  const MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
  
  var mainarr=mainsheet.getRange(1,1,mainsheet.getLastRow(),mainsheet.getLastColumn()).getValues();
  var mainarrcost=mainsheet.getRange(1,startindex+nocomps*nocolsinstep+2,mainsheet.getLastRow(),5).getValues();
  var validatearr=mainsheet.getRange(1,validatecol+1,mainsheet.getLastRow(),1).getValues();
  
  var costarr=costsheet.getRange(2,1,costsheet.getLastRow(),15).getValues();
  var compcost=[];
  compcost[0]=0;
  compcost[1]=0;
  compcost[2]=0;
  compcost[3]=0;
  
  for(var r=1;r<mainarr.length;r++)
  {
    var compcost=[];
    compcost[0]=0;
    compcost[1]=0;
    compcost[2]=0;
    compcost[3]=0;
    
    if(validatearr[r][0]=="Yes")
    {
      
      for(var t=0;t<nocomps;t++)
      {
        c1=calccompcost(mainarr,costarr,startindex+t*nocolsinstep,r);
        compcost[0]=compcost[0]+c1[0];
        compcost[1]=compcost[1]+c1[1];
        compcost[2]=compcost[2]+c1[2];
        compcost[3]=compcost[3]+c1[3];
        Logger.log(c1);
      }

      bindcost=calcbindcost(mainarr,costarr,startindex,nocomps,nocolsinstep,r);
      Logger.log(bindcost);
      vr=compcost[0]+0.65*compcost[1]+0.35*compcost[2]+0.65*compcost[3]+0.5*bindcost[0]+0.75*bindcost[1]+0.5*bindcost[2];
      mainarrcost[r][0]=compcost[0];
      mainarrcost[r][1]=compcost[1]+compcost[2];
      mainarrcost[r][2]=compcost[3];
      mainarrcost[r][3]=bindcost[0]+bindcost[1]+bindcost[2];
      mainarrcost[r][4]=vr;
      validatearr[r][0]="Done"
      
    }
    if(validatearr[r][0]=="")
    {
      r=mainarr.lenght;
    }
  }
  mainsheet.getRange(1,startindex+nocomps*nocolsinstep+2,mainsheet.getLastRow(),5).setValues(mainarrcost);
  mainsheet.getRange(1,validatecol+1,validatearr.length,1).setValues(validatearr);
  //Logger.log(compcost);
 // Logger.log(bindcost);
}


//new function

function convertStringToArray(inputString) {
  // Split the input string by '#' delimiter
  const elements = inputString.split('$');

  // Map each element into its own array
  const result = elements.map(element => [element]);

  // Fill the result array with empty arrays if fewer than 6 elements are present
  while (result.length < 6) {
    result.push([]);
  }

  return result;
}

function stdUps1(Ups,complexity){
  // Logger.log("comp: "+complexity);
  var maxUps = 0;
  if(complexity==="Simple" || complexity===""){
    if(Ups===3){
      maxUps=2;
    }else if(Ups===6){
      maxUps=6;
    }else if(Ups===10){
      maxUps=8;
    }else if(Ups===14){
      maxUps=12;
    }else if(Ups>16 && Ups<24){
      maxUps=16;
    }else if(Ups>24 && Ups<32){
      maxUps=24;
    }else if(Ups>32 ){
      maxUps=32;
    }else{
      maxUps=Ups;
      // Logger.log("elseif"+maxUps);
    }
  }else{
    if(Ups===3){
    maxUps=2;
    }else if(Ups===6){
      maxUps=6;
    }else if(Ups===10){
      maxUps=8;
    }else if(Ups===14){
      maxUps=12;
    }else if(Ups>16 && Ups<24){
      maxUps=16;
    }else if(Ups>24 && Ups<32){
      maxUps=24;
    }else if(Ups>32 && Ups<40){
      maxUps=32;
    }else if(Ups>40 && Ups<48){
      maxUps=40;
    }else if(Ups>48 ){
      maxUps=48;
      // Logger.log("elseif"+maxUps);
    }else{
      maxUps=Ups;
      // Logger.log("else"+maxUps);
    }
  }

  
  return maxUps;
}

function sumColumn(array2D, columnNumber) {
  let sum = 0;

  // Iterate through each row in the 2D array
  for (let i = 0; i < array2D.length; i++) {
    // Check if the row has the specified column index
    if (array2D[i].length > columnNumber) {
      sum += Number(array2D[i][columnNumber]);
    }
  }

  return sum;
}
