/*
  dbo.portal_order_processes  (Process Details popup)

  Fix: plan quantity was multiplied by the number of rows in
  JobScheduleReleaseMachineWise for the same content + process, because the
  machine-wise table was LEFT JOINed before SUM(ScheduleQty). Machine-wise
  start/end times are now pre-aggregated with OUTER APPLY, so each
  JobScheduleRelease row is counted exactly once.

  Run on both IndusEnterprise (Kolkata) and IndusEnterprise2 (Ahmedabad).
*/
CREATE OR ALTER PROCEDURE [dbo].[portal_order_processes]
  @JobBookingID INT,
  @LedgerIds dbo.IdList READONLY
AS
BEGIN
  SET NOCOUNT ON;

  /* ---------- Authorization: job must belong to caller's ledgers ---------- */
  IF NOT EXISTS (
    SELECT 1
    FROM dbo.JobBookingJobCard JEJ
    JOIN dbo.JobOrderBooking JOB ON JOB.OrderBookingID = JEJ.OrderBookingID
    WHERE JEJ.JobBookingID = @JobBookingID
      AND JOB.LedgerID IN (SELECT Id FROM @LedgerIds)
      AND ISNULL(JEJ.IsCancel,0)=0
  )
  BEGIN
    RAISERROR('Forbidden: job not linked to your ledgers', 16, 1);
    RETURN;
  END

  /* ---------- Scope: all contents of this job ---------- */
  ;WITH Contents AS (
    SELECT JEJC.JobBookingJobCardContentsID
    FROM dbo.JobBookingJobCardContents JEJC
    WHERE JEJC.JobBookingID = @JobBookingID
  ),

  /* ---------- Identify printing processes ---------- */
  PrintingProcs AS (
    SELECT PM.ProcessID
    FROM dbo.ProcessMaster PM
    WHERE PM.ProcessName LIKE '%Printing%'
  ),

  /* ---------- Schedule rows with machine-wise times collapsed to one row each ----------
     Pre-aggregating JobScheduleReleaseMachineWise stops it from duplicating
     ScheduleQty when a content/process has several machine-wise rows. */
  Schedule AS (
    SELECT
      JSR.ProcessID,
      ISNULL(JSR.ScheduleQty,0)                                           AS ScheduleQty,
      COALESCE(MW.StartTime, JSR.PlannedStartTime)                        AS StartTime,
      COALESCE(MW.EndTime,   JSR.PlannedEndTime)                          AS EndTime
    FROM dbo.JobScheduleRelease JSR
    JOIN Contents C ON C.JobBookingJobCardContentsID = JSR.JobBookingJobCardContentsID
    OUTER APPLY (
      SELECT MIN(JMW.StartTime) AS StartTime,
             MAX(JMW.EndTime)   AS EndTime
      FROM dbo.JobScheduleReleaseMachineWise JMW
      WHERE JMW.JobBookingJobCardContentsID = JSR.JobBookingJobCardContentsID
        AND JMW.ProcessID = JSR.ProcessID
    ) MW
    WHERE ISNULL(JSR.IsDeletedTransaction,0)=0
      AND ISNULL(JSR.IsOnlineProcess,0)=0
  ),

  /* ---------- PRINTING: aggregate across all contents & printing-like processes ---------- */
  PrintingPlan AS (
    SELECT
      SUM(S.ScheduleQty)                                                  AS PlanQty,
      MIN(S.StartTime)                                                    AS PlanStart,
      MAX(S.EndTime)                                                      AS PlanEnd
    FROM Schedule S
    WHERE S.ProcessID IN (SELECT ProcessID FROM PrintingProcs)
  ),
  PrintingActual AS (
    SELECT
      SUM(ISNULL(PE.ProductionQuantity,0))                                AS ActualQty,
      MAX(TRY_CONVERT(datetime, PE.ToTime))                               AS ActualEnd
    FROM dbo.ProductionEntry PE
    JOIN Contents C ON C.JobBookingJobCardContentsID = PE.JobBookingJobCardContentsID
    WHERE PE.ProcessID IN (SELECT ProcessID FROM PrintingProcs)
  ),

  /* ---------- Pick any one printing ProcessID for this job ---------- */
  PrintingAny AS (
    SELECT MIN(JSR.ProcessID) AS ProcessID
    FROM dbo.JobScheduleRelease JSR
    JOIN Contents C ON C.JobBookingJobCardContentsID = JSR.JobBookingJobCardContentsID
    WHERE ISNULL(JSR.IsDeletedTransaction,0)=0
      AND JSR.ProcessID IN (SELECT ProcessID FROM PrintingProcs)
  ),

  /* ---------- NON-PRINT processes: per ProcessID aggregated across contents ---------- */
  NonPrintPlan AS (
    SELECT
      S.ProcessID,
      SUM(S.ScheduleQty)                                                  AS PlanQty,
      MIN(S.StartTime)                                                    AS PlanStart,
      MAX(S.EndTime)                                                      AS PlanEnd
    FROM Schedule S
    WHERE S.ProcessID NOT IN (SELECT ProcessID FROM PrintingProcs)
    GROUP BY S.ProcessID
  ),
  NonPrintActual AS (
    SELECT
      PE.ProcessID,
      SUM(ISNULL(PE.ProductionQuantity,0))                                AS ActualQty,
      MAX(TRY_CONVERT(datetime, PE.ToTime))                               AS ActualEnd
    FROM dbo.ProductionEntry PE
    JOIN Contents C ON C.JobBookingJobCardContentsID = PE.JobBookingJobCardContentsID
    WHERE PE.ProcessID NOT IN (SELECT ProcessID FROM PrintingProcs)
    GROUP BY PE.ProcessID
  ),

  /* ---------- Non-print joined with names ---------- */
  NonPrintJoined AS (
    SELECT
      NPP.ProcessID,
      PM.ProcessName,
      NPP.PlanQty,
      NPP.PlanStart,
      NPP.PlanEnd,
      NPA.ActualQty,
      NPA.ActualEnd
    FROM NonPrintPlan NPP
    LEFT JOIN NonPrintActual NPA ON NPA.ProcessID = NPP.ProcessID
    JOIN dbo.ProcessMaster PM    ON PM.ProcessID = NPP.ProcessID
  ),

  /* ---------- Single PRINTING row (aggregated) with a real ProcessID ---------- */
  PrintingRow AS (
    SELECT
      PAny.ProcessID,                                -- any printing ProcessID for this job
      CAST('Printing' AS NVARCHAR(200)) AS ProcessName,
      PP.PlanQty,
      PP.PlanStart,
      PP.PlanEnd,
      PA.ActualQty,
      PA.ActualEnd
    FROM (SELECT TOP 1 * FROM PrintingPlan) PP
    FULL JOIN (SELECT TOP 1 * FROM PrintingActual) PA ON 1=1
    OUTER APPLY (SELECT TOP 1 ProcessID FROM PrintingAny) PAny
  ),

  /* ---------- Union printing + non-print ---------- */
  AllProcesses AS (
    SELECT ProcessID, ProcessName, PlanQty, PlanStart, PlanEnd, ActualQty, ActualEnd
    FROM NonPrintJoined

    UNION ALL

    SELECT ProcessID, ProcessName, PlanQty, PlanStart, PlanEnd, ActualQty, ActualEnd
    FROM PrintingRow
  ),

  /* ---------- Final shape & status ---------- */
  Final AS (
    SELECT
      ProcessID,
      ProcessName,
      ISNULL(PlanQty,0)   AS PlanQty,
      ISNULL(ActualQty,0) AS ActualQty,
      PlanEnd             AS PlanDate,     -- your UI label "Plan Date"
      ActualEnd           AS ActualDate,   -- your UI label "Act Date"
      CASE
        WHEN ISNULL(PlanQty,0)=0 AND ISNULL(ActualQty,0)=0 THEN 'Not Planned'
        WHEN ISNULL(PlanQty,0)>0 AND ISNULL(ActualQty,0)=0 THEN 'Pending'
        WHEN ISNULL(PlanQty,0)>0 AND ISNULL(ActualQty,0) < 0.9*ISNULL(PlanQty,0) THEN 'In Progress'
        WHEN ISNULL(PlanQty,0)>0 AND ISNULL(ActualQty,0) >= 0.9*ISNULL(PlanQty,0) THEN 'Complete'
        ELSE 'In Progress'
      END AS ProcessStatus,
      CASE
        WHEN ISNULL(PlanQty,0)=0 THEN NULL
        ELSE CAST(ROUND(100.0 * ISNULL(ActualQty,0) / NULLIF(PlanQty,0), 1) AS DECIMAL(7,1))
      END AS CompletionPct
    FROM AllProcesses
  )

  SELECT
    ProcessID,
    ProcessName,
    CompletionPct,
    ProcessStatus,
    PlanDate,
    ActualDate,
    PlanQty,
    ActualQty
  FROM Final
  WHERE ProcessName IS NOT NULL
  ORDER BY
    CASE WHEN ProcessName='Printing' THEN 0 ELSE 1 END,  -- Printing first
    ProcessName;
END
GO
