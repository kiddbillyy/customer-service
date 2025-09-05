# 🚚 OMS Service – Mimbral

El **OMS Service** (Order Management System) es el microservicio encargado de **recibir, consultar y actualizar órdenes**, además de **publicar eventos** hacia Kafka para la orquestación con otros sistemas (integración de clientes, facturación, logística, etc.). Forma parte del ecosistema de microservicios de Mimbral y expone endpoints REST para **crear**, **listar**, **obtener detalle** y **actualizar** órdenes.

---

## 🚀 Tecnologías Utilizadas

- **Node.js** + **Express** – API REST.
- **Microsoft SQL Server (MSSQL)** – Persistencia de órdenes e histórico.
- **Kafka (kafkajs)** – Publicación/consumo de eventos de órdenes y validación de clientes.
- **Docker / Docker Compose** – Contenerización y despliegue.
- **API Gateway** – Seguridad, ruteo y auth centralizada.

---

## ⚙️ Configuración

### Variables de Entorno (`.env`)

| Variable                        | Descripción                                   | Ejemplo                 |
| ------------------------------- | --------------------------------------------- | ----------------------- |
| `PORT`                          | Puerto del servicio OMS                       | `5010`                  |
| `DB_HOST`                       | Host base de datos                            | `localhost`             |
| `DB_USER`                       | Usuario BD                                    | `DEV`                   |
| `DB_PASSWORD`                   | Password BD                                   | `******`                |
| `DB_NAME`                       | Nombre BD                                     | `OMS_SERVICE_DB`        |
| `DB_PORT`                       | Puerto BD (MSSQL)                             | `1433`                  |
| `JWT_SECRET`                    | Clave para validar/generar JWT (si aplica)    | `********`              |
| `KAFKA_BROKER`                  | Broker(s) Kafka separados por coma            | `kafka:9092`            |
| `KAFKA_CLIENT_ID`               | ClientId de kafka                             | `oms-service`           |
| `KAFKA_TOPIC_ORDER`             | Tópico de eventos de órdenes                  | `commerce.order.events` |
| `KAFKA_TOPIC_CUSTOMER_OK`       | Tópico (consumer) confirmación cliente        | `customer-ok`           |
| `KAFKA_TOPIC_CUSTOMER_VALIDATE` | Tópico de validación de cliente (publisher)   | `customer.validations`  |
| `KAFKA_ORDER_ITEMS_LIMIT`       | Límite de ítems enviados en payload de evento | `350`                   |

> **Seguridad**
>
> - Autenticación: **Bearer Token** vía **API Gateway**.
> - Encabezados requeridos: `Authorization: Bearer <token>` y `x-plataforma-id: <id>`.

---

## 🔌 Base URL

- **Prod/Dev** (según entorno): `https://catalogomimbral.loclx.io`
- **Prefijo del MS**: `/api/oms-service`

Ej.: `https://catalogomimbral.loclx.io/api/oms-service/orders`

---

## 📦 Estructura del Proyecto (sugerida)

```
oms-service/
├── .env
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js
└── src/
    ├── config/          # DB/Kafka/config app
    ├── routes/          # Definición de rutas
    ├── controllers/     # Controladores de órdenes
    ├── services/        # Lógica de negocio
    ├── models/          # Acceso a datos MSSQL
    └── utils/           # Kafka, fechas, helpers
```

---

# Endpoints – OMS Service

> **Notas generales**
>
> - **Auth**: `Authorization: Bearer <token>`
> - **Header**: `x-plataforma-id: 1`
> - **Formato**: JSON
> - **valuesInCents**: cuando `true`, los montos se manejan en **centavos**.

## 🧾 Orders

### Crear Orden

**POST** `/orders`

**Body (ejemplo)**

