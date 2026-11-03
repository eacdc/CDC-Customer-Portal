/*
  dbo.GetJobFullDetails_Client  (Full report / Excel export)

  BindingStyle fix:
    1. Processes on the book (text pages / cover) win over processes on other
       parts of the job (poster, envelope, mill board, spacer ...).
    2. Tie-breaker: when two candidates still have the same SequenceNo, the
       process added first (lowest JobBookingJobCardProcessID) wins, so the
       result is the same every time.

  Run on both IndusEnterprise (Kolkata) and IndusEnterprise2 (Ahmedabad).
*/
CREATE OR ALTER PROCEDURE [dbo].[GetJobFullDetails_Client]
    @CompanyID  INT,
    @InputJobs  dbo.JobNoList READONLY
AS
BEGIN
    SET NOCOUNT ON;

    /* ---------- Pre-stage: process ID sets ---------- */
    IF OBJECT_ID('tempdb..#PrintingProcs') IS NOT NULL DROP TABLE #PrintingProcs;
    IF OBJECT_ID('tempdb..#BindingProcs')  IS NOT NULL DROP TABLE #BindingProcs;

    SELECT ProcessID INTO #PrintingProcs
    FROM dbo.ProcessMaster WHERE ProcessName LIKE '%Printing%';

    SELECT ProcessID INTO #BindingProcs
    FROM dbo.ProcessMaster
    WHERE ProcessName LIKE '%perfect%' OR ProcessName LIKE '%stitch%' OR ProcessName LIKE '%past%';

    /* ---------- Pre-stage: container list per job (with dispatched qty, DN vouchers only) ---------- */
    IF OBJECT_ID('tempdb..#JobContainerList') IS NOT NULL DROP TABLE #JobContainerList;

    SELECT
        JB.JobBookingID,
        LTRIM(RTRIM(fgm.ContainerNo))                                          AS ContainerNo,
        SUM(ISNULL(fgd.innercarton, 0) * ISNULL(fgd.quantityperpack, 0))       AS ContainerQty,
        MIN(COALESCE(TRY_CONVERT(datetime, fgm.VoucherDate),
                     TRY_CONVERT(datetime, fgm.CreatedDate)))                  AS FirstSeenDate
    INTO #JobContainerList
    FROM dbo.JobBookingJobCard JB
    INNER JOIN @InputJobs IJ ON IJ.JobBookingNo = JB.JobBookingNo
    INNER JOIN dbo.FinishGoodsTransactionDetail fgd
        ON fgd.JobBookingID = JB.JobBookingID
       AND ISNULL(fgd.IsDeletedTransaction, 0) = 0
    INNER JOIN dbo.FinishGoodsTransactionMain fgm
        ON fgm.FGtransactionID = fgd.FGTransactionID
       AND fgm.voucherid       = -51
       AND fgm.VoucherPrefix   = 'DN'
       AND ISNULL(fgm.IsDeletedTransaction, 0) = 0
    WHERE JB.CompanyID = @CompanyID
      AND ISNULL(JB.IsDeletedTransaction, 0) = 0
      AND fgm.ContainerNo IS NOT NULL
      AND LTRIM(RTRIM(fgm.ContainerNo)) <> ''
    GROUP BY JB.JobBookingID, LTRIM(RTRIM(fgm.ContainerNo));

    /* ---------- Pre-stage: matching shipment rows from BOTH DBs, latest per container ---------- */
    IF OBJECT_ID('tempdb..#ShipmentMatched') IS NOT NULL DROP TABLE #ShipmentMatched;

    ;WITH ShipmentUnioned AS (
        SELECT 'KOL' AS source_db,
               s.ContainerNumber,
               s.DestinationPort,
               s.DestinationArrivalOriginalPlannedDate AS OriginalETA,
               s.DestinationArrivalPlannedDate          AS RevisedETA,
               s.Link,
               s.CreatedAt,
               s.Status,
               s.GateInActualDate                       AS GateInDate,
               s.OriginDepartureActualDate              AS DepartureDate
        FROM IndusEnterprise.dbo.ShipmentETA s
        WHERE s.ContainerNumber IN (SELECT ContainerNo FROM #JobContainerList)
        UNION ALL
        SELECT 'AHM',
               s.ContainerNumber,
               s.DestinationPort,
               s.DestinationArrivalOriginalPlannedDate,
               s.DestinationArrivalPlannedDate,
               s.Link,
               s.CreatedAt,
               s.Status,
               s.GateInActualDate,
               s.OriginDepartureActualDate
        FROM IndusEnterprise2.dbo.ShipmentETA s
        WHERE s.ContainerNumber IN (SELECT ContainerNo FROM #JobContainerList)
    ),
    ShipmentRanked AS (
        SELECT *,
               ROW_NUMBER() OVER (
                   PARTITION BY ContainerNumber
                   ORDER BY RevisedETA DESC, CreatedAt DESC
               ) AS rn
        FROM ShipmentUnioned
    )
    SELECT source_db, ContainerNumber, DestinationPort, OriginalETA, RevisedETA,
           Link, CreatedAt, Status, GateInDate, DepartureDate
    INTO   #ShipmentMatched
    FROM   ShipmentRanked
    WHERE  rn = 1;

    /* ---------- Pre-stage: aggregated shipment fields per job ----------
       Every value is wrapped in ISNULL(..., '') so empty slots still
       produce a separator. The Nth element across all columns always
       refers to the Nth container, even if the shipment row is missing.
    ---------- */
    IF OBJECT_ID('tempdb..#JobShipmentAgg') IS NOT NULL DROP TABLE #JobShipmentAgg;

    SELECT
        jc.JobBookingID,
        STRING_AGG(
            jc.ContainerNo + ' (' + CONVERT(NVARCHAR(20), jc.ContainerQty) + ')',
            '| '
        ) WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo)                AS ContainerNos,
        STRING_AGG(ISNULL(sm.DestinationPort, ''),                          '| ') WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo) AS DestinationPorts,
        STRING_AGG(ISNULL(sm.Status, ''),                                   '| ') WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo) AS Statuses,
        STRING_AGG(ISNULL(CONVERT(NVARCHAR(30), sm.GateInDate,     126), ''), '| ') WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo) AS GateInDates,
        STRING_AGG(ISNULL(CONVERT(NVARCHAR(30), sm.DepartureDate,  126), ''), '| ') WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo) AS DepartureDates,
        STRING_AGG(ISNULL(CONVERT(NVARCHAR(30), sm.OriginalETA,    126), ''), '| ') WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo) AS OriginalETAs,
        STRING_AGG(ISNULL(CONVERT(NVARCHAR(30), sm.RevisedETA,     126), ''), '| ') WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo) AS RevisedETAs,
        STRING_AGG(ISNULL(sm.Link, ''),                                     '| ') WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo) AS Links,
        STRING_AGG(ISNULL(sm.source_db, ''),                                '| ') WITHIN GROUP (ORDER BY jc.FirstSeenDate, jc.ContainerNo) AS ShipmentSourceDBs
    INTO #JobShipmentAgg
    FROM #JobContainerList jc
    LEFT JOIN #ShipmentMatched sm ON sm.ContainerNumber = jc.ContainerNo
    GROUP BY jc.JobBookingID;

    /* ---------- Main CTE chain ---------- */
    ;WITH InputJobIDs AS (
        SELECT JB.JobBookingID,jb.JobName, JB.JobBookingNo, JB.OrderQuantity, JB.OrderBookingID
        FROM dbo.JobBookingJobCard JB
        INNER JOIN @InputJobs IJ ON IJ.JobBookingNo = JB.JobBookingNo
        WHERE JB.CompanyID = @CompanyID AND ISNULL(JB.IsDeletedTransaction, 0) = 0
    ),
    ArtworkData AS (
        SELECT
            IJ.JobBookingID,
            JPA.FileReceivedDate, JPA.SoftApprovalSentActdate, JPA.FinallyApprovedDate, JPA.FinallyApproved,
            ROW_NUMBER() OVER (PARTITION BY IJ.JobBookingID ORDER BY JPA.FinallyApprovedDate DESC, JPA.ArtworkProcessApprovalID DESC) AS rn
        FROM InputJobIDs IJ
        INNER JOIN dbo.JobBookingJobCard JEJ ON JEJ.JobBookingID = IJ.JobBookingID
        INNER JOIN dbo.JobOrderBookingDetails JOBD
            ON JOBD.OrderBookingID = JEJ.OrderBookingID
           AND JOBD.OrderBookingDetailsID = JEJ.OrderBookingDetailsID
           AND ISNULL(JOBD.IsDeletedTransaction, 0) = 0
        LEFT JOIN dbo.ArtworkProcessApproval JPA
            ON JPA.OrderBookingID = JOBD.OrderBookingID
           AND JPA.OrderBookingDetailsID = JOBD.OrderBookingDetailsID
    ),
    Components AS (
        SELECT
            IJ.JobBookingID,
            JC.JobBookingJobCardContentsID, JC.CompanyID, JC.PaperID,
            JJC.JobPreplan AS JobCloseSize, JJC.PlanFColor,
            CASE
                WHEN JC.PlanContName LIKE '%Cover%'                                    THEN 'Cover'
                WHEN JC.PlanContName LIKE '%Col Pgs%' OR JC.PlanContName LIKE '%Pages%' THEN 'Text'
            END AS CompType,
            ROW_NUMBER() OVER (
                PARTITION BY IJ.JobBookingID,
                    CASE
                        WHEN JC.PlanContName LIKE '%Cover%'                                    THEN 'Cover'
                        WHEN JC.PlanContName LIKE '%Col Pgs%' OR JC.PlanContName LIKE '%Pages%' THEN 'Text'
                    END
                ORDER BY JC.JobBookingJobCardContentsID) AS rn_comp
        FROM InputJobIDs IJ
        INNER JOIN dbo.JobBookingJobCardContents JC
            ON JC.JobBookingID = IJ.JobBookingID
           AND JC.CompanyID    = @CompanyID
           AND ISNULL(JC.IsDeletedTransaction, 0) = 0
        INNER JOIN dbo.JobBookingJobCardContentsSpecification JJC
            ON JJC.JobBookingJobCardContentsID = JC.JobBookingJobCardContentsID
           AND JJC.CompanyID                    = JC.CompanyID
        WHERE JC.PlanContName LIKE '%Cover%'        -- Cover first
           OR JC.PlanContName LIKE '%Col Pgs%'      -- original text pattern
           OR JC.PlanContName LIKE '%Pages%'         -- new text pattern (Book Pages etc.)
    ),
    CompPrintRaw AS (
        SELECT C.JobBookingID, C.CompType, C.JobBookingJobCardContentsID,
            ISNULL((SELECT SUM(ISNULL(JSR.ScheduleQty,0)) FROM dbo.JobScheduleRelease JSR
                    WHERE JSR.JobBookingJobCardContentsID = C.JobBookingJobCardContentsID
                      AND JSR.ProcessID IN (SELECT ProcessID FROM #PrintingProcs)
                      AND ISNULL(JSR.IsDeletedTransaction,0)=0 AND ISNULL(JSR.IsOnlineProcess,0)=0),0) AS PrintPlanQty,
            ISNULL((SELECT SUM(ISNULL(PE.ProductionQuantity,0)) FROM dbo.ProductionEntry PE
                    WHERE PE.JobBookingJobCardContentsID = C.JobBookingJobCardContentsID
                      AND PE.ProcessID IN (SELECT ProcessID FROM #PrintingProcs)),0) AS PrintDoneQty,
            (SELECT MAX(TRY_CONVERT(datetime, PE.ToTime)) FROM dbo.ProductionEntry PE
             WHERE PE.JobBookingJobCardContentsID = C.JobBookingJobCardContentsID
               AND PE.ProcessID IN (SELECT ProcessID FROM #PrintingProcs)) AS LastPrintActualEnd
        FROM Components C
    ),
    CompPrint AS (
        SELECT JobBookingID, CompType, SUM(PrintPlanQty) AS PrintPlanQty,
               SUM(PrintDoneQty) AS PrintDoneQty, MAX(LastPrintActualEnd) AS LastPrintActualEnd
        FROM CompPrintRaw GROUP BY JobBookingID, CompType
    ),
    BindingProgress AS (
        SELECT IJ.JobBookingID,
            ISNULL((SELECT SUM(ISNULL(JSR.ScheduleQty,0)) FROM dbo.JobScheduleRelease JSR
                    WHERE JSR.JobBookingID = IJ.JobBookingID
                      AND JSR.ProcessID IN (SELECT ProcessID FROM #BindingProcs)
                      AND ISNULL(JSR.IsDeletedTransaction,0)=0 AND ISNULL(JSR.IsOnlineProcess,0)=0),0) AS BindingPlanQty,
            ISNULL((SELECT SUM(ISNULL(PE.ProductionQuantity,0)) FROM dbo.ProductionEntry PE
                    WHERE PE.JobBookingID = IJ.JobBookingID
                      AND PE.ProcessID IN (SELECT ProcessID FROM #BindingProcs)),0) AS BindingDoneQty,
            (SELECT MAX(TRY_CONVERT(datetime, PE.ToTime)) FROM dbo.ProductionEntry PE
             WHERE PE.JobBookingID = IJ.JobBookingID
               AND PE.ProcessID IN (SELECT ProcessID FROM #BindingProcs)) AS BindingEndDate
        FROM InputJobIDs IJ
    ),
    /* GPN qty uses three-factor formula: outercarton × innercarton × quantityperpack */
    LastGPN AS (
        SELECT
            IJ.JobBookingID,
            MAX(fgd.CreatedDate) AS LastGpnDate,
            SUM(
                ISNULL(fgd.outercarton, 0)
                * ISNULL(fgd.innercarton, 0)
                * ISNULL(fgd.quantityperpack, 0)
            ) AS GpnQty
        FROM InputJobIDs IJ
        INNER JOIN dbo.FinishGoodsTransactionDetail fgd
            ON fgd.JobBookingID = IJ.JobBookingID AND ISNULL(fgd.IsDeletedTransaction,0)=0
        INNER JOIN dbo.FinishGoodsTransactionMain fgm
            ON fgm.FGtransactionID = fgd.FGTransactionID AND fgm.voucherid = -50
           AND ISNULL(fgm.IsDeletedTransaction,0)=0
        GROUP BY IJ.JobBookingID
    ),
    /* DispatchedQty sums the per-container qty already computed in #JobContainerList */
    DispatchTotal AS (
        SELECT JobBookingID, SUM(ContainerQty) AS DispatchedQty
        FROM #JobContainerList
        GROUP BY JobBookingID
    ),
    BindingStyleCTE AS (
        SELECT IJ.JobBookingID,
            CASE WHEN ISNULL(JP.RateFactor,'')='' THEN PM.ProcessName
                 ELSE PM.ProcessName + ' - (' + JP.RateFactor + ')' END AS BindingStyle,
            ROW_NUMBER() OVER (
                PARTITION BY IJ.JobBookingID
                ORDER BY
                    /* Book parts (text pages / cover) first, other parts (poster etc.) after */
                    CASE WHEN JC.PlanContName LIKE '%Col Pgs%'
                           OR JC.PlanContName LIKE '%Pages%'
                           OR JC.PlanContName LIKE '%Cover%' THEN 0 ELSE 1 END,
                    JP.SequenceNo,
                    /* Tie-breaker: same SequenceNo -> process added first wins */
                    JP.JobBookingJobCardProcessID) AS rn
        FROM InputJobIDs IJ
        INNER JOIN dbo.JobBookingJobCardProcess JP
            ON JP.JobBookingID = IJ.JobBookingID AND JP.CompanyID = @CompanyID
           AND ISNULL(JP.IsDeletedTransaction,0)=0
        INNER JOIN dbo.ProcessMaster PM ON PM.ProcessID = JP.ProcessID AND PM.CompanyID = JP.CompanyID
        LEFT JOIN dbo.JobBookingJobCardContents JC
            ON JC.JobBookingJobCardContentsID = JP.JobBookingJobCardContentsID
        WHERE PM.ProcessName LIKE '%perfect%' OR PM.ProcessName LIKE '%stitch%' OR PM.ProcessName LIKE '%past%'
    ),
    PaperData AS (
        SELECT C.JobBookingID, C.CompType,
            CASE WHEN Q.FieldValue IS NULL AND G.FieldValue IS NULL THEN NULL
                 ELSE ISNULL(Q.FieldValue,'') +
                      CASE WHEN Q.FieldValue IS NOT NULL AND G.FieldValue IS NOT NULL THEN ', ' ELSE '' END +
                      CASE WHEN G.FieldValue IS NOT NULL THEN G.FieldValue + ' GSM' ELSE '' END END AS PaperQuality,
            TRY_CONVERT(INT, G.FieldValue) AS PaperGSM
        FROM Components C
        LEFT JOIN dbo.ItemMasterDetails Q ON Q.ItemID = C.PaperID AND Q.FieldName = 'Quality' AND ISNULL(Q.FieldValue,'')<>''
        LEFT JOIN dbo.ItemMasterDetails G ON G.ItemID = C.PaperID AND G.FieldName = 'GSM'     AND ISNULL(G.FieldValue,'')<>''
        WHERE C.rn_comp = 1
    ),
    CloseSizeCTE AS (
        SELECT C.JobBookingID,
            CASE WHEN L_val.val IS NULL AND H_val.val IS NULL THEN NULL
                 ELSE CASE WHEN L_val.val IS NOT NULL THEN 'L:' + L_val.val ELSE '' END +
                      CASE WHEN L_val.val IS NOT NULL AND H_val.val IS NOT NULL THEN ',' ELSE '' END +
                      CASE WHEN H_val.val IS NOT NULL THEN 'H:' + H_val.val ELSE '' END END AS CloseSize,
            CASE WHEN CHARINDEX('Pages:', C.JobCloseSize) > 0
                 THEN LTRIM(RTRIM(SUBSTRING(C.JobCloseSize, CHARINDEX('Pages:', C.JobCloseSize) + LEN('Pages:'), LEN(C.JobCloseSize))))
                 ELSE NULL END AS TextPages
        FROM Components C
        CROSS APPLY (
            SELECT TOP 1 val FROM (SELECT LTRIM(RTRIM(SUBSTRING(C.JobCloseSize, PATINDEX('%L:%', C.JobCloseSize) + 2, 10))) AS raw) x
            CROSS APPLY (SELECT CASE WHEN PATINDEX('%[^0-9.]%', x.raw + 'X') > 1
                                     THEN LEFT(x.raw, PATINDEX('%[^0-9.]%', x.raw + 'X') - 1) ELSE NULL END AS val) y
            WHERE PATINDEX('%L:%', C.JobCloseSize) > 0
        ) L_val
        CROSS APPLY (
            SELECT TOP 1 val FROM (SELECT LTRIM(RTRIM(SUBSTRING(C.JobCloseSize, PATINDEX('%H:%', C.JobCloseSize) + 2, 10))) AS raw) x
            CROSS APPLY (SELECT CASE WHEN PATINDEX('%[^0-9.]%', x.raw + 'X') > 1
                                     THEN LEFT(x.raw, PATINDEX('%[^0-9.]%', x.raw + 'X') - 1) ELSE NULL END AS val) y
            WHERE PATINDEX('%H:%', C.JobCloseSize) > 0
        ) H_val
        WHERE C.CompType = 'Text' AND C.rn_comp = 1
    ),
    TextColorCTE AS (
        SELECT C.JobBookingID,
            CASE WHEN ISNULL(C.PlanFColor,0) > 0
                 THEN CAST(ISNULL(C.PlanFColor,0) AS NVARCHAR(50)) + ' F-' +
                      ISNULL(dbo.ColorStringFullName(C.JobBookingJobCardContentsID, 'Front', C.CompanyID), '')
                 ELSE NULL END AS FrontColor,
            dbo.ColorStringFullName(C.JobBookingJobCardContentsID, 'Front', C.CompanyID) AS FrontColorName,
            CASE WHEN ISNULL(C.PlanFColor,0) > 0
                 THEN CAST(ISNULL(C.PlanFColor,0) AS NVARCHAR(50)) + ' F-' +
                      ISNULL(dbo.ColorStringFullName(C.JobBookingJobCardContentsID, 'Front', C.CompanyID), '')
                 ELSE dbo.ColorStringFullName(C.JobBookingJobCardContentsID, 'Front', C.CompanyID) END AS TextColor
        FROM Components C
        WHERE C.CompType = 'Text' AND C.rn_comp = 1
    )

    /* ---------- Final projection ---------- */
    SELECT
        IJ.JobBookingNo,
        IJ.JobName,
        IJ.OrderQuantity                                AS TotalOrderQty,
        CS.TextPages,
        TC.TextColor,
        TC.FrontColor,
        TC.FrontColorName,
        CS.CloseSize,
        BS.BindingStyle,

        /* Artwork */
        CASE WHEN AW.FileReceivedDate        = '1900-01-01' THEN NULL ELSE AW.FileReceivedDate        END AS FileReceivedDate,
        CASE WHEN AW.SoftApprovalSentActdate = '1900-01-01' THEN NULL ELSE AW.SoftApprovalSentActdate END AS SoftCopyApprovalSentDate,
        CASE WHEN AW.FinallyApprovedDate     = '1900-01-01' THEN NULL ELSE AW.FinallyApprovedDate     END AS FinalApprovalDate,
        AW.FinallyApproved,

        /* Paper */
        TPaper.PaperQuality                             AS TextPaperQuality,
        TPaper.PaperGSM                                 AS TextPaperGSM,
        CPaper.PaperQuality                             AS CoverPaperQuality,
        CPaper.PaperGSM                                 AS CoverPaperGSM,

        /* Text printing */
        TP.PrintPlanQty                                 AS TextPrintPlanQty,
        TP.PrintDoneQty                                 AS TextPrintDoneQty,
        CASE
            WHEN ISNULL(TP.PrintPlanQty,0)>0 AND (100.0*ISNULL(TP.PrintDoneQty,0)/TP.PrintPlanQty)>80 THEN 100
            WHEN ISNULL(TP.PrintPlanQty,0)>0 THEN ROUND(100.0*ISNULL(TP.PrintDoneQty,0)/TP.PrintPlanQty,1)
            ELSE NULL
        END                                             AS TextPrintCompletionPct,
        CASE
            WHEN ISNULL(TP.PrintPlanQty,0)>0 AND ISNULL(TP.PrintDoneQty,0) >= TP.PrintPlanQty*0.5
            THEN TP.LastPrintActualEnd ELSE NULL
        END                                             AS TextPrintingEndDate,

        /* Cover printing */
        CP.PrintPlanQty                                 AS CoverPrintPlanQty,
        CP.PrintDoneQty                                 AS CoverPrintDoneQty,
        CASE
            WHEN ISNULL(CP.PrintPlanQty,0)>0 AND (100.0*ISNULL(CP.PrintDoneQty,0)/CP.PrintPlanQty)>80 THEN 100
            WHEN ISNULL(CP.PrintPlanQty,0)>0 THEN ROUND(100.0*ISNULL(CP.PrintDoneQty,0)/CP.PrintPlanQty,1)
            ELSE NULL
        END                                             AS CoverPrintCompletionPct,
        CASE
            WHEN ISNULL(CP.PrintPlanQty,0)>0 AND ISNULL(CP.PrintDoneQty,0) >= CP.PrintPlanQty*0.5
            THEN CP.LastPrintActualEnd ELSE NULL
        END                                             AS CoverPrintingEndDate,

        /* Binding */
        BP.BindingPlanQty,
        BP.BindingDoneQty,
        CASE
            WHEN ISNULL(BP.BindingPlanQty,0)>0 AND (100.0*ISNULL(BP.BindingDoneQty,0)/BP.BindingPlanQty)>80 THEN 100
            WHEN ISNULL(BP.BindingPlanQty,0)>0 THEN ROUND(100.0*ISNULL(BP.BindingDoneQty,0)/BP.BindingPlanQty,1)
            WHEN ISNULL(IJ.OrderQuantity,0)>0 AND (100.0*ISNULL(BP.BindingDoneQty,0)/IJ.OrderQuantity)>80 THEN 100
            WHEN ISNULL(IJ.OrderQuantity,0)>0 THEN ROUND(100.0*ISNULL(BP.BindingDoneQty,0)/IJ.OrderQuantity,1)
            ELSE NULL
        END                                             AS BindingCompletionPct,
        BP.BindingEndDate,

        /* GPN / Dispatch */
        LG.GpnQty,
        LG.LastGpnDate,
        DT.DispatchedQty,

        /* Shipment (multi-container aggregated, both DBs merged, separator "|") */
        SA.ContainerNos                                 AS ContainerNo,
        SA.DestinationPorts                             AS DestinationPort,
        SA.Statuses                                     AS ShipmentStatus,
        SA.GateInDates                                  AS GateInDate,
        SA.DepartureDates                               AS DepartureDate,
        SA.OriginalETAs                                 AS OriginalETA,
        SA.RevisedETAs                                  AS RevisedETA,
        SA.Links                                        AS TrackingLink,
        SA.ShipmentSourceDBs                            AS ShipmentSourceDB

    FROM InputJobIDs IJ
    LEFT JOIN ArtworkData      AW     ON AW.JobBookingID     = IJ.JobBookingID AND AW.rn = 1
    LEFT JOIN CompPrint        TP     ON TP.JobBookingID     = IJ.JobBookingID AND TP.CompType = 'Text'
    LEFT JOIN CompPrint        CP     ON CP.JobBookingID     = IJ.JobBookingID AND CP.CompType = 'Cover'
    LEFT JOIN BindingProgress  BP     ON BP.JobBookingID     = IJ.JobBookingID
    LEFT JOIN LastGPN          LG     ON LG.JobBookingID     = IJ.JobBookingID
    LEFT JOIN DispatchTotal    DT     ON DT.JobBookingID     = IJ.JobBookingID
    LEFT JOIN BindingStyleCTE  BS     ON BS.JobBookingID     = IJ.JobBookingID AND BS.rn = 1
    LEFT JOIN PaperData        TPaper ON TPaper.JobBookingID = IJ.JobBookingID AND TPaper.CompType = 'Text'
    LEFT JOIN PaperData        CPaper ON CPaper.JobBookingID = IJ.JobBookingID AND CPaper.CompType = 'Cover'
    LEFT JOIN CloseSizeCTE     CS     ON CS.JobBookingID     = IJ.JobBookingID
    LEFT JOIN TextColorCTE     TC     ON TC.JobBookingID     = IJ.JobBookingID
    LEFT JOIN #JobShipmentAgg  SA     ON SA.JobBookingID     = IJ.JobBookingID
    ORDER BY IJ.JobBookingNo;

    /* ---------- Cleanup ---------- */
    DROP TABLE #PrintingProcs;
    DROP TABLE #BindingProcs;
    DROP TABLE #JobContainerList;
    DROP TABLE #ShipmentMatched;
    DROP TABLE #JobShipmentAgg;
END
GO
