module.exports = {
  // Reclama N filas PENDING de ambos tipos (OC cancelada + pago recibido)
  claimPendingBatch: (n) => `
WITH cte AS (
  SELECT TOP (${n}) OutboxId
  FROM Integration.IntegrationOutbox WITH (READPAST, ROWLOCK, UPDLOCK)
  WHERE Status='PENDING'
    AND EventType IN ('PurchaseOrder.Cancelled','Payment.Received')
  ORDER BY OutboxId
)
UPDATE o
   SET Status='SENDING'
OUTPUT inserted.*
FROM Integration.IntegrationOutbox o
JOIN cte ON cte.OutboxId = o.OutboxId;`,

  // Sanity checks post-commit
  checkOPORCancelled: `SELECT CANCELED FROM OPOR WITH (NOLOCK) WHERE DocEntry=@docEntry;`,
  checkPaymentExists: `SELECT 1 AS ok FROM ORCT WITH (NOLOCK) WHERE DocEntry=@docEntry;`,

  // Estados
  markSent:     `UPDATE Integration.IntegrationOutbox SET Status='SENT', SentAt=SYSDATETIME() WHERE OutboxId=@id;`,
  markDeferred: `UPDATE Integration.IntegrationOutbox SET Status='DEFERRED', RetryCount=RetryCount+1 WHERE OutboxId=@id;`,
  markError:    `UPDATE Integration.IntegrationOutbox SET Status='ERROR', RetryCount=RetryCount+1, ErrorMessage=LEFT(@msg,1000) WHERE OutboxId=@id;`,

  // Reintentos
  requeueSome: (top, maxRetry) => `
UPDATE TOP (${top}) Integration.IntegrationOutbox
   SET Status='PENDING'
 WHERE Status IN ('DEFERRED','ERROR') AND RetryCount < ${maxRetry};`
};