```json
{
  "salesChannelReferenceId": "VTEX-001",
  "u_ref1": "5937343124",
  "orderStatusCode": "CREATED_ON",
  "doctotalsy": 2599900,
  "valuesInCents": true,
  "deliveryDate": "2025-09-05T15:00:00Z",
  "origin": "web",
  "hostname": "mimbral.cl",
  "shippingEstimate": "3db",
  "deliveryCompany": "Bluexpress",
  "fulfillment": {
    "firstName": "Jonathan",
    "lastName": "Molina",
    "email": "jmolina@mimbral.cl",
    "phone": "+56 9 11111111",
    "isCorporate": false,
    "currencyCode": "CLP",
    "documentType": "RUT",
    "document": "20.230.330-7",
    "addressType": "residential",
    "receiverName": "Marcelo Cancino",
    "street": "Av. Chorrillo",
    "number": "3117",
    "neighborhood": "Chorrillo",
    "city": "San Javier",
    "state": "Maule",
    "country": "CL",
    "postalCode": "3660000",
    "referenceAddress": "En ferretería Mimbral",
    "notes": "Entregar en Servicio al cliente"
  },
  "items": [
    {
      "itemIndex": 0,
      "uniqueId": "6B2C0D4E1FBB4E8BB6C9C8A5F7C2F101",
      "itemcode": "32080001",
      "dscription": "Parrilla a Carbón 18\" Backyard",
      "quantity": 1,
      "priceAfterVAT": 899900,
      "codebars": "7800000000012",
      "imageUrl": "https://cdn.example.com/img/parrilla-18.jpg",
      "categoryLeafId": 3081,
      "categoryLeafName": "Parrillas",
      "categoryPathIds": "/3005/3081/",
      "categoryPathNames": "Jardín y Terraza > Parrillas"
    },
    {
      "itemIndex": 1,
      "uniqueId": "9A1F2B3C4D5E46F7A8B9C0D1E2F3A4B5",
      "itemcode": "36429999",
      "dscription": "Set de Utensilios de Parrilla 4 piezas",
      "quantity": 2,
      "priceAfterVAT": 19990,
      "codebars": "7800000000456",
      "imageUrl": "https://cdn.example.com/img/utensilios-parrilla-4p.jpg",
      "categoryLeafId": 3642,
      "categoryLeafName": "Accesorios de parrilla",
      "categoryPathIds": "/3005/3081/3642/",
      "categoryPathNames": "Jardín y Terraza > Parrillas > Accesorios de parrilla"
    },
    {
      "itemIndex": 2,
      "uniqueId": "A0B1C2D3E4F5061728394A5B6C7D8E9F",
      "itemcode": "42610001",
      "dscription": "Cortina de Baño Antihongos 180x180cm",
      "quantity": 1,
      "priceAfterVAT": 12990,
      "codebars": "7800000000789",
      "imageUrl": "https://cdn.example.com/img/cortina-bano-180x180.jpg",
      "categoryLeafId": 3313,
      "categoryLeafName": "Cortinas de baño",
      "categoryPathIds": "/426/3033/3313/",
      "categoryPathNames": "Baño > Toallas, Cortinas y Pisos de Baño > Cortinas de baño"
    }
  ]
}
```

**201 CREATED**

```json
{ "ok": true, "message": "Order creada", "data": { "orderID": 20 } }
```

---

### Actualizar Orden

**PATCH** `/orders/{id}`

**Body (ejemplo)**

```json
{
  "orderStatusCode": "READY",
  "doctotalsy": 1999000,
  "deliveryDate": "2025-09-15",
  "shippingEstimate": "4bd",
  "deliveryCompany": "BlueExpress"
  /* Opcional: "fulfillment": { ... } */
}
```

**200 OK**

```json
{ "ok": true, "message": "Order actualizada" }
```

---

### Listar Órdenes (paginado)

**GET** `/orders`

#### Parámetros comunes (también aplican a `/orders/:id`)


| parámetro            | tipo | default | descripción                       |
| -------------------- | ---- | ------- | --------------------------------- |
| `includeItems`       | bool | `true`  | Incluir arreglo de ítems.         |
| `includeFulfillment` | bool | `true`  | Incluir datos de fulfillment.     |
| `includeHistory`     | bool | `true`  | Incluir historial de estados.     |
| `valuesInCents`      | bool | `true`  | Montos en centavos o en unidades. |

### Parámetros de identificación (modo detalle)

- **Ruta**: `GET /orders/:id` → busca por `orderID` (ej.: `/orders/12345`).
- **Query**: `GET /orders?salesChannelReferenceId=XXX&u_ref1=YYY`

