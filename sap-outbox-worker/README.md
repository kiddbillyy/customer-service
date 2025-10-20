# sap-outbox-worker

Publica **PurchaseOrder.Cancelled** desde `Integration.IntegrationOutbox` a Kafka.

## Requisitos

- Tabla `Integration.IntegrationOutbox` con índice único:
  - `CREATE UNIQUE INDEX UX_Outbox_OporCancel ON Integration.IntegrationOutbox (ObjType, DocEntry, EventType) WHERE EventType='PurchaseOrder.Cancelled' AND ObjType=22;`
- El **TransactionNotification** inserta la fila PENDING con `PayloadJson` (JSON del evento) e `IdempotencyKey`.

## Variables de entorno

Ver `.env.example`.

## Ejecutar local

```bash
npm i
cp .env.example .env  # edita credenciales
npm start