| parámetro                 | tipo   | default | descripción                                         |
| ------------------------- | ------ | ------- | --------------------------------------------------- |
| `salesChannelReferenceId` | string | —       | Filtra por canal de ventas.                         |
| `u_ref1`                  | string | —       | Filtra por referencia interna.                      |
| `statusId`                | int    | —       | Filtra por `orderStatusID`.                         |
| `statusCode`              | string | —       | Filtra por código de estado (`NEW`, `READY`, etc.). |
| `createdFrom`             | date   | —       | Fecha de creación desde (>=).                       |
| `createdTo`               | date   | —       | Fecha de creación hasta (<).                        |
| `search`                  | string | —       | Busca por `u_ref1` con `LIKE %search%`.             |

### Paginación (solo `/orders`)

| parámetro  | tipo | default | límites              |
| ---------- | ---- | ------- | -------------------- |
| `page`     | int  | `1`     | mínimo 1             |
| `pageSize` | int  | `50`    | mínimo 1, máximo 200 |


## 🧪 Ejemplos Rápidos

- **Lista simple (paginada)**
  ```http
  GET /orders?page=1&pageSize=20
  ```
- **Lista filtrada por estado + fulfillment**
  ```http
  GET /orders?statusCode=READY&includeFulfillment=true&page=2
  ```
- **Detalle por id con ítems pero sin historial**
  ```http
  GET /orders/12345?includeHistory=false
  ```
- **Detalle por par **``** + **``** en unidades**
  ```http
  GET /orders?salesChannelReferenceId=ML&u_ref1=ABC-123&valuesInCents=false
  ```

---

**200 OK (ejemplo mínimo)**

```json
{
  "ok": true,
  "page": 1,
  "pageSize": 20,
  "total": 2,
  "data": [
    {
      "orderID": 20,
      "salesChannelReferenceId": "VTEX-001",
      "u_ref1": "5937343124",
      "orderStatusCode": "CREATED_ON",
      "docTotalSy": 25999,
      "createdAt": "2025-09-05T15:10:00Z"
    }
  ]
}
```

---

### Obtener Detalle por ID

**GET** `/orders/{id}`

- Mismos parámetros **comunes** (`includeItems`, `includeFulfillment`, `includeHistory`, `valuesInCents`).

**Ejemplos**

- Detalle por id con items pero **sin historial**:
  - `GET /orders/12345?includeHistory=false`

**200 OK (ejemplo mínimo)**

```json
{
  "ok": true,
  "data": {
    "orderID": 12345,
    "salesChannelReferenceId": "VTEX-001",
    "u_ref1": "ABC-123",
    "orderStatusCode": "READY",
    "items": [ { "itemcode": "32080001", "quantity": 1 } ],
    "fulfillment": { "city": "San Javier", "country": "CL" },
    "history": [ { "code": "CREATED_ON", "at": "2025-09-05T15:00:00Z" } ]
  }
}
```

---

## 🔔 Eventos Kafka (OMS)

El **OMS Service** publica/consume eventos en Kafka para mantener al ecosistema sincronizado.

### Publisher: `commerce.order.events` (KAFKA\_TOPIC\_ORDER)

- **Acción**: definida por el negocio (ej. `order.created`, `order.updated`).
- **Key**: preferentemente `OrderID`; si no, `SalesChannelReferenceId:URef1`; en último caso `eventId`.
- **Payload (campos relevantes)**:
  - `OrderID`, `SalesChannelReferenceId`, `URef1`
  - `ItemsCount` y (opcional) `Items` **limitado por** `KAFKA_ORDER_ITEMS_LIMIT` (por defecto 100; override típico: `350`).
  - `Fulfillment` **o** `Fulfillments` (si hay arreglo), `FulfillmentsCount`.
  - Metadatos (`StatusChanged`, `ItemsInserted`, `ItemsUpserted`, `ReplaceItems`).
  - Encabezados estándar: `action`, `eventId`, `occurred-at`, `user-id`, `content-type`, `source-ms`.
- **Compresión**: GZIP.
- **Reintentos**: con **backoff exponencial** y `refreshMetadata()` ante errores transitorios (líder no disponible, etc.).

**Snippet (publisher)**

```js
// utils/kafka/OrdersEvents.js (extracto)
await sendBatch(TOPIC, [{
  key: String(key),
  value: JSON.stringify(payload),
  headers: ensureHeaders({
    action,
    eventId,
    'content-type': 'application/json',
    'occurred-at': occurredAt,
    'user-id': userId ?? '',
    'source-ms': 'orders',
  }),
}]);
```

### Publisher: `customer.validations` (KAFKA\_TOPIC\_CUSTOMER\_VALIDATE)

- Emite `valid-customer` con llaves derivadas de `document`/`email`/`SCR:URef1`/`OrderID`.
- Payload contiene `Fulfillment` (normalizado) y varias claves de la orden.

**Snippet (publisher)**

```js
// utils/kafka/OrdersEvents.js (extracto)
await sendBatch(TOPIC_CUSTOMER, [{
  key: String(key),
  value: JSON.stringify(payload),
  headers: ensureHeaders({
    action: 'valid-customer',
    eventId,
    'content-type': 'application/json',
    'occurred-at': occurredAt,
    'user-id': userId ?? '',
    'source-ms': 'orders',
  }),
}]);
```

### Consumer: `customer-ok` (KAFKA\_TOPIC\_CUSTOMER\_OK)

- **Objetivo**: marcar `customerIntegrated=1` cuando un cliente ha sido validado/creado externamente.
- Si llega **NO-OK**, **no** marca integrado; **guarda** `integrationError` con mensaje derivado del payload/headers.
- Maneja booleanos flexibles (`"ok", "true", "si", "sí", "1"`).
- Usa transacciones MSSQL para asegurar consistencia.

**Snippet (consumer)**

```js
// utils/kafka/consumers/CustomerOkConsumer.js (extracto)
await consumer.subscribe({ topic: TOPIC_CUSTOMER_OK, fromBeginning: false });
await consumer.run({ eachMessage: async ({ message }) => {
  try { await handleCustomerOk(message); }
  catch (e) { console.error('Error procesando customer-ok:', e); }
}});
```

### Envío con reintentos

```js
// utils/kafkaProducer.js (extracto)
await p.send({ topic, messages, acks: 1, timeout: 30000, compression: CompressionTypes.GZIP });
// Reintenta ante errores transitorios (NOT_LEADER, REQUEST_TIMED_OUT, ...)
```

---

## 🐳 Ejecutar con Docker

### Dockerfile

```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 5010
CMD ["npm", "start"]
```

### docker-compose.yml (fragmento)

```yaml
version: '3.8'

networks:
  oms_kafka_network:
    external: true

services:
  oms-service:
    build: .
    container_name: oms-service
    restart: always
    ports:
      - "5010:5010"
    environment:
      PORT: 5010
      DB_HOST: host.docker.internal
      DB_USER: DEV
      DB_PASSWORD: 1234
      DB_NAME: OMS_SERVICE_DB
      DB_PORT: 1433
      JWT_SECRET: mysupersecretkey
      KAFKA_BROKER: kafka:9092
      KAFKA_CLIENT_ID: oms-service
      KAFKA_TOPIC_ORDER: commerce.order.events
      KAFKA_TOPIC_CUSTOMER_OK: customer-ok
      KAFKA_TOPIC_CUSTOMER_VALIDATE: customer.validations
      KAFKA_ORDER_ITEMS_LIMIT: 350
    networks:
      - oms_kafka_network
```

---

## ✅ Buenas Prácticas y Consideraciones

- **Idempotencia** en POST: usar `salesChannelReferenceId + u_ref1` como llave natural cuando corresponda.
- **Historial**: cada cambio de `orderStatusCode` debe registrarse en `history` con fecha/hora y usuario/origen.
- **Escalabilidad**: limitar `Items` en eventos (ver `KAFKA_ORDER_ITEMS_LIMIT`) y paginar siempre en listados grandes.
- **Errores de Integración**: registrar mensajes en `integrationError` para diagnóstico (consumer `customer-ok`).
- **Monitoreo**: loggear `eventId`, `occurred-at` y `action` para trazabilidad end-to-end.

---

## 🔐 Headers de Ejemplo

```
Authorization: Bearer <token>
x-plataforma-id: 1
Content-Type: application/json
```

---

## 📎 Anexos (fragmentos de código)

> **Normalización de ítems y fulfillment** en eventos para payloads compactos y consistentes:

```js
function pickItemFields(i = {}) { /* ... */ }
function pickOrderFillments(o = {}) { /* ... */ }
```

> **Backoff exponencial** al publicar mensajes:

```js
const RETRIABLE = /LEADER_NOT_AVAILABLE|NOT_LEADER|NOT_LEADER_OR_FOLLOWER|COORDINATOR_NOT_AVAILABLE|REQUEST_TIMED_OUT/i;
```

---

**© Mimbral – OMS Service**

